from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np

MODEL_DIR = Path(__file__).resolve().parent.parent / "model"
MODEL_PATH = MODEL_DIR / "model.pkl"
ENCODER_PATH = MODEL_DIR / "encoder.pkl"


class ModelNotReadyError(RuntimeError):
    """Raised when trained model artifacts are missing."""


@lru_cache(maxsize=1)
def _load_artifacts() -> tuple:
    if not MODEL_PATH.exists() or not ENCODER_PATH.exists():
        raise ModelNotReadyError(
            "Model artifacts not found. Run backend/model/train_model.py first."
        )

    model = joblib.load(MODEL_PATH)
    encoders = joblib.load(ENCODER_PATH)
    return model, encoders


def predict_college(rank: int, category: str, branch: str) -> dict:
    model, encoders = _load_artifacts()

    category_map = encoders["category_map"]
    branch_map = encoders["branch_map"]

    category_key = category.strip().upper()
    branch_key = branch.strip().upper()

    if category_key not in category_map:
        raise ValueError("Unsupported category.")
    if branch_key not in branch_map:
        raise ValueError("Unsupported branch.")

    features = np.array(
        [[rank, category_map[category_key], branch_map[branch_key]]],
        dtype=float,
    )

    prediction = model.predict(features)[0]

    confidence = None
    if hasattr(model, "predict_proba"):
        probabilities = model.predict_proba(features)[0]
        classes = list(model.classes_)
        class_index = classes.index(prediction)
        confidence = float(probabilities[class_index])

    return {
        "college": str(prediction),
        "confidence": round(confidence, 4) if confidence is not None else None,
    }
