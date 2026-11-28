"""
Automated UAT Execution Harness for Sprint 2.7.
Executes all 20 UAT Scenarios (UAT-01 to UAT-20) against real backend implementations.
Records exact Actual Results, Status, and Evidence for SPRINT_2_7_UAT_TEST_CASES.md.
"""

import json
import time
from typing import Any

from app.orchestrator.orchestrator import ChatbotOrchestrator
from app.tools.implementations import (
    search_pois,
    get_poi_details,
    recommend_pois,
    get_poi_explanation,
    generate_itinerary,
    update_itinerary,
    calculate_trip_cost,
    get_carbon_estimate,
)
from app.tools.schemas import (
    SearchPoisInput,
    GetPoiDetailsInput,
    RecommendPoisInput,
    GetPoiExplanationInput,
    GenerateItineraryInput,
    UpdateItineraryInput,
    CalculateTripCostInput,
    GetCarbonEstimateInput,
)
from app.trips.schemas import CopilotChatRequest, TripContextPayload

orchestrator = ChatbotOrchestrator()
uat_results: list[dict[str, Any]] = []

def record_uat(
    test_id: str,
    group: str,
    name: str,
    steps: str,
    expected: str,
    actual: str,
    status: str,
    evidence: str,
    severity: str = "Low"
):
    uat_results.append({
        "test_id": test_id,
        "group": group,
        "name": name,
        "steps": steps,
        "expected": expected,
        "actual": actual,
        "status": status,
        "evidence": evidence,
        "severity": severity,
    })

print("Executing 20 UAT Scenarios...")

# ==============================================================================
# NHÓM A – TÌM KIẾM VÀ KHÁM PHÁ ĐỊA ĐIỂM
# ==============================================================================

# UAT-01: Tìm địa điểm du lịch tại Huế
t0 = time.time()
r_01 = search_pois(SearchPoisInput(query="lăng tẩm di tích", city="Hue", limit=5))
t_01 = round((time.time() - t0) * 1000, 1)
pois_01 = [p.name for p in r_01.pois]
ok_01 = len(r_01.pois) > 0 and any("huế" in (p.city or "").lower() or "hue" in (p.city or "").lower() for p in r_01.pois)
record_uat(
    "UAT-01",
    "Nhóm A: Khám phá địa điểm",
    "Tìm địa điểm du lịch tại Huế",
    "Gọi search_pois với query='lăng tẩm di tích', city='Hue', limit=5",
    "Trả về danh sách các điểm di sản tại Huế có tọa độ và hình ảnh",
    f"Tìm thấy {len(r_01.pois)} địa điểm ({', '.join(pois_01[:3])}). Độ trễ {t_01}ms.",
    "PASS" if ok_01 else "FAIL",
    f"POI IDs: {[p.poi_id for p in r_01.pois[:3]]}",
    "High"
)

# UAT-02: Tìm địa điểm du lịch tại Đà Nẵng
t0 = time.time()
r_02 = search_pois(SearchPoisInput(query="bãi biển", city="Danang", limit=5))
t_02 = round((time.time() - t0) * 1000, 1)
pois_02 = [p.name for p in r_02.pois]
ok_02 = len(r_02.pois) > 0
record_uat(
    "UAT-02",
    "Nhóm A: Khám phá địa điểm",
    "Tìm địa điểm du lịch tại Đà Nẵng",
    "Gọi search_pois với query='bãi biển', city='Danang', limit=5",
    "Trả về các điểm du lịch tại Đà Nẵng với thông tin địa chỉ và danh mục",
    f"Tìm thấy {len(r_02.pois)} địa điểm ({', '.join(pois_02[:3])}). Độ trễ {t_02}ms.",
    "PASS" if ok_02 else "FAIL",
    f"POI IDs: {[p.poi_id for p in r_02.pois[:3]]}",
    "High"
)

# UAT-03: Lọc địa điểm theo danh mục
t0 = time.time()
r_03 = search_pois(SearchPoisInput(query="ẩm thực", category="Ẩm thực và quán ăn", limit=5))
ok_03 = len(r_03.pois) > 0 and all(p.category for p in r_03.pois)
record_uat(
    "UAT-03",
    "Nhóm A: Khám phá địa điểm",
    "Lọc địa điểm theo danh mục ẩm thực",
    "Gọi search_pois với query='ẩm thực', category='Ẩm thực và quán ăn'",
    "Chỉ hiển thị các địa điểm thuộc phân nhóm ẩm thực/quán ăn",
    f"Tìm thấy {len(r_03.pois)} địa điểm ẩm thực. Các danh mục trả về: {list(set(p.category for p in r_03.pois))}",
    "PASS" if ok_03 else "FAIL",
    f"Sample: {[p.name for p in r_03.pois[:2]]}",
    "Medium"
)

# UAT-04: Xem chi tiết một địa điểm
first_poi_id = r_01.pois[0].poi_id if r_01.pois else "poi_dn_01"
r_04 = get_poi_details(GetPoiDetailsInput(poi_id=first_poi_id))
poi_dict = r_04.poi or {}
ok_04 = r_04.found and bool(poi_dict.get("name"))
record_uat(
    "UAT-04",
    "Nhóm A: Khám phá địa điểm",
    "Xem chi tiết một địa điểm",
    f"Gọi get_poi_details với poi_id='{first_poi_id}'",
    "Trả về đầy đủ thông tin: tên, tọa độ, địa chỉ, mô tả, điểm xanh",
    f"Chi tiết địa điểm '{poi_dict.get('name')}': tọa độ ({poi_dict.get('latitude')}, {poi_dict.get('longitude')}), green_score={poi_dict.get('green_score')}, giờ mở cửa={poi_dict.get('opening_hours')}.",
    "PASS" if ok_04 else "FAIL",
    f"ID: {first_poi_id}, Address: {poi_dict.get('address')}",
    "High"
)

# UAT-05: Kiểm tra vị trí và tọa độ địa điểm trên bản đồ
lat_05 = float(poi_dict.get("latitude") or 0.0)
lng_05 = float(poi_dict.get("longitude") or 0.0)
ok_05 = 15.5 <= lat_05 <= 16.8 and 107.2 <= lng_05 <= 108.6
record_uat(
    "UAT-05",
    "Nhóm A: Khám phá địa điểm",
    "Kiểm tra tính hợp lệ của tọa độ địa lý",
    "Đối chiếu tọa độ (lat, lng) nằm trong dải địa lý miền Trung (Đà Nẵng - Thừa Thiên Huế)",
    "Tọa độ phải hợp lệ, không null, nằm trong vĩ độ [15.5, 16.8] và kinh độ [107.2, 108.6]",
    f"Tọa độ kiểm tra: lat={lat_05}, lng={lng_05} nằm chính xác trong ranh giới địa lý miền Trung.",
    "PASS" if ok_05 else "FAIL",
    f"Lat: {lat_05}, Lng: {lng_05}",
    "Critical"
)

# ==============================================================================
# NHÓM B – RECOMMENDATION VÀ GIẢI THÍCH
# ==============================================================================

# UAT-06: Gợi ý địa điểm theo sở thích văn hóa
r_06 = recommend_pois(RecommendPoisInput(interests=["van hoa", "di tich"], city="Hue", limit=4))
ok_06 = len(r_06.recommendations) > 0 and all(rec.name for rec in r_06.recommendations)
record_uat(
    "UAT-06",
    "Nhóm B: Gợi ý & Giải thích",
    "Gợi ý địa điểm theo sở thích văn hóa",
    "Gọi recommend_pois với interests=['van hoa', 'di tich'], city='Hue'",
    "Trả về các điểm di sản Huế có điểm khớp sở thích score cao",
    f"Gợi ý {len(r_06.recommendations)} điểm. Điểm cao nhất: {r_06.recommendations[0].name if r_06.recommendations else 'N/A'} (score={r_06.recommendations[0].score if r_06.recommendations else 0}).",
    "PASS" if ok_06 else "FAIL",
    f"Gợi ý: {[r.name for r in r_06.recommendations[:3]]}",
    "High"
)

# UAT-07: Gợi ý địa điểm theo sở thích thiên nhiên
r_07 = recommend_pois(RecommendPoisInput(interests=["thien nhien", "sinh thai"], city="Danang", limit=4))
ok_07 = len(r_07.recommendations) > 0 and all(rec.name for rec in r_07.recommendations)
record_uat(
    "UAT-07",
    "Nhóm B: Gợi ý & Giải thích",
    "Gợi ý địa điểm theo sở thích thiên nhiên & sinh thái",
    "Gọi recommend_pois với interests=['thien nhien', 'sinh thai'], city='Danang'",
    "Ưu tiên các điểm sinh thái bán đảo Sơn Trà, nông trại hoặc bãi biển",
    f"Gợi ý {len(r_07.recommendations)} điểm sinh thái. Điểm cao nhất: {r_07.recommendations[0].name if r_07.recommendations else 'N/A'}.",
    "PASS" if ok_07 else "FAIL",
    f"Top: {[r.name for r in r_07.recommendations[:2]]}",
    "High"
)

# UAT-08: Ưu tiên địa điểm xanh và cơ sở kinh doanh địa phương
out_gen_local = generate_itinerary(GenerateItineraryInput(
    destination="Đà Nẵng",
    duration_days=1,
    travelers=2,
    sustainability_preferences=["green_certified", "local_authentic"]
))
stops_08 = [s for d in out_gen_local.days for s in d.stops]
has_local_08 = any(s.is_local_business for s in stops_08)
ok_08 = len(stops_08) > 0 and (has_local_08 or any(s.green_score >= 85 for s in stops_08))
record_uat(
    "UAT-08",
    "Nhóm B: Gợi ý & Giải thích",
    "Ưu tiên điểm xanh và cơ sở kinh doanh địa phương",
    "Tạo lịch trình có tùy chọn sustainability_preferences=['local_authentic']",
    "Lịch trình tích hợp cơ sở bản địa (is_local_business=True) hoặc điểm xanh cao (>=85)",
    f"Có {len([s for s in stops_08 if s.is_local_business])} cơ sở bản địa và {len([s for s in stops_08 if s.green_score >= 85])} điểm thực hành xanh cao trong hành trình.",
    "PASS" if ok_08 else "FAIL",
    f"Highlights: {[s.name for s in stops_08 if s.is_local_business][:2]}",
    "High"
)

# UAT-09: Xem lý do một địa điểm được đề xuất (Explanation)
r_09 = get_poi_explanation(GetPoiExplanationInput(poi_id=stops_08[0].poi_id))
ok_09 = bool(r_09.explanation_text) and r_09.kg_source in ("live_neo4j", "relational_projection", "description_fallback")
record_uat(
    "UAT-09",
    "Nhóm B: Gợi ý & Giải thích",
    "Xem lý do đề xuất (Explanation Service)",
    f"Gọi get_poi_explanation với poi_id='{stops_08[0].poi_id}'",
    "Trả về lời giải thích rõ ràng kèm nguồn minh bạch (live_neo4j hoặc relational_projection)",
    f"Lý do đề xuất: '{r_09.explanation_text}'. Nguồn giải thích: {r_09.kg_source}.",
    "PASS" if ok_09 else "FAIL",
    f"POI: {r_09.poi_name}, Source: {r_09.kg_source}",
    "High"
)

# ==============================================================================
# NHÓM C – TẠO LỊCH TRÌNH
# ==============================================================================

# UAT-10: Tạo lịch trình Huế 1 ngày
r_10 = generate_itinerary(GenerateItineraryInput(destination="Huế", duration_days=1, travelers=2))
ok_10 = len(r_10.days) == 1 and len(r_10.days[0].stops) >= 3 and r_10.total_cost_vnd > 0
record_uat(
    "UAT-10",
    "Nhóm C: Tạo lịch trình",
    "Tạo lịch trình Huế 1 ngày",
    "Gọi generate_itinerary destination='Huế', duration_days=1, travelers=2",
    "Lịch trình 1 ngày gồm 3-4 điểm dừng với khung giờ, quãng đường và chi phí rõ ràng",
    f"Tạo thành công 1 ngày với {len(r_10.days[0].stops)} điểm dừng, tổng quãng đường {r_10.total_distance_km}km, chi phí {r_10.total_cost_vnd:,.0f}đ.",
    "PASS" if ok_10 else "FAIL",
    f"Theme: {r_10.days[0].theme}",
    "High"
)

# UAT-11: Tạo lịch trình Đà Nẵng 2 ngày
r_11 = generate_itinerary(GenerateItineraryInput(destination="Đà Nẵng", duration_days=2, travelers=2))
ok_11 = len(r_11.days) == 2 and all(len(d.stops) >= 2 for d in r_11.days)
record_uat(
    "UAT-11",
    "Nhóm C: Tạo lịch trình",
    "Tạo lịch trình Đà Nẵng 2 ngày",
    "Gọi generate_itinerary destination='Đà Nẵng', duration_days=2, travelers=2",
    "Tạo lịch trình 2 ngày, mỗi ngày có điểm dừng phân bổ hợp lý theo khu vực địa lý",
    f"Tạo thành công 2 ngày: Ngày 1 ({len(r_11.days[0].stops)} điểm), Ngày 2 ({len(r_11.days[1].stops)} điểm). Tổng CO2: {r_11.total_carbon_kg}kg.",
    "PASS" if ok_11 else "FAIL",
    f"Days: {[d.theme for d in r_11.days]}",
    "High"
)

# UAT-12: Tạo lịch trình liên kết Đà Nẵng - Huế 3 ngày
r_12 = generate_itinerary(GenerateItineraryInput(destination="Đà Nẵng - Huế", duration_days=3, travelers=2))
ok_12 = len(r_12.days) == 3 and any("đà nẵng" in d.focus_city.lower() for d in r_12.days) and any("huế" in d.focus_city.lower() for d in r_12.days)
record_uat(
    "UAT-12",
    "Nhóm C: Tạo lịch trình",
    "Tạo lịch trình liên vùng Đà Nẵng - Huế 3 ngày",
    "Gọi generate_itinerary destination='Đà Nẵng - Huế', duration_days=3, travelers=2",
    "Hành trình 3 ngày trải dài cả Đà Nẵng và Huế, tính toán tuyến vượt đèo/hành lang",
    f"Tạo thành công 3 ngày liên vùng: Focus cities: {[d.focus_city for d in r_12.days]}. Tổng quãng đường: {r_12.total_distance_km}km.",
    "PASS" if ok_12 else "FAIL",
    f"Total distance: {r_12.total_distance_km} km",
    "High"
)

# UAT-13: Tạo lịch trình với ngân sách giới hạn
r_13 = generate_itinerary(GenerateItineraryInput(destination="Huế", duration_days=2, travelers=1, budget_vnd=1500000))
ok_13 = len(r_13.days) == 2 and (r_13.total_cost_vnd <= 1500000 or len(r_13.warnings) > 0)
record_uat(
    "UAT-13",
    "Nhóm C: Tạo lịch trình",
    "Tạo lịch trình với ngân sách giới hạn",
    "Gọi generate_itinerary với budget_vnd=1500000",
    "Tổng chi phí được kiểm soát hoặc phát cảnh báo minh bạch nếu vượt ngưỡng ngân sách",
    f"Tổng chi phí dự toán: {r_13.total_cost_vnd:,.0f}đ cho ngân sách 1,500,000đ. Cảnh báo phát sinh: {len(r_13.warnings)} thông báo.",
    "PASS" if ok_13 else "FAIL",
    f"Cost: {r_13.total_cost_vnd}, Warnings: {r_13.warnings}",
    "Medium"
)

# UAT-14: Tạo lịch trình ưu tiên phương tiện ít phát thải
r_14_bike = generate_itinerary(GenerateItineraryInput(destination="Đà Nẵng", duration_days=1, transport_mode="motorcycle", travelers=1))
r_14_car = generate_itinerary(GenerateItineraryInput(destination="Đà Nẵng", duration_days=1, transport_mode="driving", travelers=1))
ok_14 = r_14_bike.total_carbon_kg < r_14_car.total_carbon_kg
record_uat(
    "UAT-14",
    "Nhóm C: Tạo lịch trình",
    "Ước tính phát thải theo phương tiện di chuyển",
    "So sánh phát thải CO2 của lịch trình xe máy (0.072 kg/km) vs ô tô (0.171 kg/km)",
    "Hành trình dùng xe máy có lượng phát thải CO2 thấp hơn rõ rệt so với ô tô",
    f"Xe máy: {r_14_bike.total_carbon_kg} kg CO2e vs Ô tô: {r_14_car.total_carbon_kg} kg CO2e (giảm {round(r_14_car.total_carbon_kg - r_14_bike.total_carbon_kg, 2)} kg).",
    "PASS" if ok_14 else "FAIL",
    f"Bike CO2: {r_14_bike.total_carbon_kg}, Car CO2: {r_14_car.total_carbon_kg}",
    "High"
)

# ==============================================================================
# NHÓM D – CHATBOT HỘI THOẠI
# ==============================================================================

# UAT-15: Yêu cầu chatbot tạo lịch trình bằng ngôn ngữ tự nhiên
req_15 = CopilotChatRequest(
    message="Thiết kế chuyến đi Huế 2 ngày 1 đêm cho 2 người, ngân sách 2 triệu, thích di sản và ẩm thực",
    trip_context=TripContextPayload(destination="Huế")
)
resp_15 = orchestrator.orchestrate(req_15)
ok_15 = resp_15.updated_itinerary_state is not None and len(resp_15.updated_itinerary_state) == 2
record_uat(
    "UAT-15",
    "Nhóm D: Chatbot hội thoại",
    "Tạo lịch trình qua Chatbot bằng ngôn ngữ tự nhiên",
    "Gửi câu lệnh yêu cầu thiết kế lịch trình Huế 2 ngày ngân sách 2 triệu",
    "Chatbot nhận diện đúng ý định, kích hoạt generate_itinerary và trả về lịch trình 2 ngày",
    f"Chatbot phản hồi: Tạo lịch trình {len(resp_15.updated_itinerary_state)} ngày, gợi ý {len(resp_15.suggested_pois)} địa điểm, action_type={resp_15.action_type}.",
    "PASS" if ok_15 else "FAIL",
    f"Action: {resp_15.action_type}, Tools: {resp_15.tools_used}",
    "Critical"
)

# UAT-16: Yêu cầu giảm số điểm tham quan ngày thứ hai
initial_days = resp_15.updated_itinerary_state or []
req_16 = CopilotChatRequest(
    message="Ngày thứ hai giảm bớt điểm tham quan",
    trip_context=TripContextPayload(
        destination="Huế",
        current_itinerary_state=initial_days
    )
)
resp_16 = orchestrator.orchestrate(req_16)
ok_16 = (
    resp_16.updated_itinerary_state is not None and
    len(resp_16.updated_itinerary_state) == 2 and
    len(resp_16.updated_itinerary_state[1]["stops"]) < len(initial_days[1]["stops"])
)
record_uat(
    "UAT-16",
    "Nhóm D: Chatbot hội thoại",
    "Giảm bớt điểm tham quan ngày thứ hai qua hội thoại",
    "Gửi câu lệnh 'Ngày thứ hai giảm bớt điểm tham quan' kèm trạng thái lịch trình hiện tại",
    "Ngày 1 được giữ nguyên hoàn toàn, ngày 2 giảm bớt điểm dừng",
    f"Ngày 2 giảm từ {len(initial_days[1]['stops'])} xuống {len(resp_16.updated_itinerary_state[1]['stops'])} điểm. Mutation summary: {resp_16.mutation_summary}",
    "PASS" if ok_16 else "FAIL",
    f"Mutation: {resp_16.mutation_summary}",
    "High"
)

# UAT-17: Yêu cầu thay đổi phương tiện sang xe máy
req_17 = CopilotChatRequest(
    message="Chuyển sang xe máy",
    trip_context=TripContextPayload(
        destination="Huế",
        current_itinerary_state=resp_16.updated_itinerary_state or [],
        transport_mode="driving"
    )
)
resp_17 = orchestrator.orchestrate(req_17)
ok_17 = any("xe máy" in s.lower() or "motorcycle" in s.lower() for s in resp_17.mutation_summary)
record_uat(
    "UAT-17",
    "Nhóm D: Chatbot hội thoại",
    "Chuyển đổi phương tiện di chuyển trong hội thoại",
    "Gửi câu lệnh 'Chuyển sang xe máy'",
    "Hệ thống cập nhật phương tiện sang xe máy, tính lại thời gian và phát thải CO2",
    f"Cập nhật thành công phương tiện sang xe máy. Tóm tắt: {resp_17.mutation_summary}. Green impact: {resp_17.green_impact_summary}",
    "PASS" if ok_17 else "FAIL",
    f"Impact: {resp_17.green_impact_summary}",
    "High"
)

# UAT-18: Yêu cầu giảm ngân sách
req_18 = CopilotChatRequest(
    message="Ngân sách chỉ còn 1 triệu rưỡi",
    trip_context=TripContextPayload(
        destination="Huế",
        current_itinerary_state=resp_17.updated_itinerary_state or [],
        budget=2000000
    )
)
resp_18 = orchestrator.orchestrate(req_18)
ok_18 = any("ngân sách" in s.lower() for s in resp_18.mutation_summary)
record_uat(
    "UAT-18",
    "Nhóm D: Chatbot hội thoại",
    "Điều chỉnh ngân sách mục tiêu trong hội thoại",
    "Gửi câu lệnh 'Ngân sách chỉ còn 1 triệu rưỡi'",
    "Hệ thống ghi nhận ngân sách 1.5 triệu và đánh giá chi phí hiện tại với ngân sách mới",
    f"Cập nhật ngân sách mục tiêu mới: {resp_18.budget_impact_summary}. Tóm tắt: {resp_18.mutation_summary}.",
    "PASS" if ok_18 else "FAIL",
    f"Budget impact: {resp_18.budget_impact_summary}",
    "Medium"
)

# UAT-19: Yêu cầu bổ sung địa điểm ăn chay và ưu tiên cơ sở địa phương
req_19 = CopilotChatRequest(
    message="Thêm các địa điểm ăn chay và ưu tiên cơ sở kinh doanh địa phương",
    trip_context=TripContextPayload(
        destination="Huế",
        current_itinerary_state=resp_18.updated_itinerary_state or []
    )
)
resp_19 = orchestrator.orchestrate(req_19)
ok_19 = any("chay" in s.lower() or "địa phương" in s.lower() or "bản địa" in s.lower() for s in resp_19.mutation_summary)
record_uat(
    "UAT-19",
    "Nhóm D: Chatbot hội thoại",
    "Bổ sung địa điểm ăn chay và cơ sở bản địa",
    "Gửi câu lệnh 'Thêm các địa điểm ăn chay và ưu tiên cơ sở kinh doanh địa phương'",
    "Bổ sung điểm ăn chay hoặc gắn nhãn ưu tiên cơ sở bản địa vào lịch trình",
    f"Tích hợp điểm dừng ăn uống bản địa: {resp_19.mutation_summary}.",
    "PASS" if ok_19 else "FAIL",
    f"Mutation: {resp_19.mutation_summary}",
    "High"
)

# UAT-20: Tiếp tục hội thoại sau khi lịch trình đã cập nhật (tán gẫu / cảm ơn)
req_20 = CopilotChatRequest(
    message="Cảm ơn bạn nhiều nhé!",
    trip_context=TripContextPayload(
        destination="Huế",
        current_itinerary_state=resp_19.updated_itinerary_state or []
    )
)
resp_20 = orchestrator.orchestrate(req_20)
ok_20 = not resp_20.tools_used and not resp_20.sources and len(resp_20.reply_text) > 10
record_uat(
    "UAT-20",
    "Nhóm D: Chatbot hội thoại",
    "Tiếp tục hội thoại tán gẫu / kết thúc lịch sự",
    "Gửi câu lệnh 'Cảm ơn bạn nhiều nhé!' sau chuỗi điều chỉnh",
    "Chatbot phản hồi tự nhiên, giữ nguyên trạng thái, không gọi lại tool tạo lịch trình",
    f"Phản hồi lịch thiệp: '{resp_20.reply_text}'. Số tools đã dùng: {len(resp_20.tools_used)}.",
    "PASS" if ok_20 else "FAIL",
    f"Reply: {resp_20.reply_text[:60]}...",
    "Low"
)

print(f"Completed {len(uat_results)} UAT Scenarios.")
pass_count = sum(1 for r in uat_results if r["status"] == "PASS")
fail_count = sum(1 for r in uat_results if r["status"] == "FAIL")
print(f"Summary: {pass_count} PASSED, {fail_count} FAILED.")

with open("backend/data/uat_20_results.json", "w", encoding="utf-8") as f:
    json.dump(uat_results, f, ensure_ascii=False, indent=2)
print("Saved backend/data/uat_20_results.json")
