from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_PATH = BASE_DIR / "data" / "dataset.csv"
MODEL_PATH = Path(__file__).resolve().parent / "model.pkl"
ENCODER_PATH = Path(__file__).resolve().parent / "encoder.pkl"

CATEGORY_MAP = {"GM": 0, "OBC": 1, "SC/ST": 2}
BRANCH_MAP = {"CSE": 0, "ISE": 1, "ECE": 2, "AIML": 3}


class UnknownModelError(ValueError):
    """Raised when an unsupported model type is selected."""


def _get_model(model_name: str):
    model_name = model_name.lower().strip()
    if model_name == "random_forest":
        return RandomForestClassifier(n_estimators=250, random_state=42)
    if model_name == "decision_tree":
        return DecisionTreeClassifier(max_depth=12, random_state=42)
    if model_name == "logistic_regression":
        return LogisticRegression(max_iter=1000, multi_class="auto")
    raise UnknownModelError(
        "model_name must be one of: random_forest, decision_tree, logistic_regression"
    )


def train_and_save(model_name: str = "random_forest") -> dict:
    data = pd.read_csv(DATA_PATH)

    data["category"] = data["category"].str.upper().map(CATEGORY_MAP)
    data["branch"] = data["branch"].str.upper().map(BRANCH_MAP)

    if data[["category", "branch"]].isnull().any().any():
        raise ValueError("dataset.csv has invalid category/branch values.")

    x = data[["rank", "category", "branch"]]
    y = data["college"]

    x_train, x_test, y_train, y_test = train_test_split(
        x, y, test_size=0.2, random_state=42, stratify=y
    )

    model = _get_model(model_name)
    model.fit(x_train, y_train)

    y_pred = model.predict(x_test)
    accuracy = accuracy_score(y_test, y_pred)

    joblib.dump(model, MODEL_PATH)
    joblib.dump(
        {
            "category_map": CATEGORY_MAP,
            "branch_map": BRANCH_MAP,
            "feature_order": ["rank", "category", "branch"],
        },
        ENCODER_PATH,
    )

    return {
        "model_type": model_name,
        "accuracy": round(float(accuracy), 4),
        "model_path": str(MODEL_PATH),
        "encoder_path": str(ENCODER_PATH),
        "rows": int(len(data)),
    }


if __name__ == "__main__":
    result = train_and_save(model_name="random_forest")
    print("Training complete")
    print(result)
