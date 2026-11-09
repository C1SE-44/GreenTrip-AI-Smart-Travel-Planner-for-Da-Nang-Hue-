"""
Update mismatched coordinates for 7 POIs in public.pois and synchronize data files.
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db.postgres import get_connection

PROJECT_ROOT = BACKEND_DIR.parent
RAW_DIR = PROJECT_ROOT / "data" / "raw"

COORDINATE_CORRECTIONS = {
    # 1. Phê La Đà Nẵng: 35–41 Nguyễn Văn Linh, Hải Châu, Đà Nẵng
    "0f3d47ef-cb76-4a4c-ae7a-07d2e239a945": {
        "name": "Phê La Đà Nẵng (Góc Phố Nguyễn Văn Linh)",
        "lat": 16.0605,
        "lng": 108.2205,
    },
    # 2. Tiệm Cà Phê Hồi Đó: 36/12 Trần Hưng Đạo, Sơn Trà, Đà Nẵng
    "3425dc33-6c7f-4177-92da-50443fb0b0a1": {
        "name": "Tiệm Cà Phê Hồi Đó – Nếp Nhà Xưa Retro",
        "lat": 16.0685,
        "lng": 108.2285,
    },
    # 3. Ốc Hút Đĩa Bay Cô Ta: Doãn Khuê – Cung Tiên Sơn, Hải Châu, Đà Nẵng
    "477d09ea-9742-4695-ab01-b99cd784d488": {
        "name": "Ốc Hút Đĩa Bay Cô Ta & Ốc Hút Hạnh (Đã tách rõ 2 địa chỉ thực tế)",
        "lat": 16.0355,
        "lng": 108.2250,
    },
    # 4. Đài Tưởng Niệm & Quảng Trường 2/9: Đường 2 Tháng 9, Hải Châu, Đà Nẵng
    "45f306b5-a76e-4057-920a-5c4dd6f79a0c": {
        "name": "Đài Tưởng Niệm Thành Phố & Quảng Trường 2 Tháng 9",
        "lat": 16.0505,
        "lng": 108.2230,
    },
    # 5. Nhà Hàng Hải Sản Đại Dương Huế: 99 Nguyễn Sinh Cung, Vỹ Dạ, Huế
    "f1bb4716-dba7-44b2-8d61-87983c5f79fc": {
        "name": "Nhà Hàng Hải Sản Đại Dương Huế",
        "lat": 16.4715,
        "lng": 107.6055,
    },
    # 6. Quán Bến Tàu: 49 Phú Mộng, Kim Long, Huế
    "dd4b6795-09d2-4fc4-b851-8e267290edd6": {
        "name": "Quán Bến Tàu – Hải Sản Nướng & Lẩu",
        "lat": 16.4585,
        "lng": 107.5560,
    },
    # 7. Nối Cafe Huế: Kiệt 103/9 Trường Chinh, An Đông, Huế
    "2a7e4336-1fb9-4771-b942-ada788005a10": {
        "name": "Nối Cafe Huế (hoặc Tiệm Cà Phê Tụi Mình) – Cổ Điển / Bao Cấp (Vintage / Retro)",
        "lat": 16.4560,
        "lng": 107.6000,
    },
}

def main():
    conn = get_connection()
    cur = conn.cursor()

    print("Updating 7 POIs in public.pois...")
    for poi_id, info in COORDINATE_CORRECTIONS.items():
        lat = info["lat"]
        lng = info["lng"]
        cur.execute("""
            UPDATE public.pois
            SET geom = ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                updated_at = NOW()
            WHERE poi_id = %s::uuid;
        """, (lng, lat, poi_id))
        print(f" - Updated {info['name']} -> ({lat}, {lng})")

    conn.commit()

    # Verify update
    print("\nVerifying database coordinates:")
    for poi_id, info in COORDINATE_CORRECTIONS.items():
        cur.execute("""
            SELECT name, ST_Y(geom::geometry), ST_X(geom::geometry)
            FROM public.pois
            WHERE poi_id = %s::uuid;
        """, (poi_id,))
        row = cur.fetchone()
        print(f" -> DB check: {row[0]} => ({row[1]:.4f}, {row[2]:.4f})")

    conn.close()

    # Synchronize raw dataset files
    p1_path = RAW_DIR / "food_beverage_danang_hue_phase1.json"
    if p1_path.exists():
        with open(p1_path, "r", encoding="utf-8") as f:
            p1_data = json.load(f)
        p1_updated = 0
        for item in p1_data:
            name_lower = item.get("name", "").lower()
            for info in COORDINATE_CORRECTIONS.values():
                if info["name"][:10].lower() in name_lower:
                    item["latitude"] = info["lat"]
                    item["longitude"] = info["lng"]
                    p1_updated += 1
        with open(p1_path, "w", encoding="utf-8") as f:
            json.dump(p1_data, f, ensure_ascii=False, indent=2)
        print(f"\nSynced {p1_updated} coordinate records in {p1_path.name}")

    p2_path = RAW_DIR / "nature_heritage_danang_hue_phase2.json"
    if p2_path.exists():
        with open(p2_path, "r", encoding="utf-8") as f:
            p2_data = json.load(f)
        p2_updated = 0
        for item in p2_data:
            name_lower = item.get("name", "").lower()
            for info in COORDINATE_CORRECTIONS.values():
                if info["name"][:10].lower() in name_lower:
                    item["latitude"] = info["lat"]
                    item["longitude"] = info["lng"]
                    p2_updated += 1
        with open(p2_path, "w", encoding="utf-8") as f:
            json.dump(p2_data, f, ensure_ascii=False, indent=2)
        print(f"Synced {p2_updated} coordinate records in {p2_path.name}")

    # Re-export all_pois_cleaned.csv
    from scripts.export_cleaned_pois_csv import main as export_csv
    export_csv()
    print("Coordinates successfully corrected and exported!")

if __name__ == "__main__":
    main()
