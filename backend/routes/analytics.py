from flask import Blueprint, current_app, jsonify, request
from sklearn.linear_model import LinearRegression

from utils.data_loader import load_cutoff_data
from utils.validators import ValidationError

analytics_bp = Blueprint("analytics", __name__)


def _predict_next_year_cutoff(cutoffs: list[int | None], years: list[int]) -> int | None:
    points = [(year, value) for year, value in zip(years, cutoffs) if isinstance(value, int)]
    if len(points) < 2:
        return None

    x = [[year] for year, _ in points]
    y = [value for _, value in points]
    model = LinearRegression()
    model.fit(x, y)
    predicted = model.predict([[max(years) + 1]])[0]
    return max(1, int(round(predicted)))


@analytics_bp.get("/cutoff-trends")
def cutoff_trends():
    """Return 4-year cutoff trends plus next-year forecast."""
    try:
        category = request.args.get("category", "GM").strip().upper()
        branch = request.args.get("branch", "").strip().upper()

        if category in {"SC", "ST"}:
            category = "SC/ST"

        if category not in {"GM", "OBC", "SC/ST"}:
            raise ValidationError("Invalid category. Use GM, OBC, or SC/ST.")

        colleges = load_cutoff_data()
        years = [2021, 2022, 2023, 2024]
        trends = []

        for college in colleges:
            if branch and college["branch"].upper() != branch:
                continue

            trend_by_year = college.get("trends", {}).get(category, {})
            values = [trend_by_year.get(str(year)) for year in years]
            forecast = _predict_next_year_cutoff(values, years)
            trends.append(
                {
                    "college_name": college["college_name"],
                    "branch": college["branch"],
                    "category": category,
                    "cutoffs": values,
                    "predicted_next_year": forecast,
                }
            )

        return jsonify({"years": [str(year) for year in years], "forecast_year": "2025", "trends": trends})

    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        current_app.logger.exception("Failed to fetch cutoff trends: %s", exc)
        return jsonify({"error": "Failed to load cutoff trends."}), 500


@analytics_bp.get("/cutoff-forecast")
def cutoff_forecast():
    """Return only next-year cutoff forecast by college/branch/category."""
    try:
        category = request.args.get("category", "GM").strip().upper()
        if category in {"SC", "ST"}:
            category = "SC/ST"
        branch = request.args.get("branch", "").strip().upper()

        if category not in {"GM", "OBC", "SC/ST"}:
            raise ValidationError("Invalid category. Use GM, OBC, or SC/ST.")

        years = [2021, 2022, 2023, 2024]
        forecast = []

        for college in load_cutoff_data():
            if branch and college["branch"].upper() != branch:
                continue

            trend = college.get("trends", {}).get(category, {})
            values = [trend.get(str(year)) for year in years]
            predicted = _predict_next_year_cutoff(values, years)
            if predicted is None:
                continue

            forecast.append(
                {
                    "college_name": college["college_name"],
                    "branch": college["branch"],
                    "category": category,
                    "predicted_cutoff": predicted,
                    "target_year": 2025,
                }
            )

        return jsonify({"forecast": forecast})
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        current_app.logger.exception("Failed to fetch cutoff forecast: %s", exc)
        return jsonify({"error": "Failed to load cutoff forecast."}), 500
