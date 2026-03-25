PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS colleges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    college_name TEXT NOT NULL,
    location TEXT NOT NULL,
    ranking INTEGER,
    average_package REAL,
    UNIQUE(college_name, location)
);

CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS cutoffs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    college_id INTEGER NOT NULL,
    branch_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    year INTEGER NOT NULL,
    cutoff_rank INTEGER NOT NULL,
    FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CHECK (category IN ('GM', 'OBC', 'SC/ST')),
    CHECK (year BETWEEN 2021 AND 2024),
    CHECK (cutoff_rank > 0),
    UNIQUE(college_id, branch_id, category, year)
);

CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    rank_entered INTEGER NOT NULL,
    category TEXT NOT NULL,
    branch TEXT NOT NULL,
    prediction_result TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CHECK (rank_entered > 0),
    CHECK (category IN ('GM', 'OBC', 'SC/ST')),
    CHECK (branch IN ('CSE', 'ISE', 'ECE', 'AIML'))
);

CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL,
    average_salary REAL NOT NULL,
    placement_percentage REAL NOT NULL,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CHECK (average_salary >= 0),
    CHECK (placement_percentage >= 0 AND placement_percentage <= 100),
    UNIQUE(branch_id)
);

CREATE INDEX IF NOT EXISTS idx_cutoffs_branch_category_year
    ON cutoffs(branch_id, category, year);

CREATE INDEX IF NOT EXISTS idx_predictions_user_created
    ON predictions(user_id, created_at DESC);
