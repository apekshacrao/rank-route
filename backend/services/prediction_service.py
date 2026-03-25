import json
from typing import Optional

from database.db import get_db


def create_prediction(user_id: int, rank_entered: int, category: str, branch: str, prediction_result: dict) -> int:
    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO predictions (user_id, rank_entered, category, branch, prediction_result)
        VALUES (?, ?, ?, ?, ?)
        """,
        (user_id, rank_entered, category, branch, json.dumps(prediction_result)),
    )
    db.commit()
    return cursor.lastrowid


def get_prediction_by_id(prediction_id: int) -> Optional[dict]:
    db = get_db()
    row = db.execute(
        """
        SELECT id, user_id, rank_entered, category, branch, prediction_result, created_at
        FROM predictions
        WHERE id = ?
        """,
        (prediction_id,),
    ).fetchone()

    if not row:
        return None

    result = dict(row)
    result["prediction_result"] = json.loads(result["prediction_result"])
    return result


def list_predictions_for_user(user_id: int) -> list[dict]:
    db = get_db()
    rows = db.execute(
        """
        SELECT id, user_id, rank_entered, category, branch, prediction_result, created_at
        FROM predictions
        WHERE user_id = ?
        ORDER BY created_at DESC
        """,
        (user_id,),
    ).fetchall()

    data = []
    for row in rows:
        record = dict(row)
        record["prediction_result"] = json.loads(record["prediction_result"])
        data.append(record)
    return data


def update_prediction(prediction_id: int, category: str, branch: str, prediction_result: dict) -> bool:
    db = get_db()
    cursor = db.execute(
        """
        UPDATE predictions
        SET category = ?, branch = ?, prediction_result = ?
        WHERE id = ?
        """,
        (category, branch, json.dumps(prediction_result), prediction_id),
    )
    db.commit()
    return cursor.rowcount > 0


def delete_prediction(prediction_id: int) -> bool:
    db = get_db()
    cursor = db.execute("DELETE FROM predictions WHERE id = ?", (prediction_id,))
    db.commit()
    return cursor.rowcount > 0
