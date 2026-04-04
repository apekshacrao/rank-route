import sqlite3
from pathlib import Path

from flask import Flask, current_app, g
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "kcet_compass.db"
SCHEMA_PATH = BASE_DIR / "schema.sql"
SEED_PATH = BASE_DIR / "seed.sql"


def _ensure_user_password_schema(db):
    """Rename legacy user password storage to hashed_password when needed."""
    columns = {
        row["name"]
        for row in db.execute("PRAGMA table_info(users)").fetchall()
    }

    if "hashed_password" in columns:
        return

    if "password" in columns:
        db.execute("ALTER TABLE users RENAME COLUMN password TO hashed_password")


def _seed_demo_user(db):
    demo_password = "demo_password123"
    hashed_password = generate_password_hash(demo_password, method="scrypt")

    existing = db.execute(
        """
        SELECT id, hashed_password
        FROM users
        WHERE email = ?
        """,
        ("demo@kcetcompass.com",),
    ).fetchone()

    if existing:
        if check_password_hash(existing["hashed_password"], demo_password):
            return

        db.execute(
            """
            UPDATE users
            SET hashed_password = ?
            WHERE id = ?
            """,
            (hashed_password, existing["id"]),
        )
        return

    db.execute(
        """
        INSERT INTO users (name, email, hashed_password)
        VALUES (?, ?, ?)
        """,
        ("Demo User", "demo@kcetcompass.com", hashed_password),
    )


def get_db():
    """Return a request-scoped SQLite connection with row dict support."""
    if "db" not in g:
        connection = sqlite3.connect(DB_PATH)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON;")
        g.db = connection
    return g.db


def close_db(_error=None):
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


def init_database(seed: bool = True):
    """Create tables from SQL schema and optionally insert sample rows."""
    db = get_db()

    with SCHEMA_PATH.open("r", encoding="utf-8") as schema_file:
        db.executescript(schema_file.read())

    _ensure_user_password_schema(db)

    if seed:
        with SEED_PATH.open("r", encoding="utf-8") as seed_file:
            db.executescript(seed_file.read())

        _seed_demo_user(db)

    db.commit()


def init_db_for_app(app: Flask, seed: bool = True):
    app.teardown_appcontext(close_db)

    with app.app_context():
        init_database(seed=seed)
        current_app.logger.info("Database initialized at %s", DB_PATH)
