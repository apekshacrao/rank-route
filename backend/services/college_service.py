import json
import csv
from functools import lru_cache
from pathlib import Path


COLLEGE_LOCATIONS_FILE = Path(__file__).resolve().parent.parent / "data" / "college_locations.json"
COLLEGE_CUTOFFS_FILE = Path(__file__).resolve().parent.parent / "data" / "dataset.csv"


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


@lru_cache(maxsize=1)
def load_college_cutoff_rows() -> list[dict]:
	"""Load the full CSV-backed cutoff dataset once and cache it."""
	with COLLEGE_CUTOFFS_FILE.open("r", encoding="utf-8", newline="") as file:
		reader = csv.DictReader(file)
		rows: list[dict] = []
		for row in reader:
			try:
				rank = int(str(row.get("rank", "")).strip())
			except (TypeError, ValueError):
				continue
			college_name = str(row.get("college", "")).strip()
			branch = str(row.get("branch", "")).strip().upper()
			category = str(row.get("category", "")).strip().upper()
			if not college_name or not branch or not category:
				continue
			rows.append(
				{
					"college_name": college_name,
					"branch": branch,
					"category": category,
					"rank": rank,
				},
			)
	return rows


def build_college_catalog() -> list[dict]:
	"""Merge cutoff data with coordinates for the interactive map."""
	cutoff_rows = load_college_cutoff_rows()
	locations = load_college_locations()
	colleges_by_name: dict[str, dict] = {}

	for row in cutoff_rows:
		college_name = str(row.get("college_name", "")).strip()
		location = locations.get(college_name.lower())
		if not college_name or not location:
			continue

		branch = str(row.get("branch", "")).strip().upper()
		category = str(row.get("category", "")).strip().upper()
		rank = int(row.get("rank", 0))
		college = colleges_by_name.setdefault(
			college_name.lower(),
			{
				"college_name": college_name,
				"latitude": float(location["latitude"]),
				"longitude": float(location["longitude"]),
				"area": str(location.get("area", "")).strip(),
				"city": str(location.get("city", "Karnataka")).strip() or "Karnataka",
				"branch": branch,
				"branches": [],
				"cutoff": None,
				"cutoffs": {},
				"branch_cutoffs": {},
			},
		)

		if branch not in college["branches"]:
			college["branches"].append(branch)

		branch_cutoffs = college["branch_cutoffs"].setdefault(branch, {})
		branch_cutoffs[category] = max(int(branch_cutoffs.get(category, 0) or 0), rank)
		college["cutoffs"][branch] = branch_cutoffs

		branch_gm = branch_cutoffs.get("GM")
		if branch_gm is not None:
			college["cutoff"] = max(int(college["cutoff"] or 0), int(branch_gm))

	colleges: list[dict] = []
	for college in colleges_by_name.values():
		branches = sorted(college["branches"])
		college["branches"] = branches
		if branches and college["branch"] not in branches:
			college["branch"] = branches[0]
		college["cutoff"] = int(college["cutoff"] or 0) or None
		colleges.append(college)

	colleges.sort(key=lambda item: item["college_name"].lower())
	return colleges
