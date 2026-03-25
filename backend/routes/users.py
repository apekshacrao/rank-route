import sqlite3

from flask import Blueprint, current_app, jsonify, request

from services.user_service import (
    authenticate_user,
    create_user,
    delete_user,
    get_user_by_id,
    update_user,
)

users_bp = Blueprint("users", __name__)


@users_bp.post("/users")
def create_user_route():
    try:
        payload = request.get_json(silent=True) or {}
        name = str(payload.get("name", "")).strip()
        email = str(payload.get("email", "")).strip().lower()
        password = str(payload.get("password", "")).strip()

        if not name or not email or not password:
            return jsonify({"error": "name, email, and password are required."}), 400

        user_id = create_user(name=name, email=email, password=password)
        user = get_user_by_id(user_id)
        return jsonify({"message": "User created successfully.", "user": user}), 201

    except sqlite3.IntegrityError:
        return jsonify({"error": "Email already exists."}), 409
    except Exception as exc:
        current_app.logger.exception("Failed to create user: %s", exc)
        return jsonify({"error": "Failed to create user."}), 500


@users_bp.post("/auth/login")
def login_route():
    try:
        payload = request.get_json(silent=True) or {}
        email = str(payload.get("email", "")).strip().lower()
        password = str(payload.get("password", "")).strip()

        if not email or not password:
            return jsonify({"error": "email and password are required."}), 400

        user = authenticate_user(email=email, password=password)
        if not user:
            return jsonify({"error": "Invalid email or password."}), 401

        return jsonify({"message": "Login successful.", "user": user})

    except Exception as exc:
        current_app.logger.exception("Failed to login user: %s", exc)
        return jsonify({"error": "Failed to login user."}), 500


@users_bp.get("/users/<int:user_id>")
def get_user_route(user_id: int):
    try:
        user = get_user_by_id(user_id)
        if not user:
            return jsonify({"error": "User not found."}), 404
        return jsonify({"user": user})
    except Exception as exc:
        current_app.logger.exception("Failed to fetch user %s: %s", user_id, exc)
        return jsonify({"error": "Failed to fetch user."}), 500


@users_bp.put("/users/<int:user_id>")
def update_user_route(user_id: int):
    try:
        payload = request.get_json(silent=True) or {}
        name = str(payload.get("name", "")).strip()
        email = str(payload.get("email", "")).strip().lower()

        if not name or not email:
            return jsonify({"error": "name and email are required."}), 400

        updated = update_user(user_id=user_id, name=name, email=email)
        if not updated:
            return jsonify({"error": "User not found."}), 404

        return jsonify({"message": "User updated successfully.", "user": get_user_by_id(user_id)})

    except sqlite3.IntegrityError:
        return jsonify({"error": "Email already exists."}), 409
    except Exception as exc:
        current_app.logger.exception("Failed to update user %s: %s", user_id, exc)
        return jsonify({"error": "Failed to update user."}), 500


@users_bp.delete("/users/<int:user_id>")
def delete_user_route(user_id: int):
    try:
        deleted = delete_user(user_id)
        if not deleted:
            return jsonify({"error": "User not found."}), 404
        return jsonify({"message": "User deleted successfully."})
    except Exception as exc:
        current_app.logger.exception("Failed to delete user %s: %s", user_id, exc)
        return jsonify({"error": "Failed to delete user."}), 500
