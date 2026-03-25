from collections import defaultdict


def _confidence_to_score(confidence: float | None) -> float:
    if confidence is None:
        return 0.5
    return max(0.0, min(1.0, confidence))


def build_recommendations(
    predictions: list[dict],
    user_rank: int,
    previous_test_scores: list[float] | None = None,
) -> dict:
    test_scores = previous_test_scores or []
    avg_test_score = sum(test_scores) / len(test_scores) if test_scores else 0.0

    rank_factor = 1.0 if user_rank <= 3000 else 0.8 if user_rank <= 7000 else 0.6
    test_factor = 0.6 + (avg_test_score / 100.0) * 0.4 if test_scores else 0.7

    ranked = []
    branch_scores: dict[str, float] = defaultdict(float)

    for item in predictions:
        base = _confidence_to_score(item.get("confidence"))
        chance = str(item.get("chance", "Low")).lower()
        chance_boost = {"high": 1.0, "medium": 0.75, "low": 0.45}.get(chance, 0.5)
        score = round(base * chance_boost * rank_factor * test_factor, 4)

        ranked.append(
            {
                "college": item.get("college"),
                "branch": item.get("branch"),
                "score": score,
                "reason": "Combined model confidence, admission chance, rank strength, and test history.",
            }
        )

        branch = str(item.get("branch", "")).upper()
        if branch:
            branch_scores[branch] = max(branch_scores[branch], score)

    ranked.sort(key=lambda row: row["score"], reverse=True)

    top_branches = sorted(branch_scores.items(), key=lambda kv: kv[1], reverse=True)

    return {
        "best_colleges": ranked[:5],
        "best_branches": [
            {"branch": branch, "score": score}
            for branch, score in top_branches[:3]
        ],
        "meta": {
            "average_test_score": round(avg_test_score, 2),
            "rank_factor": rank_factor,
            "test_factor": round(test_factor, 3),
        },
    }
