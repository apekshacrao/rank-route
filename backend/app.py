import logging
from pathlib import Path
from flask import Flask, jsonify
from flask_cors import CORS

from database.db import init_db_for_app
from routes.analytics import analytics_bp
from routes.mocktest import mocktest_bp
from routes.predictions import predictions_bp
from routes.predict import predict_bp
from routes.users import users_bp


def create_app() -> Flask:
    """Application factory for KCET Compass backend."""
    frontend_root = Path(__file__).resolve().parent.parent / "frontend"
    app = Flask(__name__, static_folder=str(frontend_root), static_url_path="")

    # Allow frontend apps from other origins (e.g., local static frontend) to call this API.
    CORS(app)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )
    app.logger.setLevel(logging.INFO)

    # Initialize local SQLite database and ensure tables exist.
    init_db_for_app(app, seed=True)

    app.register_blueprint(predict_bp)
    app.register_blueprint(analytics_bp)
    app.register_blueprint(mocktest_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(predictions_bp)

    @app.get("/")
    def serve_index():
        return app.send_static_file("html/index.html")

    @app.get("/api/health")
    def health_check():
        return jsonify(
            {
                "service": "KCET Compass - ML + AI KCET College Predictor",
                "status": "running",
            }
        )

    @app.errorhandler(404)
    def handle_404(_error):
        return jsonify({"error": "Endpoint not found."}), 404

    @app.errorhandler(500)
    def handle_500(error):
        app.logger.exception("Unhandled server error: %s", error)
        return jsonify({"error": "Internal server error."}), 500

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
