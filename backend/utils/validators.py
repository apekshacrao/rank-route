class ValidationError(Exception):
    """Custom exception for request validation errors."""


ALLOWED_CATEGORIES = {"GM", "OBC", "SC/ST", "SC", "ST"}
ALLOWED_BRANCHES = {"CSE", "ISE", "ECE", "AIML"}


def validate_prediction_request(payload: dict) -> dict:
    branch_value = payload.get("branch", payload.get("preferred_branch"))
    payload = {**payload, "branch": branch_value}

    required_fields = {"rank", "category", "branch"}
    missing = required_fields - payload.keys()
    if missing:
        missing_fields = ", ".join(sorted(missing))
        raise ValidationError(f"Missing required fields: {missing_fields}")

    rank = payload["rank"]
    if not isinstance(rank, int):
        raise ValidationError("rank must be an integer.")
    if rank <= 0:
        raise ValidationError("rank must be greater than 0.")

    category = str(payload["category"]).strip().upper()
    if category not in ALLOWED_CATEGORIES:
        raise ValidationError("category must be one of GM, OBC, SC/ST.")
    if category in {"SC", "ST"}:
        category = "SC/ST"

    branch = str(payload["branch"]).strip().upper()
    if branch not in ALLOWED_BRANCHES:
        raise ValidationError("branch must be one of CSE, ISE, ECE, AIML.")

    return {
        "rank": rank,
        "category": category,
        "preferred_branch": branch,
        "branch": branch,
    }
