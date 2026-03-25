import json
import os
import random
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from flask import Blueprint, current_app, jsonify, request

from utils.validators import ValidationError

mocktest_bp = Blueprint("mocktest", __name__)

QUESTION_FILE = Path(__file__).resolve().parent.parent / "data" / "questions.json"
TEST_DURATION_SECONDS = 10 * 60
ACTIVE_TESTS: dict[str, dict] = {}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _load_question_bank() -> dict:
    with QUESTION_FILE.open("r", encoding="utf-8") as fp:
        return json.load(fp)


def _generate_from_openai(subject: str, difficulty: str, count: int = 10) -> list[dict]:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured.")

    prompt = (
        "Generate {count} KCET-level multiple choice questions in strict JSON array format. "
        "Each item must have: question (string), options (list of 4 strings), "
        "correct_answer (string), explanation (string). "
        "Subject: {subject}. Difficulty: {difficulty}."
    ).format(count=count, subject=subject, difficulty=difficulty)

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
            "temperature": 0.3,
            "response_format": {"type": "json_object"},
        },
        timeout=20,
    )
    response.raise_for_status()

    content = response.json()["choices"][0]["message"]["content"]
    data = json.loads(content)

    questions = data.get("questions")
    if not isinstance(questions, list):
        raise RuntimeError("OpenAI did not return a valid questions array.")
    return questions[:count]


def _generate_from_local(subject: str, count: int = 10) -> list[dict]:
    bank = _load_question_bank()
    pool = bank.get(subject.lower(), [])
    if not pool:
        raise ValidationError("No local questions available for selected subject.")

    if len(pool) >= count:
        sampled = random.sample(pool, count)
    else:
        sampled = [random.choice(pool) for _ in range(count)]

    randomized = []
    for item in sampled:
        options = list(item["options"])
        random.shuffle(options)
        randomized.append(
            {
                "question": item["question"],
                "options": options,
                "correct_answer": item["correct_answer"],
                "explanation": item["explanation"],
            }
        )
    return randomized


@mocktest_bp.post("/generate-test")
def generate_test():
    try:
        payload = request.get_json(silent=True) or {}
        subject = str(payload.get("subject", "maths")).strip().lower()
        difficulty = str(payload.get("difficulty", "medium")).strip().lower()
        use_ai = bool(payload.get("use_ai", False))

        if subject not in {"physics", "chemistry", "maths"}:
            raise ValidationError("subject must be physics, chemistry, or maths.")
        if difficulty not in {"easy", "medium", "hard"}:
            raise ValidationError("difficulty must be easy, medium, or hard.")

        generated_by = "local"
        try:
            questions = _generate_from_openai(subject=subject, difficulty=difficulty) if use_ai else _generate_from_local(subject)
            if use_ai:
                generated_by = "openai"
        except Exception as exc:
            current_app.logger.warning("Falling back to local question bank: %s", exc)
            questions = _generate_from_local(subject)

        test_id = str(uuid.uuid4())
        started_at = _now_utc()
        expires_at = started_at + timedelta(seconds=TEST_DURATION_SECONDS)

        ACTIVE_TESTS[test_id] = {
            "started_at": started_at,
            "expires_at": expires_at,
            "questions": questions,
            "subject": subject,
            "difficulty": difficulty,
            "generated_by": generated_by,
        }

        public_questions = [
            {
                "id": idx,
                "question": q["question"],
                "options": q["options"],
            }
            for idx, q in enumerate(questions)
        ]

        return jsonify(
            {
                "test_id": test_id,
                "subject": subject,
                "difficulty": difficulty,
                "generated_by": generated_by,
                "duration_seconds": TEST_DURATION_SECONDS,
                "started_at": started_at.isoformat(),
                "expires_at": expires_at.isoformat(),
                "questions": public_questions,
            }
        )

    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        current_app.logger.exception("Failed to generate test: %s", exc)
        return jsonify({"error": "Failed to generate test."}), 500


@mocktest_bp.post("/submit-test")
def submit_test():
    try:
        payload = request.get_json(silent=True) or {}
        test_id = str(payload.get("test_id", "")).strip()
        answers = payload.get("answers", [])

        if not test_id:
            raise ValidationError("test_id is required.")
        if not isinstance(answers, list):
            raise ValidationError("answers must be an array.")

        test = ACTIVE_TESTS.get(test_id)
        if not test:
            return jsonify({"error": "Invalid or expired test_id."}), 404

        now = _now_utc()
        timed_out = now > test["expires_at"]

        submitted_answers = {}
        for answer in answers:
            if not isinstance(answer, dict):
                continue
            qid = answer.get("id")
            selected = answer.get("selected_option")
            if isinstance(qid, int) and isinstance(selected, str):
                submitted_answers[qid] = selected

        correct = 0
        wrong = 0
        review = []

        for idx, question in enumerate(test["questions"]):
            selected = submitted_answers.get(idx)
            is_correct = selected == question["correct_answer"]

            if selected is None:
                wrong += 1
            elif is_correct:
                correct += 1
            else:
                wrong += 1

            review.append(
                {
                    "id": idx,
                    "question": question["question"],
                    "selected_option": selected,
                    "correct_answer": question["correct_answer"],
                    "is_correct": is_correct,
                    "explanation": question["explanation"],
                }
            )

        total = len(test["questions"])
        percentage = round((correct / total) * 100, 2) if total else 0.0

        del ACTIVE_TESTS[test_id]

        return jsonify(
            {
                "test_id": test_id,
                "auto_submitted": timed_out,
                "score": correct,
                "correct_count": correct,
                "wrong_count": wrong,
                "percentage": percentage,
                "total_questions": total,
                "review": review,
            }
        )

    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        current_app.logger.exception("Failed to submit test: %s", exc)
        return jsonify({"error": "Failed to submit test."}), 500
