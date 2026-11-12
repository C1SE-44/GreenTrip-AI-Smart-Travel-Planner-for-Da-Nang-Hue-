"""
Script kiểm tra & đối soát chất lượng tọa độ toàn bộ POI trong hệ thống (GIS Spatial Quality Audit).
Phương pháp kiểm tra 4 lớp:
1. Giới hạn địa lý cấp Tỉnh / Thành phố (Bounding Box).
2. Đối soát Tên quận/huyện trong địa chỉ văn bản với tọa độ GPS thực tế (Haversine Distance).
3. Phát hiện điểm trôi lệch sang tỉnh khác (Hội An, Tam Kỳ, Quảng Trị...).
4. Phát hiện trùng tọa độ (Co-located coordinate duplicates).
"""

import csv
import math
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = REPO_ROOT / "data" / "processed" / "all_pois_cleaned.csv"

# Centroid và bán kính tối đa cho phép của từng quận/huyện tại Đà Nẵng
DN_DISTRICTS = {
    "Hải Châu": {"lat": 16.055, "lng": 108.218, "max_km": 7.0},
    "Thanh Khê": {"lat": 16.065, "lng": 108.185, "max_km": 7.0},
    "Sơn Trà": {"lat": 16.085, "lng": 108.260, "max_km": 12.0},
    "Ngũ Hành Sơn": {"lat": 16.020, "lng": 108.255, "max_km": 9.0},
    "Cẩm Lệ": {"lat": 16.020, "lng": 108.200, "max_km": 8.0},
    "Liên Chiểu": {"lat": 16.085, "lng": 108.140, "max_km": 10.0},
    "Hòa Vang": {"lat": 16.050, "lng": 108.060, "max_km": 25.0},
}

HUE_CENTER = {"lat": 16.467, "lng": 107.585}


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


def audit_pois(csv_path: Path):
    if not csv_path.exists():
        print(f"File not found: {csv_path}")
        return

    with open(csv_path, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        pois = list(reader)

    print(f"Tổng số POI được kiểm tra: {len(pois)}")

    anomalies = []
    coord_map = {}

    for p in pois:
        poi_id = p.get("poi_id") or p.get("id")
        name = p.get("name") or ""
        city = (p.get("city") or "").lower()
        addr = (p.get("address") or "") + " " + name
        try:
            lat = float(p.get("latitude") or p.get("lat") or 0)
            lng = float(p.get("longitude") or p.get("lng") or 0)
        except ValueError:
            anomalies.append({"type": "INVALID_NUMBER", "poi": p, "desc": "Tọa độ không phải là số hợp lệ"})
            continue

        if lat == 0 or lng == 0:
            anomalies.append({"type": "ZERO_COORDINATE", "poi": p, "desc": "Tọa độ bằng 0"})
            continue

        # 1. Trùng tọa độ
        coord_key = f"{lat:.5f},{lng:.5f}"
        if coord_key in coord_map:
            anomalies.append({
                "type": "DUPLICATE_COORDINATE",
                "poi": p,
                "desc": f"Trùng tọa độ {coord_key} với POI: {coord_map[coord_key]}",
            })
        else:
            coord_map[coord_key] = name

        # 2. Kiểm tra giới hạn tỉnh thành & lệch sang tỉnh khác
        if "da nang" in city or "đà nẵng" in city:
            if not (15.85 <= lat <= 16.35 and 107.85 <= lng <= 108.35):
                anomalies.append({
                    "type": "OUT_OF_BOUNDS",
                    "poi": p,
                    "desc": f"Nằm ngoài khung Đà Nẵng: ({lat}, {lng})",
                })
            else:
                # Kiểm tra lệch quận nội thành
                for d_name, d_info in DN_DISTRICTS.items():
                    if d_name in addr:
                        dist = haversine_km(lat, lng, d_info["lat"], d_info["lng"])
                        if dist > d_info["max_km"]:
                            anomalies.append({
                                "type": "DISTRICT_MISMATCH",
                                "poi": p,
                                "desc": f"Địa chỉ ghi {d_name} nhưng tọa độ cách {dist:.1f}km: ({lat}, {lng})",
                            })
                        break
        elif "hue" in city or "huế" in city:
            if not (16.00 <= lat <= 16.90 and 107.00 <= lng <= 108.15):
                # Ngoại lệ đảo Sơn Chà nằm dưới chân đèo Hải Vân
                if "Sơn Chà" not in name and "Lăng Cô" not in addr:
                    anomalies.append({
                        "type": "OUT_OF_BOUNDS",
                        "poi": p,
                        "desc": f"Nằm ngoài khung Thừa Thiên Huế: ({lat}, {lng})",
                    })
            else:
                if (
                    ("TP. Huế" in addr or "Thành phố Huế" in addr or "Phường" in addr)
                    and not any(k in addr for k in ["Phú Lộc", "Phong Điền", "A Lưới", "Phú Vang", "Thuận An"])
                ):
                    dist = haversine_km(lat, lng, HUE_CENTER["lat"], HUE_CENTER["lng"])
                    if dist > 10.0:
                        anomalies.append({
                            "type": "DISTRICT_MISMATCH",
                            "poi": p,
                            "desc": f"Địa chỉ nội đô Huế nhưng tọa độ cách trung tâm {dist:.1f}km: ({lat}, {lng})",
                        })

    print(f"\nKết quả kiểm tra: Phát hiện {len(anomalies)} bất thường.")
    if anomalies:
        for idx, a in enumerate(anomalies, 1):
            poi = a["poi"]
            print(f"{idx}. [{a['type']}] {poi.get('name')}")
            print(f"   Địa chỉ: {poi.get('address')}")
            print(f"   Chi tiết: {a['desc']}\n")
    else:
        print("✔ TOÀN BỘ TỌA ĐỘ TRONG HỆ THỐNG ĐÃ ĐẠT CHUẨN ĐỐI SOÁT!")


if __name__ == "__main__":
    audit_pois(CSV_PATH)
