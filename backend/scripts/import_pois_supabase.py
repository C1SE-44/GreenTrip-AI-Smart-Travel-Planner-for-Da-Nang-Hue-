"""Import the processed POI CSV into the existing Supabase Postgres schema.

Run from the repository root with:
    python backend/scripts/import_pois_supabase.py [--csv PATH] [--dry-run]

The database import is atomic and intentionally refuses to run when public.pois
already contains rows, because the current schema does not store OSM identifiers
or provide a natural key for safe re-imports.
"""

from __future__ import annotations

import argparse
import csv
import math
import sys
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path

import psycopg

PROJECT_ROOT: Path = Path(__file__).resolve().parents[2]
BACKEND_DIR: Path = PROJECT_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db.postgres import get_connection
from scripts.format_pois_csv import CSV_HEADERS

DEFAULT_CSV_PATH: Path = PROJECT_ROOT / "data" / "processed" / "pois.csv"

VISIT_MINUTES_BY_CATEGORY: dict[str, int] = {
    "Ẩm thực và quán ăn": 60,
    "Quán cafe giải khát": 45,
    "Di tích lịch sử và văn hóa": 90,
    "Cảnh quan và thiên nhiên": 90,
    "Tâm linh và chùa thiền": 45,
}

CSV_FIELDS_NOT_STORED: tuple[str, ...] = (
    "osm_type",
    "osm_id",
    "city_name",
    "phone",
    "website",
    "opening_hours",
    "cuisine",
)


@dataclass(frozen=True)
class PoiRecord:
    osm_type: str
    osm_id: str
    city_code: str
    city_name: str
    category_name: str
    name: str
    latitude: float
    longitude: float
    description: str | None
    address: str | None
    estimated_cost: Decimal | None
    average_visit_minutes: int
    satisfaction_score: Decimal | None
    popularity_score: Decimal | None
    is_local_business: bool
    local_business_type: str | None


def _required_text(row: dict[str, str | None], field: str, line_number: int) -> str:
    value = row.get(field)
    if value is None or not value.strip():
        raise ValueError(f"CSV line {line_number}: {field} must not be empty.")
    return value.strip()


def _optional_text(row: dict[str, str | None], field: str) -> str | None:
    value = row.get(field)
    if value is None:
        return None
    return value.strip() or None


def _optional_decimal(
    row: dict[str, str | None],
    field: str,
    line_number: int,
    *,
    maximum: Decimal | None = None,
) -> Decimal | None:
    value = row.get(field)
    if value is None or not value.strip():
        return None

    try:
        parsed = Decimal(value.strip())
    except InvalidOperation as exc:
        raise ValueError(
            f"CSV line {line_number}: {field} must be a valid number."
        ) from exc

    if not parsed.is_finite() or parsed < 0:
        raise ValueError(
            f"CSV line {line_number}: {field} must be a finite, non-negative number."
        )
    if maximum is not None and parsed > maximum:
        raise ValueError(
            f"CSV line {line_number}: {field} must not exceed {maximum}."
        )
    return parsed


def parse_poi_row(row: dict[str, str | None], line_number: int) -> PoiRecord:
    osm_type = _required_text(row, "osm_type", line_number)
    osm_id = _required_text(row, "osm_id", line_number)
    city_code = _required_text(row, "city_code", line_number).upper()
    city_name = _required_text(row, "city_name", line_number)
    category_name = _required_text(row, "category_name", line_number)
    name = _required_text(row, "name", line_number)

    try:
        latitude = float(_required_text(row, "latitude", line_number))
        longitude = float(_required_text(row, "longitude", line_number))
    except ValueError as exc:
        raise ValueError(
            f"CSV line {line_number}: latitude and longitude must be numbers."
        ) from exc
    if not (
        math.isfinite(latitude)
        and math.isfinite(longitude)
        and -90 <= latitude <= 90
        and -180 <= longitude <= 180
    ):
        raise ValueError(
            f"CSV line {line_number}: coordinates must be finite and within "
            "latitude [-90, 90] / longitude [-180, 180]."
        )

    local_business_text = _required_text(row, "is_local_business", line_number).lower()
    if local_business_text not in {"true", "false"}:
        raise ValueError(
            f"CSV line {line_number}: is_local_business must be True or False."
        )

    visit_text = row.get("average_visit_minutes")
    if visit_text is not None and visit_text.strip():
        try:
            average_visit_minutes = int(visit_text.strip())
        except ValueError as exc:
            raise ValueError(
                f"CSV line {line_number}: average_visit_minutes must be an integer."
            ) from exc
    else:
        try:
            average_visit_minutes = VISIT_MINUTES_BY_CATEGORY[category_name]
        except KeyError as exc:
            raise ValueError(
                f"CSV line {line_number}: no visit-duration baseline is defined for "
                f"category {category_name!r}."
            ) from exc

    if not 0 <= average_visit_minutes <= 32767:
        raise ValueError(
            f"CSV line {line_number}: average_visit_minutes must be between 0 and 32767."
        )

    return PoiRecord(
        osm_type=osm_type,
        osm_id=osm_id,
        city_code=city_code,
        city_name=city_name,
        category_name=category_name,
        name=name,
        latitude=latitude,
        longitude=longitude,
        description=_optional_text(row, "description"),
        address=_optional_text(row, "address"),
        estimated_cost=_optional_decimal(row, "estimated_cost", line_number),
        average_visit_minutes=average_visit_minutes,
        satisfaction_score=_optional_decimal(
            row, "satisfaction_score", line_number, maximum=Decimal("100")
        ),
        popularity_score=_optional_decimal(
            row, "popularity_score", line_number, maximum=Decimal("100")
        ),
        is_local_business=local_business_text == "true",
        local_business_type=_optional_text(row, "local_business_type"),
    )


def read_pois_csv(csv_path: Path) -> list[PoiRecord]:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        if reader.fieldnames != CSV_HEADERS:
            raise ValueError(
                "CSV header does not match the expected POI format. "
                "Regenerate it with backend/scripts/format_pois_csv.py."
            )

        records: list[PoiRecord] = []
        seen_osm_ids: set[tuple[str, str]] = set()
        for line_number, row in enumerate(reader, start=2):
            if None in row:
                raise ValueError(
                    f"CSV line {line_number}: row has more values than the header."
                )
            if any(value is None for value in row.values()):
                raise ValueError(
                    f"CSV line {line_number}: row has fewer values than the header."
                )

            record = parse_poi_row(row, line_number)
            osm_key = (record.osm_type, record.osm_id)
            if osm_key in seen_osm_ids:
                raise ValueError(
                    f"CSV line {line_number}: duplicate OSM identifier "
                    f"{record.osm_type}/{record.osm_id}."
                )
            seen_osm_ids.add(osm_key)
            records.append(record)

    if not records:
        raise ValueError(f"CSV contains no POI rows: {csv_path}")
    return records


def import_pois(records: list[PoiRecord], replace: bool = False) -> tuple[int, int]:
    category_names = sorted({record.category_name for record in records})
    city_codes = sorted({record.city_code for record in records})
    inserted_category_count = 0

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT count(*) FROM public.pois")
            existing_poi_count = cursor.fetchone()[0]
            if existing_poi_count:
                if not replace:
                    raise RuntimeError(
                        f"public.pois already contains {existing_poi_count} rows. "
                        "Import stopped to prevent duplicates; this schema has no "
                        "OSM identifier or natural key for safe re-imports. Pass --replace to overwrite."
                    )
                cursor.execute("TRUNCATE TABLE public.pois CASCADE;")
                cursor.execute(
                    "DELETE FROM public.poi_categories WHERE NOT (name = ANY(%s));",
                    (category_names,),
                )

            cursor.execute(
                """
                SELECT city_id, code, name, is_active
                FROM public.cities
                WHERE code = ANY(%s)
                """,
                (city_codes,),
            )
            cities = {
                code: (city_id, name, is_active)
                for city_id, code, name, is_active in cursor.fetchall()
            }

            for record in records:
                city = cities.get(record.city_code)
                if city is None:
                    raise ValueError(
                        f"City code {record.city_code!r} is missing from public.cities."
                    )
                _, database_city_name, is_active = city
                if not is_active:
                    raise ValueError(
                        f"City code {record.city_code!r} is not active in public.cities."
                    )
                if database_city_name.strip().casefold() != record.city_name.casefold():
                    raise ValueError(
                        f"City name mismatch for {record.city_code!r}: CSV has "
                        f"{record.city_name!r}, database has {database_city_name!r}."
                    )

            cursor.execute(
                """
                SELECT name
                FROM public.poi_categories
                WHERE name = ANY(%s)
                """,
                (category_names,),
            )
            existing_category_names = {row[0] for row in cursor.fetchall()}
            missing_category_names = [
                name for name in category_names if name not in existing_category_names
            ]
            if missing_category_names:
                cursor.executemany(
                    """
                    INSERT INTO public.poi_categories (name)
                    VALUES (%s)
                    ON CONFLICT (name) DO NOTHING
                    """,
                    [(name,) for name in missing_category_names],
                )
                inserted_category_count = len(missing_category_names)

            cursor.execute(
                """
                SELECT category_id, name
                FROM public.poi_categories
                WHERE name = ANY(%s)
                """,
                (category_names,),
            )
            categories = {name: category_id for category_id, name in cursor.fetchall()}
            unresolved_categories = set(category_names) - categories.keys()
            if unresolved_categories:
                raise ValueError(
                    "Could not resolve POI categories: "
                    + ", ".join(sorted(unresolved_categories))
                )

            cursor.executemany(
                """
                INSERT INTO public.pois (
                    city_id,
                    category_id,
                    name,
                    description,
                    address,
                    geom,
                    estimated_cost,
                    average_visit_minutes,
                    satisfaction_score,
                    popularity_score,
                    is_local_business,
                    local_business_type
                )
                VALUES (
                    %s, %s, %s, %s, %s,
                    ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
                    %s, %s, %s, %s, %s, %s
                )
                """,
                [
                    (
                        cities[record.city_code][0],
                        categories[record.category_name],
                        record.name,
                        record.description,
                        record.address,
                        record.longitude,
                        record.latitude,
                        record.estimated_cost,
                        record.average_visit_minutes,
                        record.satisfaction_score,
                        record.popularity_score,
                        record.is_local_business,
                        record.local_business_type,
                    )
                    for record in records
                ],
            )

            cursor.execute("SELECT count(*) FROM public.pois")
            imported_poi_count = cursor.fetchone()[0]
            if imported_poi_count != len(records):
                raise RuntimeError(
                    f"Expected {len(records)} imported POIs, found "
                    f"{imported_poi_count} in public.pois."
                )

    return imported_poi_count, inserted_category_count


def _print_summary(records: list[PoiRecord], *, dry_run: bool) -> None:
    categories = sorted({record.category_name for record in records})
    city_codes = sorted({record.city_code for record in records})
    duration_summary = sorted(
        {
            f"{record.category_name}: {record.average_visit_minutes} min"
            for record in records
        }
    )
    label = "Validated" if dry_run else "Prepared"
    print(f"[{label}] {len(records)} POIs from the CSV.")
    print(f"[INFO] City codes: {', '.join(city_codes)}")
    print(f"[INFO] Categories ({len(categories)}): {', '.join(categories)}")
    print(f"[INFO] Visit-duration baselines: {'; '.join(duration_summary)}")
    print(
        "[INFO] CSV columns not stored by the current public.pois schema: "
        + ", ".join(CSV_FIELDS_NOT_STORED)
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Import processed POI data into Supabase.")
    parser.add_argument(
        "--csv",
        type=Path,
        default=DEFAULT_CSV_PATH,
        help=f"POI CSV file (default: {DEFAULT_CSV_PATH})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate the CSV without connecting to or changing Supabase.",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Replace existing POIs and clean old categories in Supabase.",
    )
    args = parser.parse_args(argv)

    try:
        records = read_pois_csv(args.csv)
        _print_summary(records, dry_run=args.dry_run)
        if args.dry_run:
            return 0

        imported_count, inserted_category_count = import_pois(
            records, replace=args.replace
        )
    except (OSError, ValueError, RuntimeError, psycopg.Error) as exc:
        print(f"[ERROR] POI import aborted: {exc}", file=sys.stderr)
        return 1

    print(
        f"[SUCCESS] Imported {imported_count} POIs into public.pois; "
        f"created {inserted_category_count} missing category rows."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
