from __future__ import annotations

import json
import os
import random
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import requests
from flask import Blueprint, current_app, jsonify, request

from database.db import get_db
from utils.validators import ValidationError

mocktest_bp = Blueprint("mocktest", __name__)

QUESTION_FILE = Path(__file__).resolve().parent.parent / "data" / "questions.json"
ACTIVE_QUIZZES: dict[str, dict] = {}
QUIZ_VARIANT_COUNT = 3
SUBJECTS = ["Physics", "Chemistry", "Math"]
SUBJECT_KEY_MAP = {"Physics": "physics", "Chemistry": "chemistry", "Math": "maths"}
DIFFICULTY_CONFIG = {
    "easy": {
        "question_count": 10,
        "title": "Easy",
        "description": "Basic concept questions",
        "focus": "Direct recall and foundational understanding",
    },
    "medium": {
        "question_count": 12,
        "title": "Medium",
        "description": "Application-based",
        "focus": "Concept plus application with moderate reasoning",
    },
    "hard": {
        "question_count": 15,
        "title": "Hard",
        "description": "Analytical and multi-step",
        "focus": "Advanced problem solving and layered reasoning",
    },
}
QUIZ_VARIANTS = [
    {"title": "Quiz 1", "focus": "Quick concept check"},
    {"title": "Quiz 2", "focus": "Balanced practice mix"},
    {"title": "Quiz 3", "focus": "Challenge round"},
]


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _load_question_bank() -> dict:
    with QUESTION_FILE.open("r", encoding="utf-8") as fp:
        return json.load(fp)


def _normalize_subject(subject: str) -> str:
    value = str(subject or "").strip().lower()
    if value in {"math", "maths"}:
        return "Math"
    if value == "physics":
        return "Physics"
    if value == "chemistry":
        return "Chemistry"
    return str(subject).strip().title() or "General"


def _question_count_for_difficulty(difficulty: str) -> int:
    return DIFFICULTY_CONFIG[difficulty]["question_count"]


def _subject_distribution(total_questions: int) -> list[int]:
    base = total_questions // len(SUBJECTS)
    remainder = total_questions % len(SUBJECTS)
    return [base + (1 if index < remainder else 0) for index in range(len(SUBJECTS))]


def _normalize_question(item: dict, fallback_subject: str) -> dict:
    options = [str(option).strip() for option in item.get("options", []) if str(option).strip()]
    if len(options) < 4:
        raise ValidationError("Each question must include at least four options.")

    options = options[:4]
    correct_answer = str(item.get("correct_answer", "")).strip()
    if not correct_answer:
        raise ValidationError("Each question must include a correct answer.")

    question_text = str(item.get("question", "")).strip()
    if not question_text:
        raise ValidationError("Each question must include question text.")

    option_pool = list(options)
    random.shuffle(option_pool)
    if correct_answer not in option_pool:
        option_pool[-1] = correct_answer

    correct_index = option_pool.index(correct_answer)
    subject_name = _normalize_subject(item.get("subject", fallback_subject))

    return {
        "subject": subject_name,
        "question": question_text,
        "options": option_pool,
        "correct_answer": option_pool[correct_index],
        "correct_index": correct_index,
        "explanation": str(item.get("explanation", "")).strip() or "Review the concept and retry the question.",
    }


def _generate_from_openai(difficulty: str, question_count: int, variant_index: int) -> list[dict]:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured.")

    config = DIFFICULTY_CONFIG[difficulty]
    variant = QUIZ_VARIANTS[variant_index]
    prompt = (
        "Generate {question_count} KCET multiple choice questions for a {difficulty} quiz. "
        "Focus on {focus}. Mix Physics, Chemistry, and Math throughout the quiz. "
        "Return valid JSON with a top-level 'questions' array. Each question must have: "
        "subject, question, options (exactly 4 strings), correct_answer, and explanation. "
        "Difficulty style: {description}. Variant: {variant_title} - {variant_focus}. "
        "Keep the wording concise and the explanations short."
    ).format(
        question_count=question_count,
        difficulty=difficulty,
        focus=config["focus"],
        description=config["description"],
        variant_title=variant["title"],
        variant_focus=variant["focus"],
    )

    response = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": "You generate valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.35,
            "response_format": {"type": "json_object"},
        },
        timeout=30,
    )
    response.raise_for_status()

    content = response.json()["choices"][0]["message"]["content"]
    data = json.loads(content)
    questions = data.get("questions") if isinstance(data, dict) else data
    if not isinstance(questions, list):
        raise RuntimeError("OpenAI did not return a valid questions array.")

    normalized_questions = []
    for item in questions[:question_count]:
        normalized_questions.append(_normalize_question(item, str(item.get("subject", ""))))

    if len(normalized_questions) < question_count:
        raise RuntimeError("OpenAI returned too few questions.")
    return normalized_questions


def _generate_from_local(difficulty: str, question_count: int, variant_index: int) -> list[dict]:
    bank = _load_question_bank()
    counts = _subject_distribution(question_count)
    questions: list[dict] = []

    for subject_name, subject_count in zip(SUBJECTS, counts):
        pool = bank.get(SUBJECT_KEY_MAP[subject_name], [])
        if not pool:
            raise ValidationError(f"No local questions available for {subject_name}.")

        if len(pool) >= subject_count:
            sampled = random.sample(pool, subject_count)
        else:
            sampled = [random.choice(pool) for _ in range(subject_count)]

        for item in sampled:
            questions.append(_normalize_question({**item, "subject": subject_name}, subject_name))

    random.Random(f"{difficulty}-{variant_index}-{question_count}").shuffle(questions)
    return questions


def _generate_quiz_questions(difficulty: str, question_count: int, variant_index: int) -> tuple[list[dict], str]:
    try:
        return _generate_from_openai(difficulty, question_count, variant_index), "openai"
    except Exception as exc:
        current_app.logger.warning("Falling back to local question bank: %s", exc)
        return _generate_from_local(difficulty, question_count, variant_index), "local"


def _serialize_question(question: dict, include_explanation: bool = True) -> dict:
    payload = {
        "id": question["id"],
        "subject": question["subject"],
        "question": question["question"],
        "options": question["options"],
    }
    if include_explanation:
        payload["correct_answer"] = question["correct_answer"]
        payload["correct_index"] = question["correct_index"]
        payload["explanation"] = question["explanation"]
    return payload


def _create_quiz_payload(difficulty: str, quiz_index: int) -> dict:
    question_count = _question_count_for_difficulty(difficulty)
    questions, generated_by = _generate_quiz_questions(difficulty, question_count, quiz_index)
    quiz_id = str(uuid.uuid4())
    duration_seconds = question_count * 60
    variant = QUIZ_VARIANTS[quiz_index]
    title = f"{DIFFICULTY_CONFIG[difficulty]['title']} - {variant['title']}"

    active_quiz = {
        "quiz_id": quiz_id,
        "difficulty": difficulty,
        "quiz_index": quiz_index,
        "title": title,
        "variant_focus": variant["focus"],
        "generated_by": generated_by,
        "duration_seconds": duration_seconds,
        "questions": [{**question, "id": index} for index, question in enumerate(questions)],
    }
    ACTIVE_QUIZZES[quiz_id] = active_quiz

    return {
        "quiz_id": quiz_id,
        "difficulty": difficulty,
        "quiz_index": quiz_index,
        "title": title,
        "variant_focus": variant["focus"],
        "generated_by": generated_by,
        "duration_seconds": duration_seconds,
        "question_count": question_count,
        "questions": [_serialize_question(question) for question in active_quiz["questions"]],
    }


def _build_subject_accuracy(questions: list[dict], submitted_answers: dict[int, int | None]) -> list[dict]:
    subject_totals: dict[str, dict[str, int]] = defaultdict(lambda: {"correct": 0, "total": 0})

    for question in questions:
        subject_name = question["subject"]
        subject_totals[subject_name]["total"] += 1
        selected_index = submitted_answers.get(question["id"])
        if isinstance(selected_index, int) and selected_index == question["correct_index"]:
            subject_totals[subject_name]["correct"] += 1

    summary = []
    for subject_name in SUBJECTS:
        stats = subject_totals.get(subject_name, {"correct": 0, "total": 0})
        total = stats["total"]
        correct = stats["correct"]
        wrong = total - correct
        summary.append(
            {
                "subject": subject_name,
                "correct": correct,
                "wrong": wrong,
                "total": total,
                "accuracy": round((correct / total) * 100, 2) if total else 0.0,
            }
        )
    return summary


def _build_feedback(subject_accuracy: list[dict], percentage: float, time_taken_seconds: int, duration_seconds: int) -> list[str]:
    feedback: list[str] = []
    ordered_subjects = sorted(subject_accuracy, key=lambda row: row["accuracy"])

    if ordered_subjects:
        weakest = ordered_subjects[0]
        if weakest["accuracy"] < 80:
            feedback.append(f"Focus more on {weakest['subject']} concepts.")

    if time_taken_seconds >= int(duration_seconds * 0.85):
        feedback.append("Improve problem-solving speed and answer pacing.")

    if percentage >= 85:
        feedback.append("Great accuracy. Try a harder quiz to push your speed and precision further.")
    elif percentage < 60:
        feedback.append("Revise fundamentals and retake the same difficulty before moving up.")

    if not feedback:
        feedback.append("Keep practicing mixed quizzes to improve consistency.")

    return feedback


def _store_attempt(
    quiz: dict,
    score: int,
    wrong_count: int,
    percentage: float,
    time_taken_seconds: int,
    subject_accuracy: list[dict],
    mistakes: list[dict],
    feedback: list[str],
) -> int:
    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO quiz_attempts (
            quiz_id,
            difficulty,
            quiz_number,
            question_count,
            score,
            wrong_count,
            percentage,
            time_taken_seconds,
            subject_accuracy_json,
            mistakes_json,
            feedback_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            quiz["quiz_id"],
            quiz["difficulty"],
            quiz["quiz_index"] + 1,
            len(quiz["questions"]),
            score,
            wrong_count,
            percentage,
            time_taken_seconds,
            json.dumps(subject_accuracy),
            json.dumps(mistakes),
            json.dumps(feedback),
        ),
    )
    db.commit()
    return int(cursor.lastrowid)


def _clean_username(raw_name: str) -> str:
    name = str(raw_name or "").strip()
    if not name:
        return "You"
    return name[:60]


def _store_leaderboard_score(
    *,
    quiz_attempt_id: int | None,
    quiz_id: str,
    difficulty: str,
    username: str,
    score: int,
    total_questions: int,
    percentage: float,
    time_taken_seconds: int,
) -> int:
    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO leaderboard_scores (
            quiz_attempt_id,
            quiz_id,
            difficulty,
            username,
            score,
            total_questions,
            percentage,
            time_taken_seconds
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            quiz_attempt_id,
            quiz_id,
            difficulty,
            _clean_username(username),
            score,
            total_questions,
            percentage,
            time_taken_seconds,
        ),
    )
    db.commit()
    return int(cursor.lastrowid)


def _load_ranked_leaderboard(difficulty: str, limit: int) -> list[dict]:
    db = get_db()
    rows = db.execute(
        """
        SELECT id, quiz_attempt_id, quiz_id, difficulty, username, score, total_questions,
               percentage, time_taken_seconds, created_at
        FROM leaderboard_scores
        WHERE (? = '' OR difficulty = ?)
        ORDER BY score DESC, time_taken_seconds ASC, created_at ASC, id ASC
        LIMIT ?
        """,
        (difficulty, difficulty, limit),
    ).fetchall()

    leaderboard = []
    for index, row in enumerate(rows, start=1):
        leaderboard.append(
            {
                "entry_id": row["id"],
                "rank": index,
                "quiz_attempt_id": row["quiz_attempt_id"],
                "quiz_id": row["quiz_id"],
                "difficulty": row["difficulty"],
                "username": row["username"],
                "score": row["score"],
                "total_questions": row["total_questions"],
                "percentage": row["percentage"],
                "time_taken_seconds": row["time_taken_seconds"],
                "created_at": row["created_at"],
            }
        )

    return leaderboard


def _format_attempt_row(row) -> dict:
    return {
        "attempt_id": row["id"],
        "quiz_id": row["quiz_id"],
        "difficulty": row["difficulty"],
        "quiz_number": row["quiz_number"],
        "question_count": row["question_count"],
        "score": row["score"],
        "wrong_count": row["wrong_count"],
        "percentage": row["percentage"],
        "time_taken_seconds": row["time_taken_seconds"],
        "subject_accuracy": json.loads(row["subject_accuracy_json"]),
        "mistakes": json.loads(row["mistakes_json"]),
        "feedback": json.loads(row["feedback_json"]),
        "created_at": row["created_at"],
    }


@mocktest_bp.post("/generate-quiz")
def generate_quiz():
    try:
        payload = request.get_json(silent=True) or {}
        difficulty = str(payload.get("difficulty", "medium")).strip().lower()
        quiz_count = int(payload.get("quiz_count", QUIZ_VARIANT_COUNT) or QUIZ_VARIANT_COUNT)
        quiz_count = max(QUIZ_VARIANT_COUNT, min(quiz_count, QUIZ_VARIANT_COUNT))

        if difficulty not in DIFFICULTY_CONFIG:
            raise ValidationError("difficulty must be easy, medium, or hard.")

        quizzes = [_create_quiz_payload(difficulty, index) for index in range(quiz_count)]

        return jsonify(
            {
                "difficulty": difficulty,
                "question_count": _question_count_for_difficulty(difficulty),
                "quiz_count": len(quizzes),
                "quizzes": quizzes,
            }
        )
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        current_app.logger.exception("Failed to generate quiz: %s", exc)
        return jsonify({"error": "Failed to generate quiz."}), 500


@mocktest_bp.post("/submit-quiz")
def submit_quiz():
    try:
        payload = request.get_json(silent=True) or {}
        quiz_id = str(payload.get("quiz_id", "")).strip()
        answers = payload.get("answers", [])
        time_taken_seconds = int(payload.get("time_taken_seconds", 0) or 0)
        auto_submitted = bool(payload.get("auto_submit", False))

        if not quiz_id:
            raise ValidationError("quiz_id is required.")
        if not isinstance(answers, list):
            raise ValidationError("answers must be an array.")

        quiz = ACTIVE_QUIZZES.get(quiz_id)
        if not quiz:
            return jsonify({"error": "Invalid or expired quiz_id."}), 404

        question_count = len(quiz["questions"])
        if time_taken_seconds <= 0:
            time_taken_seconds = quiz["duration_seconds"]
        time_taken_seconds = max(0, min(time_taken_seconds, quiz["duration_seconds"]))

        submitted_answers: dict[int, int | None] = {}
        for answer in answers:
            if not isinstance(answer, dict):
                continue

            question_id = answer.get("question_id", answer.get("id"))
            selected_index = answer.get("selected_index", answer.get("selected_option"))

            if isinstance(question_id, str) and question_id.isdigit():
                question_id = int(question_id)
            if isinstance(selected_index, str) and selected_index.isdigit():
                selected_index = int(selected_index)

            if isinstance(question_id, int):
                submitted_answers[question_id] = selected_index if isinstance(selected_index, int) else None

        review: list[dict] = []
        mistakes: list[dict] = []
        correct_count = 0

        for question in quiz["questions"]:
            selected_index = submitted_answers.get(question["id"])
            selected_answer = None
            if isinstance(selected_index, int) and 0 <= selected_index < len(question["options"]):
                selected_answer = question["options"][selected_index]

            is_correct = isinstance(selected_index, int) and selected_index == question["correct_index"]
            if is_correct:
                correct_count += 1

            review_item = {
                "question_id": question["id"],
                "subject": question["subject"],
                "question": question["question"],
                "options": question["options"],
                "selected_index": selected_index,
                "selected_answer": selected_answer,
                "correct_index": question["correct_index"],
                "correct_answer": question["correct_answer"],
                "is_correct": is_correct,
                "explanation": question["explanation"],
            }
            review.append(review_item)
            if not is_correct:
                mistakes.append(review_item)

        wrong_count = question_count - correct_count
        percentage = round((correct_count / question_count) * 100, 2) if question_count else 0.0
        subject_accuracy = _build_subject_accuracy(quiz["questions"], submitted_answers)
        feedback = _build_feedback(subject_accuracy, percentage, time_taken_seconds, quiz["duration_seconds"])
        attempt_id = _store_attempt(
            quiz,
            correct_count,
            wrong_count,
            percentage,
            time_taken_seconds,
            subject_accuracy,
            mistakes,
            feedback,
        )

        ACTIVE_QUIZZES.pop(quiz_id, None)

        return jsonify(
            {
                "attempt_id": attempt_id,
                "quiz_id": quiz_id,
                "difficulty": quiz["difficulty"],
                "quiz_number": quiz["quiz_index"] + 1,
                "score": correct_count,
                "correct_count": correct_count,
                "wrong_count": wrong_count,
                "percentage": percentage,
                "total_questions": question_count,
                "time_taken_seconds": time_taken_seconds,
                "auto_submitted": auto_submitted or time_taken_seconds >= quiz["duration_seconds"],
                "subject_accuracy": subject_accuracy,
                "mistakes": mistakes,
                "review": review,
                "feedback": feedback,
            }
        )
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        current_app.logger.exception("Failed to submit quiz: %s", exc)
        return jsonify({"error": "Failed to submit quiz."}), 500


@mocktest_bp.get("/quiz-history")
def quiz_history():
    try:
        limit = request.args.get("limit", 12, type=int)
        limit = max(1, min(limit, 50))

        db = get_db()
        rows = db.execute(
            """
            SELECT *
            FROM quiz_attempts
            ORDER BY created_at DESC, id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

        return jsonify({"attempts": [_format_attempt_row(row) for row in rows]})
    except Exception as exc:
        current_app.logger.exception("Failed to load quiz history: %s", exc)
        return jsonify({"error": "Failed to load quiz history."}), 500


@mocktest_bp.get("/quiz-analytics")
def quiz_analytics():
    try:
        difficulty_filter = str(request.args.get("difficulty", "")).strip().lower()
        if difficulty_filter and difficulty_filter not in DIFFICULTY_CONFIG:
            raise ValidationError("difficulty must be easy, medium, or hard.")

        db = get_db()
        rows = db.execute(
            """
            SELECT *
            FROM quiz_attempts
            WHERE (? = '' OR difficulty = ?)
            ORDER BY created_at DESC, id DESC
            """,
            (difficulty_filter, difficulty_filter),
        ).fetchall()

        difficulty_summary = {
            key: {"difficulty": key, "attempts": 0, "correct": 0, "questions": 0, "accuracy": 0.0}
            for key in DIFFICULTY_CONFIG
        }
        subject_summary = {
            subject: {"subject": subject, "correct": 0, "wrong": 0, "total": 0, "accuracy": 0.0}
            for subject in SUBJECTS
        }

        recent_attempts = []
        for row in rows:
            record = _format_attempt_row(row)
            recent_attempts.append(record)

            difficulty_stats = difficulty_summary[record["difficulty"]]
            difficulty_stats["attempts"] += 1
            difficulty_stats["correct"] += record["score"]
            difficulty_stats["questions"] += record["question_count"]

            for subject_row in record["subject_accuracy"]:
                subject_name = subject_row["subject"]
                if subject_name not in subject_summary:
                    continue
                subject_summary[subject_name]["correct"] += subject_row["correct"]
                subject_summary[subject_name]["wrong"] += subject_row["wrong"]
                subject_summary[subject_name]["total"] += subject_row["total"]

        difficulty_summary_list = []
        for difficulty in ["easy", "medium", "hard"]:
            stats = difficulty_summary[difficulty]
            stats["accuracy"] = round((stats["correct"] / stats["questions"]) * 100, 2) if stats["questions"] else 0.0
            difficulty_summary_list.append(stats)

        subject_summary_list = []
        for subject in SUBJECTS:
            stats = subject_summary[subject]
            stats["accuracy"] = round((stats["correct"] / stats["total"]) * 100, 2) if stats["total"] else 0.0
            subject_summary_list.append(stats)

        weak_subjects = sorted(subject_summary_list, key=lambda row: row["accuracy"])
        suggestions = []
        if weak_subjects and weak_subjects[0]["total"]:
            weakest = weak_subjects[0]
            if weakest["accuracy"] < 80:
                suggestions.append(f"Focus more on {weakest['subject']} concepts.")

        if recent_attempts:
            average_time = sum(item["time_taken_seconds"] for item in recent_attempts) / len(recent_attempts)
            average_duration = sum(item["question_count"] * 60 for item in recent_attempts) / len(recent_attempts)
            if average_time >= average_duration * 0.85:
                suggestions.append("Improve problem-solving speed and time management.")

        if not suggestions:
            suggestions.append("Keep taking mixed quizzes to strengthen recall and accuracy.")

        return jsonify(
            {
                "difficulty_summary": difficulty_summary_list,
                "subject_summary": subject_summary_list,
                "weak_subjects": weak_subjects,
                "recent_attempts": recent_attempts[:10],
                "suggestions": suggestions,
            }
        )
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        current_app.logger.exception("Failed to load quiz analytics: %s", exc)
        return jsonify({"error": "Failed to load quiz analytics."}), 500


@mocktest_bp.post("/submit-score")
def submit_score():
    try:
        payload = request.get_json(silent=True) or {}
        quiz_id = str(payload.get("quiz_id", "")).strip()
        difficulty = str(payload.get("difficulty", "")).strip().lower()
        username = _clean_username(payload.get("username", "You"))
        score = int(payload.get("score", 0) or 0)
        total_questions = int(payload.get("total_questions", 0) or 0)
        percentage = float(payload.get("percentage", 0) or 0)
        time_taken_seconds = int(payload.get("time_taken_seconds", 0) or 0)
        attempt_id_raw = payload.get("attempt_id")

        if difficulty not in DIFFICULTY_CONFIG:
            raise ValidationError("difficulty must be easy, medium, or hard.")
        if not quiz_id:
            raise ValidationError("quiz_id is required.")
        if total_questions <= 0:
            raise ValidationError("total_questions must be greater than 0.")
        if score < 0 or score > total_questions:
            raise ValidationError("score must be between 0 and total_questions.")
        if percentage < 0 or percentage > 100:
            raise ValidationError("percentage must be between 0 and 100.")
        if time_taken_seconds < 0:
            raise ValidationError("time_taken_seconds cannot be negative.")

        attempt_id = None
        if isinstance(attempt_id_raw, int):
            attempt_id = attempt_id_raw
        elif isinstance(attempt_id_raw, str) and attempt_id_raw.isdigit():
            attempt_id = int(attempt_id_raw)

        entry_id = _store_leaderboard_score(
            quiz_attempt_id=attempt_id,
            quiz_id=quiz_id,
            difficulty=difficulty,
            username=username,
            score=score,
            total_questions=total_questions,
            percentage=percentage,
            time_taken_seconds=time_taken_seconds,
        )

        ranked = _load_ranked_leaderboard(difficulty, 100)
        your_row = next((row for row in ranked if row["entry_id"] == entry_id), None)

        return jsonify(
            {
                "entry_id": entry_id,
                "rank": your_row["rank"] if your_row else None,
                "message": "Score submitted to leaderboard.",
            }
        )
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        current_app.logger.exception("Failed to submit leaderboard score: %s", exc)
        return jsonify({"error": "Failed to submit leaderboard score."}), 500


@mocktest_bp.get("/leaderboard")
def leaderboard():
    try:
        difficulty = str(request.args.get("difficulty", "")).strip().lower()
        limit = request.args.get("limit", 10, type=int)
        your_entry_id = request.args.get("your_entry_id", type=int)

        if difficulty and difficulty not in DIFFICULTY_CONFIG:
            raise ValidationError("difficulty must be easy, medium, or hard.")

        limit = max(3, min(limit, 100))
        ranked = _load_ranked_leaderboard(difficulty, limit)
        your_result = next((item for item in ranked if item["entry_id"] == your_entry_id), None)

        return jsonify(
            {
                "difficulty": difficulty or "all",
                "entries": ranked,
                "your_result": your_result,
            }
        )
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        current_app.logger.exception("Failed to load leaderboard: %s", exc)
        return jsonify({"error": "Failed to load leaderboard."}), 500


@mocktest_bp.post("/generate-test")
def generate_test():
    """Backward-compatible alias for older mock test clients."""
    return generate_quiz()


@mocktest_bp.post("/submit-test")
def submit_test():
    """Backward-compatible alias for older mock test clients."""
    return submit_quiz()