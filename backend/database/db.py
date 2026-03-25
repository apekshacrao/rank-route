import sqlite3
from pathlib import Path

from flask import Flask, current_app, g

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "kcet_compass.db"
SCHEMA_PATH = BASE_DIR / "schema.sql"
SEED_PATH = BASE_DIR / "seed.sql"


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

    if seed:
        with SEED_PATH.open("r", encoding="utf-8") as seed_file:
            db.executescript(seed_file.read())

    db.commit()


def init_db_for_app(app: Flask, seed: bool = True):
    app.teardown_appcontext(close_db)

    with app.app_context():
        init_database(seed=seed)
        current_app.logger.info("Database initialized at %s", DB_PATH)
