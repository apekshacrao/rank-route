import json
import logging
import time
from functools import lru_cache
from pathlib import Path

from database.db import get_db

logger = logging.getLogger(__name__)

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "college_cutoffs.json"


@lru_cache(maxsize=1)
def load_cutoff_data():
    """Load sample cutoff data once and cache it for faster requests."""
    with DATA_FILE.open("r", encoding="utf-8") as file:
        raw_data = json.load(file)

    return raw_data.get("colleges", [])


def get_filtered_cutoffs(branch_id: int, category: str, year: int = 2024) -> list[dict]:
    """
    Fetch filtered cutoff data directly from database with optimized query.
    
    Uses idx_cutoffs_branch_category_year index for fast lookups.
    Args:
        branch_id: Branch ID to filter by
        category: Category (GM, OBC, SC/ST)
        year: Academic year (default: 2024)
    
    Returns:
        List of cutoff records with college info
    """
    start_time = time.time()
    db = get_db()
    
    query = """
        SELECT 
            c.id as college_id,
            c.college_name,
            b.branch_name,
            co.category,
            co.year,
            co.cutoff_rank
        FROM cutoffs co
        INNER JOIN colleges c ON co.college_id = c.id
        INNER JOIN branches b ON co.branch_id = b.id
        WHERE co.branch_id = ? AND co.category = ? AND co.year = ?
        ORDER BY co.cutoff_rank ASC
    """
    
    rows = db.execute(query, (branch_id, category, year)).fetchall()
    
    elapsed_ms = (time.time() - start_time) * 1000
    if elapsed_ms > 100:
        logger.warning(
            f"Slow cutoff query: branch_id={branch_id}, category={category}, "
            f"year={year}, took {elapsed_ms:.2f}ms"
        )
    
    return [dict(row) for row in rows]


def get_all_cutoffs_for_rank_range(
    branch_id: int, category: str, min_rank: int, max_rank: int, year: int = 2024
) -> list[dict]:
    """
    Fetch cutoffs within a rank range for efficient high-load prediction queries.
    
    Uses composite index on (category, year, cutoff_rank) for range queries.
    Args:
        branch_id: Branch ID
        category: Category filter
        min_rank: Lower bound rank (user's rank)
        max_rank: Upper bound rank for comparison
        year: Academic year
    
    Returns:
        Cutoff records within rank range
    """
    start_time = time.time()
    db = get_db()
    
    query = """
        SELECT 
            c.id as college_id,
            c.college_name,
            b.branch_name,
            co.category,
            co.year,
            co.cutoff_rank
        FROM cutoffs co
        INNER JOIN colleges c ON co.college_id = c.id
        INNER JOIN branches b ON co.branch_id = b.id
        WHERE co.branch_id = ? AND co.category = ? AND co.year = ?
        AND co.cutoff_rank BETWEEN ? AND ?
        ORDER BY co.cutoff_rank ASC
    """
    
    rows = db.execute(query, (branch_id, category, year, min_rank, max_rank)).fetchall()
    
    elapsed_ms = (time.time() - start_time) * 1000
    if elapsed_ms > 100:
        logger.warning(
            f"Slow rank range query: branch_id={branch_id}, category={category}, "
            f"rank_range=[{min_rank}, {max_rank}], took {elapsed_ms:.2f}ms"
        )
    
    return [dict(row) for row in rows]

