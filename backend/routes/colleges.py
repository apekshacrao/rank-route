from flask import Blueprint, jsonify

from services.college_service import build_college_catalog

colleges_bp = Blueprint("colleges", __name__)


@colleges_bp.get("/colleges")
def list_colleges():
	colleges = build_college_catalog()
	return jsonify({"count": len(colleges), "colleges": colleges})
