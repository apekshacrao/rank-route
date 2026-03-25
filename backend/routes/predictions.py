from flask import Blueprint, current_app, jsonify, request

from services.prediction_service import (
    create_prediction,
    delete_prediction,
    get_prediction_by_id,
    list_predictions_for_user,
    update_prediction,
)

predictions_bp = Blueprint("predictions", __name__)

_ALLOWED_CATEGORIES = {"GM", "OBC", "SC/ST", "SC", "ST"}
_ALLOWED_BRANCHES = {"CSE", "ISE", "ECE", "AIML"}


def _normalize_category(category: str) -> str:
    value = category.strip().upper()
    if value in {"SC", "ST"}:
        return "SC/ST"
    return value


@predictions_bp.post("/predictions")
def create_prediction_route():
    try:
        payload = request.get_json(silent=True) or {}

        user_id = payload.get("user_id")
        rank_entered = payload.get("rank_entered")
        category = _normalize_category(str(payload.get("category", "")))
        branch = str(payload.get("branch", "")).strip().upper()
        prediction_result = payload.get("prediction_result")

        if not isinstance(user_id, int) or not isinstance(rank_entered, int):
            return jsonify({"error": "user_id and rank_entered must be integers."}), 400
        if category not in _ALLOWED_CATEGORIES:
            return jsonify({"error": "Invalid category. Use GM, OBC, or SC/ST."}), 400
        if branch not in _ALLOWED_BRANCHES:
            return jsonify({"error": "Invalid branch. Use CSE, ISE, ECE, AIML."}), 400
        if not isinstance(prediction_result, dict):
            return jsonify({"error": "prediction_result must be a JSON object."}), 400

        prediction_id = create_prediction(
            user_id=user_id,
            rank_entered=rank_entered,
            category="SC/ST" if category in {"SC", "ST"} else category,
            branch=branch,
            prediction_result=prediction_result,
        )

        return (
            jsonify(
                {
                    "message": "Prediction saved successfully.",
                    "prediction": get_prediction_by_id(prediction_id),
                }
            ),
            201,
        )

    except Exception as exc:
        current_app.logger.exception("Failed to create prediction: %s", exc)
        return jsonify({"error": "Failed to create prediction."}), 500


@predictions_bp.get("/predictions/<int:prediction_id>")
def get_prediction_route(prediction_id: int):
    try:
        prediction = get_prediction_by_id(prediction_id)
        if not prediction:
            return jsonify({"error": "Prediction not found."}), 404
        return jsonify({"prediction": prediction})
    except Exception as exc:
        current_app.logger.exception("Failed to fetch prediction %s: %s", prediction_id, exc)
        return jsonify({"error": "Failed to fetch prediction."}), 500


@predictions_bp.get("/users/<int:user_id>/predictions")
def list_user_predictions_route(user_id: int):
    try:
        return jsonify({"predictions": list_predictions_for_user(user_id)})
    except Exception as exc:
        current_app.logger.exception("Failed to list predictions for user %s: %s", user_id, exc)
        return jsonify({"error": "Failed to fetch predictions."}), 500


@predictions_bp.put("/predictions/<int:prediction_id>")
def update_prediction_route(prediction_id: int):
    try:
        payload = request.get_json(silent=True) or {}
        category = _normalize_category(str(payload.get("category", "")))
        branch = str(payload.get("branch", "")).strip().upper()
        prediction_result = payload.get("prediction_result")

        if category not in _ALLOWED_CATEGORIES:
            return jsonify({"error": "Invalid category. Use GM, OBC, or SC/ST."}), 400
        if branch not in _ALLOWED_BRANCHES:
            return jsonify({"error": "Invalid branch. Use CSE, ISE, ECE, AIML."}), 400
        if not isinstance(prediction_result, dict):
            return jsonify({"error": "prediction_result must be a JSON object."}), 400

        updated = update_prediction(
            prediction_id=prediction_id,
            category="SC/ST" if category in {"SC", "ST"} else category,
            branch=branch,
            prediction_result=prediction_result,
        )

        if not updated:
            return jsonify({"error": "Prediction not found."}), 404

        return jsonify(
            {
                "message": "Prediction updated successfully.",
                "prediction": get_prediction_by_id(prediction_id),
            }
        )

    except Exception as exc:
        current_app.logger.exception("Failed to update prediction %s: %s", prediction_id, exc)
        return jsonify({"error": "Failed to update prediction."}), 500


@predictions_bp.delete("/predictions/<int:prediction_id>")
def delete_prediction_route(prediction_id: int):
    try:
        deleted = delete_prediction(prediction_id)
        if not deleted:
            return jsonify({"error": "Prediction not found."}), 404
        return jsonify({"message": "Prediction deleted successfully."})
    except Exception as exc:
        current_app.logger.exception("Failed to delete prediction %s: %s", prediction_id, exc)
        return jsonify({"error": "Failed to delete prediction."}), 500
