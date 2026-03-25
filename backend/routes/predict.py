import sqlite3

from flask import Blueprint, current_app, jsonify, request

from services.ml_model_service import ModelNotReadyError, predict_college
from services.prediction_service import create_prediction
from services.recommendation_service import build_recommendations
from utils.data_loader import load_cutoff_data
from utils.validators import ValidationError, validate_prediction_request

predict_bp = Blueprint("predict", __name__)


def _chance_label(rank: int, cutoff: int) -> str:
    """Rank-vs-cutoff chance logic.

    Lower rank is better in KCET.
    """
    if rank <= int(cutoff * 0.85):
        return "High"
    if rank <= cutoff:
        return "Medium"
    return "Low"


def _confidence_to_chance(confidence: float | None) -> str:
    if confidence is None:
        return "Medium"
    if confidence >= 0.7:
        return "High"
    if confidence >= 0.45:
        return "Medium"
    return "Low"


def _build_ranked_predictions(
    rank: int,
    category: str,
    branch: str,
    primary_prediction: dict,
    preferred_college: str | None = None,
) -> list[dict]:
    colleges = load_cutoff_data()
    predictions = []

    primary_college = str(primary_prediction["college"])
    primary_confidence = primary_prediction.get("confidence")

    predictions.append(
        {
            "college": primary_college,
            "branch": branch,
            "chance": _confidence_to_chance(primary_confidence),
            "confidence": primary_confidence,
        }
    )

    seen = {primary_college.lower()}
    for college in colleges:
        if preferred_college and preferred_college.lower() not in college["college_name"].lower():
            continue

        if college["branch"].upper() != branch:
            continue

        cutoff = college["cutoffs"].get(category)
        if cutoff is None:
            continue

        college_name = college["college_name"]
        if college_name.lower() in seen:
            continue

        chance = _chance_label(rank, int(cutoff))
        base_conf = {"High": 0.75, "Medium": 0.55, "Low": 0.35}[chance]
        if primary_confidence is not None:
            base_conf = round((base_conf * 0.4) + (float(primary_confidence) * 0.6), 4)

        predictions.append(
            {
                "college": college_name,
                "branch": college["branch"],
                "chance": chance,
                "confidence": base_conf,
                "last_year_cutoff": cutoff,
            }
        )

    chance_order = {"High": 0, "Medium": 1, "Low": 2}
    predictions.sort(
        key=lambda item: (
            chance_order.get(str(item.get("chance", "Low")), 2),
            -(float(item.get("confidence") or 0.0)),
            int(item.get("last_year_cutoff") or 999999),
        )
    )
    return predictions[:10]


@predict_bp.post("/predict")
def predict_colleges():
    try:
        payload = request.get_json(silent=True)
        if payload is None:
            raise ValidationError("Request body must be valid JSON.")

        user_id = payload.get("user_id")
        if user_id is not None and not isinstance(user_id, int):
            raise ValidationError("user_id must be an integer when provided.")

        validated = validate_prediction_request(payload)
        preferred_college = str(payload.get("preferred_college", "")).strip()
        previous_test_scores = payload.get("previous_test_scores", [])
        if not isinstance(previous_test_scores, list):
            raise ValidationError("previous_test_scores must be an array of percentages.")

        ml_result = predict_college(
            rank=validated["rank"],
            category=validated["category"],
            branch=validated["branch"],
        )

        predictions = _build_ranked_predictions(
            rank=validated["rank"],
            category=validated["category"],
            branch=validated["branch"],
            primary_prediction=ml_result,
            preferred_college=preferred_college or None,
        )

        response_input = dict(validated)
        if preferred_college:
            response_input["preferred_college"] = preferred_college

        recommendations = build_recommendations(
            predictions=predictions,
            user_rank=validated["rank"],
            previous_test_scores=[float(score) for score in previous_test_scores if isinstance(score, (int, float))],
        )

        saved_prediction_id = None
        if user_id is not None:
            saved_prediction_id = create_prediction(
                user_id=user_id,
                rank_entered=validated["rank"],
                category=validated["category"],
                branch=validated["branch"],
                prediction_result={
                    "predictions": predictions,
                    "model_prediction": ml_result,
                    "recommendations": recommendations,
                    "preferred_college": preferred_college or None,
                },
            )

        return jsonify(
            {
                "input": response_input,
                "user_id": user_id,
                "predictions": predictions,
                "model_prediction": ml_result,
                "recommendations": recommendations,
                "saved_prediction_id": saved_prediction_id,
            }
        )

    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400
    except ModelNotReadyError as exc:
        return jsonify({"error": str(exc)}), 503
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except sqlite3.IntegrityError:
        return jsonify({"error": "Invalid user_id. User does not exist."}), 400
    except Exception as exc:
        current_app.logger.exception("Prediction failed: %s", exc)
        return jsonify({"error": "Failed to generate prediction."}), 500
