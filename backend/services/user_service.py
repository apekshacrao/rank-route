from typing import Optional

from werkzeug.security import check_password_hash, generate_password_hash

from database.db import get_db


def create_user(name: str, email: str, password: str) -> int:
    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO users (name, email, password)
        VALUES (?, ?, ?)
        """,
        (name, email, generate_password_hash(password)),
    )
    db.commit()
    return cursor.lastrowid


def get_user_by_id(user_id: int) -> Optional[dict]:
    db = get_db()
    row = db.execute(
        """
        SELECT id, name, email, created_at
        FROM users
        WHERE id = ?
        """,
        (user_id,),
    ).fetchone()
    return dict(row) if row else None


def get_user_by_email(email: str) -> Optional[dict]:
    db = get_db()
    row = db.execute(
        """
        SELECT id, name, email, password, created_at
        FROM users
        WHERE email = ?
        """,
        (email.strip().lower(),),
    ).fetchone()
    return dict(row) if row else None


def authenticate_user(email: str, password: str) -> Optional[dict]:
    user = get_user_by_email(email)
    if not user:
        return None
    if not check_password_hash(user["password"], password):
        return None

    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "created_at": user["created_at"],
    }


def update_user(user_id: int, name: str, email: str) -> bool:
    db = get_db()
    cursor = db.execute(
        """
        UPDATE users
        SET name = ?, email = ?
        WHERE id = ?
        """,
        (name, email, user_id),
    )
    db.commit()
    return cursor.rowcount > 0


def delete_user(user_id: int) -> bool:
    db = get_db()
    cursor = db.execute("DELETE FROM users WHERE id = ?", (user_id,))
    db.commit()
    return cursor.rowcount > 0
