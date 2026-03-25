import json
from functools import lru_cache
from pathlib import Path

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "college_cutoffs.json"


@lru_cache(maxsize=1)
def load_cutoff_data():
    """Load sample cutoff data once and cache it for faster requests."""
    with DATA_FILE.open("r", encoding="utf-8") as file:
        raw_data = json.load(file)

    return raw_data.get("colleges", [])
