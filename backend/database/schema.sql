PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    hashed_password TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS quiz_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    quiz_number INTEGER NOT NULL,
    question_count INTEGER NOT NULL,
    score INTEGER NOT NULL,
    wrong_count INTEGER NOT NULL,
    percentage REAL NOT NULL,
    time_taken_seconds INTEGER NOT NULL,
    subject_accuracy_json TEXT NOT NULL,
    mistakes_json TEXT NOT NULL,
    feedback_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (difficulty IN ('easy', 'medium', 'hard')),
    CHECK (question_count > 0),
    CHECK (score >= 0),
    CHECK (wrong_count >= 0),
    CHECK (percentage >= 0 AND percentage <= 100),
    CHECK (time_taken_seconds >= 0)
);

CREATE TABLE IF NOT EXISTS leaderboard_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_attempt_id INTEGER,
    quiz_id TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    username TEXT NOT NULL,
    score INTEGER NOT NULL,
    total_questions INTEGER NOT NULL,
    percentage REAL NOT NULL,
    time_taken_seconds INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quiz_attempt_id) REFERENCES quiz_attempts(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CHECK (difficulty IN ('easy', 'medium', 'hard')),
    CHECK (score >= 0),
    CHECK (total_questions > 0),
    CHECK (percentage >= 0 AND percentage <= 100),
    CHECK (time_taken_seconds >= 0)
);

CREATE INDEX IF NOT EXISTS idx_cutoffs_branch_category_year
    ON cutoffs(branch_id, category, year);

CREATE INDEX IF NOT EXISTS idx_predictions_user_created
    ON predictions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_created
    ON quiz_attempts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_difficulty_created
    ON quiz_attempts(difficulty, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leaderboard_scores_difficulty_rank
    ON leaderboard_scores(difficulty, score DESC, time_taken_seconds ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_leaderboard_scores_created
    ON leaderboard_scores(created_at DESC);
