"""Module and CLI to calculate and enrich real-world scores for POIs.

Calculates three standardized multi-objective scores:
1. satisfaction_score: Bayesian Average from Google Maps rating and review_count.
2. popularity_score: Logarithmic scale of review count + Michelin/UNESCO prestige bonuses.
3. green_score: MCDA 4-pillar model (Nature 40%, Heritage 25%, Green ops 20%, Transit 15%).

Usage:
    # Dry run preview (no DB changes):
    python backend/scripts/enrich_poi_scores.py --dry-run

    # Live commit to Supabase and update leads CSV:
    python backend/scripts/enrich_poi_scores.py --live-commit
"""

from __future__ import annotations

import argparse
import csv
import logging
import math
from pathlib import Path
import re
import sys
from typing import Any

# Ensure UTF-8 output on Windows
if sys.platform == "win32":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("enrich_scores")

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT / "backend") not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT / "backend"))

LEADS_CSV = PROJECT_ROOT / "data" / "processed" / "poi_partner_leads.csv"


# =====================================================================
# 1. Calculation Functions (Pure, Testable)
# =====================================================================

def calculate_satisfaction_score(
    rating: float | None,
    review_count: int | None,
    prior_mean: float = 4.40,
    confidence_weight: float = 30.0,
) -> float:
    """Calculate Bayesian Average rating to eliminate low-sample bias.

    Formula: S = (v * R + m * C) / (v + m)
    where:
        R = actual average rating
        v = review count
        C = prior mean across the destination (default 4.40)
        m = minimum confidence review threshold (default 30)
    """
    R = float(rating) if rating is not None and rating > 0 else prior_mean
    v = max(0, int(review_count)) if review_count is not None else 0

    bayesian = (v * R + confidence_weight * prior_mean) / (v + confidence_weight)
    return round(max(1.0, min(5.0, bayesian)), 2)


def calculate_popularity_score(
    review_count: int | None,
    max_review_count: int = 45991,
    name: str = "",
    description: str = "",
    category: str = "",
    sub_category: str = "",
) -> float:
    """Calculate logarithmic popularity score (1.0 to 5.0) plus prestige bonuses.

    Base: 1.0 + 3.4 * (log10(v + 1) / log10(max_v + 1))
    Prestige bonuses:
      - Michelin Selected / Bib Gourmand: +0.35
      - UNESCO World Heritage: +0.40
      - National Landmark / Iconic Attraction: +0.25
    """
    v = max(0, int(review_count)) if review_count is not None else 0
    max_v = max(1, max_review_count)

    # Logarithmic compression
    log_v = math.log10(v + 1)
    log_max = math.log10(max_v + 1)
    base_score = 1.0 + 3.4 * (log_v / log_max)

    text_to_check = f"{name} {description}".lower()

    bonus = 0.0
    # UNESCO World Heritage
    if re.search(r"đại nội|hoàng thành|lăng |tự đức|khải định|minh mạng|cố đô|hội an|nhã nhạc", text_to_check):
        bonus += 0.40
    # Michelin Guide
    if re.search(r"michelin", text_to_check):
        bonus += 0.35
    # Iconic Landmark
    if re.search(r"bà nà|cầu rồng|ngũ hành sơn|bán đảo sơn trà|chùa linh ứng|chùa thiên mụ|vườn quốc gia bạch mã|đèo hải vân", text_to_check):
        bonus += 0.25

    final_score = base_score + bonus
    return round(max(1.0, min(5.0, final_score)), 2)


def calculate_green_score(
    category: str = "",
    sub_category: str = "",
    cuisine: str = "",
    city: str = "",
    address: str = "",
    name: str = "",
    description: str = "",
) -> float:
    """Calculate multi-criteria green travel score (0.40 to 0.98) using MCDA 4 pillars.

    Pillars:
    1. Nature & Biodiversity (40%)
    2. Cultural Heritage & Low Impact (25%)
    3. Green Operations & Plant-based (20%)
    4. Walkability & Eco-transit Access (15%)
    """
    cat_norm = (category or "").lower()
    sub_norm = (sub_category or "").lower()
    cui_norm = (cuisine or "").lower()
    city_norm = (city or "").lower()
    name_norm = (name or "").lower()
    text = f"{name_norm} {(address or '').lower()} {(description or '').lower()}"

    # Pillar 3: Green Operations & Plant-based (20%)
    is_vegan_eco = ("chay" in text or "vegetarian" in sub_norm or "vegan" in cui_norm or "thực vật" in text or "organic" in text)
    if is_vegan_eco:
        p_ops = 1.00
    elif "tâm linh" in cat_norm or "cảnh quan" in cat_norm:
        p_ops = 0.82
    elif "di tích" in cat_norm:
        p_ops = 0.75
    elif "cafe" in cat_norm:
        p_ops = 0.60
    else:
        p_ops = 0.50

    # Pillar 1: Nature & Environmental Footprint (40%)
    if "cảnh quan" in cat_norm or any(w in text for w in ["biển", "bãi", "suối", "thác", "rừng", "núi", "sơn trà", "bạch mã", "hải vân", "đầm", "hồ"]):
        p_nature = 0.95
    elif "tâm linh" in cat_norm or "chùa" in cat_norm:
        p_nature = 0.75
    elif "di tích" in cat_norm:
        p_nature = 0.70
    elif is_vegan_eco:
        # Resource conservation / low carbon footprint of plant-based dining
        p_nature = 0.70
    elif "cafe" in cat_norm:
        p_nature = 0.55
    else:
        p_nature = 0.40

    # Pillar 2: Heritage & Culture (25%)
    if "di tích" in cat_norm or any(w in text for w in ["đại nội", "lăng", "hoàng thành", "bảo tàng", "cố đô", "làng nghề", "vườn quốc gia", "khu bảo tồn", "danh thắng", "di sản"]):
        p_heritage = 0.95
    elif "tâm linh" in cat_norm or "chùa" in cat_norm:
        p_heritage = 0.85
    elif "cảnh quan" in cat_norm:
        # Natural landscape heritage
        p_heritage = 0.80
    elif any(w in text for w in ["chợ", "đặc sản", "phố cổ", "cầu"]):
        p_heritage = 0.70
    elif is_vegan_eco:
        # Buddhist culinary heritage in Central Vietnam (Hue / Da Nang vegetarian culture)
        p_heritage = 0.65
    elif "ẩm thực" in cat_norm and any(w in text for w in ["mì quảng", "bún bò", "bánh bèo", "bánh khoái", "nem lụi", "địa phương", "gia truyền"]):
        p_heritage = 0.65
    else:
        p_heritage = 0.40

    # Pillar 4: Transit & Walkability (15%)
    if any(w in text for w in ["bạch mã", "bãi chuối", "bà nà", "lăng cô", "hải vân"]):
        p_transit = 0.45
    elif ("da nang" in city_norm or "đà nẵng" in city_norm) and any(w in text for w in ["sơn trà", "ngũ hành sơn"]):
        p_transit = 0.65
    elif any(w in text for w in ["hải châu", "bạch đằng", "trần phú", "sông hương", "lê lợi", "phú hội", "vĩnh ninh"]):
        p_transit = 0.92
    else:
        p_transit = 0.80

    green_score = 0.40 * p_nature + 0.25 * p_heritage + 0.20 * p_ops + 0.15 * p_transit
    return round(max(0.40, min(0.98, green_score)), 2)


def compute_all_scores(
    records: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Compute normalized scores for all POI records."""
    valid_reviews = [
        int(r["review_count"]) for r in records if r.get("review_count") and str(r["review_count"]).isdigit()
    ]
    max_rev = max(valid_reviews) if valid_reviews else 45991

    valid_ratings = [
        float(r["rating"]) for r in records if r.get("rating")
    ]
    prior_mean = sum(valid_ratings) / len(valid_ratings) if valid_ratings else 4.40

    enriched = []
    for r in records:
        poi_id = r.get("poi_id", "")
        name = r.get("name", "")
        city = r.get("city", "")
        cat = r.get("category", "")
        sub_cat = r.get("sub_category", "")
        rating = float(r["rating"]) if r.get("rating") else None
        rev_count = int(r["review_count"]) if r.get("review_count") and str(r["review_count"]).isdigit() else None

        sat_score = calculate_satisfaction_score(rating, rev_count, prior_mean=prior_mean)
        pop_score = calculate_popularity_score(rev_count, max_review_count=max_rev, name=name, category=cat, sub_category=sub_cat)
        grn_score = calculate_green_score(category=cat, sub_category=sub_cat, city=city, name=name)

        new_row = dict(r)
        new_row["satisfaction_score"] = sat_score
        new_row["popularity_score"] = pop_score
        new_row["green_score"] = grn_score
        enriched.append(new_row)

    return enriched


# =====================================================================
# 2. Summary Statistics & Reporting
# =====================================================================

def summarize_scores(scores: list[float], name: str) -> dict[str, float]:
    """Compute summary statistics for a list of scores."""
    if not scores:
        return {}
    sorted_s = sorted(scores)
    n = len(sorted_s)
    mean = sum(sorted_s) / n
    variance = sum((x - mean) ** 2 for x in sorted_s) / n
    std = math.sqrt(variance)

    return {
        "count": n,
        "min": sorted_s[0],
        "p25": sorted_s[int(n * 0.25)],
        "median": sorted_s[int(n * 0.50)],
        "p75": sorted_s[int(n * 0.75)],
        "max": sorted_s[-1],
        "mean": round(mean, 2),
        "std": round(std, 2),
    }


def print_stats_table(enriched: list[dict[str, Any]]) -> None:
    """Print an ASCII statistics summary table."""
    sat_scores = [r["satisfaction_score"] for r in enriched]
    pop_scores = [r["popularity_score"] for r in enriched]
    grn_scores = [r["green_score"] for r in enriched]

    sat_stats = summarize_scores(sat_scores, "Satisfaction")
    pop_stats = summarize_scores(pop_scores, "Popularity")
    grn_stats = summarize_scores(grn_scores, "Green Score")

    print("\n" + "=" * 76)
    print(" 📊 POI SCORE ENRICHMENT DISTRIBUTION REPORT (N = 339)")
    print("=" * 76)
    header = f"{'Metric':<18} | {'Satisfaction':<16} | {'Popularity':<16} | {'Green Score':<16}"
    print(header)
    print("-" * 76)
    for k in ["min", "p25", "median", "p75", "max", "mean", "std"]:
        print(f"{k.upper():<18} | {sat_stats.get(k, 0):<16} | {pop_stats.get(k, 0):<16} | {grn_stats.get(k, 0):<16}")
    print("=" * 76)

    # Top & Bottom highlights
    print("\n🌟 Top 3 Highest Green Score (Eco Champions):")
    top_green = sorted(enriched, key=lambda x: x["green_score"], reverse=True)[:3]
    for p in top_green:
        print(f"  • {p['name']} ({p['category']}) -> Green: {p['green_score']} ({int(p['green_score']*100)}/100)")

    print("\n🔥 Top 3 Most Popular POIs:")
    top_pop = sorted(enriched, key=lambda x: x["popularity_score"], reverse=True)[:3]
    for p in top_pop:
        print(f"  • {p['name']} ({p.get('city')}) -> Pop: {p['popularity_score']} (Reviews: {p.get('review_count')})")

    print("\n⭐ Top 3 Highest Satisfaction POIs (Bayesian):")
    top_sat = sorted(enriched, key=lambda x: x["satisfaction_score"], reverse=True)[:3]
    for p in top_sat:
        print(f"  • {p['name']} -> Sat: {p['satisfaction_score']} (Raw: {p.get('rating')}★, {p.get('review_count')} reviews)")
    print()


# =====================================================================
# 3. Database & CSV Synchronization
# =====================================================================

def update_database_scores(enriched: list[dict[str, Any]]) -> int:
    """Commit updated scores to public.pois in PostgreSQL."""
    from app.db.postgres import get_connection

    updated_count = 0
    with get_connection() as conn, conn.cursor() as cur:
        for r in enriched:
            cur.execute(
                """
                UPDATE public.pois
                SET 
                    satisfaction_score = %s,
                    popularity_score = %s,
                    green_score = %s,
                    updated_at = NOW()
                WHERE poi_id = %s;
                """,
                (
                    r["satisfaction_score"],
                    r["popularity_score"],
                    r["green_score"],
                    r["poi_id"],
                ),
            )
            updated_count += cur.rowcount
        conn.commit()

    return updated_count


def update_csv_leads(enriched: list[dict[str, Any]], csv_path: Path) -> None:
    """Save enriched scores back into CSV."""
    with open(csv_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])

    # Ensure columns exist
    for col in ["satisfaction_score", "popularity_score"]:
        if col not in fieldnames:
            fieldnames.append(col)

    with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in enriched:
            row_to_write = {k: r.get(k, "") for k in fieldnames}
            writer.writerow(row_to_write)


# =====================================================================
# 4. Main Entry Point
# =====================================================================

def main() -> None:
    parser = argparse.ArgumentParser(description="Enrich POIs with realistic multi-objective scores.")
    parser.add_argument(
        "--live-commit",
        action="store_true",
        help="Apply changes live to PostgreSQL/Supabase database and leads CSV.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="Dry run without modifying database (default).",
    )
    args = parser.parse_args()

    if not LEADS_CSV.exists():
        logger.error(f"Leads CSV not found at {LEADS_CSV}")
        sys.exit(1)

    with open(LEADS_CSV, "r", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    logger.info(f"Loaded {len(rows)} POI records from {LEADS_CSV}.")
    enriched = compute_all_scores(rows)
    print_stats_table(enriched)

    if args.live_commit:
        logger.info("⚡ LIVE-COMMIT specified. Updating PostgreSQL public.pois...")
        updated = update_database_scores(enriched)
        logger.info(f"✅ Successfully updated {updated} POIs in public.pois.")

        logger.info(f"Writing updated scores back to {LEADS_CSV}...")
        update_csv_leads(enriched, LEADS_CSV)
        logger.info("✅ Leads CSV updated.")
    else:
        logger.info("ℹ️ Running in DRY-RUN mode. No changes were committed to database.")
        logger.info("Pass --live-commit to persist these scores.")


if __name__ == "__main__":
    main()
