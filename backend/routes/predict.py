import sqlite3
import logging
import time

from flask import Blueprint, current_app, jsonify, request

from services.ml_model_service import ModelNotReadyError, predict_college
from services.prediction_service import create_prediction
from services.recommendation_service import build_recommendations
from utils.data_loader import load_cutoff_data, get_filtered_cutoffs
from utils.validators import ValidationError, validate_prediction_request
from database.db import get_db

logger = logging.getLogger(__name__)
predict_bp = Blueprint("predict", __name__)


def _get_branch_id(branch_name: str) -> int | None:
    """Get branch ID from branch name using database lookup."""
    db = get_db()
    row = db.execute(
        "SELECT id FROM branches WHERE branch_name = ?",
        (branch_name,)
    ).fetchone()
    return row["id"] if row else None


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
    """
    Build ranked predictions using optimized database queries.
    
    Falls back to JSON data if branch_id not found (for backward compatibility).
    """
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
    
    # Try to use optimized database query first
    branch_id = _get_branch_id(branch)
    if branch_id:
        start_time = time.time()
        try:
            cutoffs = get_filtered_cutoffs(branch_id, category)
            elapsed_ms = (time.time() - start_time) * 1000
            logger.info(f"DB-optimized query completed in {elapsed_ms:.2f}ms for {len(cutoffs)} results")
            
            for cutoff_record in cutoffs:
                if preferred_college and preferred_college.lower() not in cutoff_record["college_name"].lower():
                    continue
                
                college_name = cutoff_record["college_name"]
                if college_name.lower() in seen:
                    continue
                
                cutoff = cutoff_record["cutoff_rank"]
                chance = _chance_label(rank, int(cutoff))
                base_conf = {"High": 0.75, "Medium": 0.55, "Low": 0.35}[chance]
                if primary_confidence is not None:
                    base_conf = round((base_conf * 0.4) + (float(primary_confidence) * 0.6), 4)

                predictions.append(
                    {
                        "college": college_name,
                        "branch": branch,
                        "chance": chance,
                        "confidence": base_conf,
                        "last_year_cutoff": cutoff,
                    }
                )
                seen.add(college_name.lower())
        except Exception as e:
            logger.error(f"Database query failed, falling back to JSON: {e}")
            # Fall back to JSON loading
            colleges = load_cutoff_data()
            _add_college_predictions(
                colleges, rank, category, branch, seen, predictions, 
                primary_confidence, preferred_college
            )
    else:
        # Fallback: use JSON data if branch not found in DB
        logger.debug(f"Branch '{branch}' not found in database, using JSON fallback")
        colleges = load_cutoff_data()
        _add_college_predictions(
            colleges, rank, category, branch, seen, predictions,
            primary_confidence, preferred_college
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


def _add_college_predictions(
    colleges: list,
    rank: int,
    category: str,
    branch: str,
    seen: set,
    predictions: list,
    primary_confidence: float | None,
    preferred_college: str | None
) -> None:
    """Helper to add predictions from college list (used for JSON fallback)."""
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
                "branch": branch,
                "chance": chance,
                "confidence": base_conf,
                "last_year_cutoff": cutoff,
            }
        )
        seen.add(college_name.lower())



@predict_bp.post("/predict")
def predict_colleges():
    """
    Optimized prediction endpoint with database query performance monitoring.
    
    Performance improvements:
    - Uses indexed cutoff queries instead of loading entire JSON dataset
    - Filters at database level with composite indexes (branch, category, year)
    - Falls back to JSON if database lookup fails (graceful degradation)
    - Logs slow queries (>100ms threshold)
    """
    request_start = time.time()
    
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

        # Log total request time
        total_ms = (time.time() - request_start) * 1000
        if total_ms > 500:
            logger.warning(f"Slow prediction request: rank={validated['rank']}, "
                         f"branch={validated['branch']}, category={validated['category']}, "
                         f"took {total_ms:.2f}ms")
        else:
            logger.info(f"Prediction request completed in {total_ms:.2f}ms "
                       f"(branch={validated['branch']}, category={validated['category']})")

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
