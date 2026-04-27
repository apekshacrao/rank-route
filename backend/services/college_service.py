import json
from functools import lru_cache
from pathlib import Path

from utils.data_loader import load_cutoff_data


COLLEGE_LOCATIONS_FILE = Path(__file__).resolve().parent.parent / "data" / "college_locations.json"


@lru_cache(maxsize=1)
def load_college_locations() -> dict[str, dict]:
	"""Load college location metadata once and cache it."""
	with COLLEGE_LOCATIONS_FILE.open("r", encoding="utf-8") as file:
		raw_data = json.load(file)

	locations = {}
	for item in raw_data.get("colleges", []):
		college_name = str(item.get("college_name", "")).strip().lower()
		if not college_name:
			continue
		locations[college_name] = item

	return locations


def build_college_catalog() -> list[dict]:
	"""Merge cutoff data with coordinates for the interactive map."""
	cutoff_rows = load_cutoff_data()
	locations = load_college_locations()
	colleges: list[dict] = []

	for row in cutoff_rows:
		college_name = str(row.get("college_name", "")).strip()
		location = locations.get(college_name.lower())
		if not college_name or not location:
			continue

		cutoffs = row.get("cutoffs", {}) if isinstance(row.get("cutoffs"), dict) else {}
		colleges.append(
			{
				"college_name": college_name,
				"latitude": float(location["latitude"]),
				"longitude": float(location["longitude"]),
				"area": str(location.get("area", "")).strip(),
				"city": str(location.get("city", "Karnataka")).strip() or "Karnataka",
				"branch": str(row.get("branch", "")).strip().upper(),
				"branches": [str(row.get("branch", "")).strip().upper()],
				"cutoff": cutoffs.get("GM") or next(iter(cutoffs.values()), None),
				"cutoffs": cutoffs,
				"trends": row.get("trends", {}),
			},
		)

	return colleges
