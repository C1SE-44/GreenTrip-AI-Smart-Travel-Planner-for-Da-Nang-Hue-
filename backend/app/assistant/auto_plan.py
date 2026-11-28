"""Explicit consent to complete a trip with catalogue POIs; preview only."""
import re
from app.assistant import search, planning


def understand(message, state):
    text = search.fold(message)
    quota = re.search(r"(?:moi ngay|ngay)\s*(\d+)\s*(?:diem|dia diem)", text) or re.search(r"(\d+)\s*(?:diem|dia diem)\s*(?:/\s*ngay|moi ngay)", text)
    if re.search(r"(?:khong|dung)(?: duoc)?\s*tu\s*(?:chon|len|lap|xep)", text):
        return None
    consent = bool(re.search(r"(?:ban|bot|ai|minh)?\s*tu\s*(?:len|chon|lap|xep)|chon them|bo sung them", text))
    if quota or consent:
        return {"per_day": int(quota[1]) if quota else state.get("pending_auto_plan", {}).get("per_day", 2), "consent": consent}
    return None


def preview(spec, state, ctx, current, trip_id, propose):
    if not trip_id:
        return {"text": "Bạn chọn chuyến đi trước để mình tạo bản xem trước nhé.", "prompts": []}
    per_day = spec["per_day"]
    if not 1 <= per_day <= 200:
        return {"text": "Bạn chọn từ 1 đến 200 điểm mỗi ngày để mình kiểm tra thời gian nhé.", "prompts": []}
    needed = ctx.days_count * per_day
    # Only accept actual IDs in the current request. Never recover stale browser ideas from chat history.
    saved = search.catalogue(ids=ctx.idea_ids) if ctx.idea_ids else []
    saved = list({str(p["id"]): p for p in saved}.values())
    state["pending_auto_plan"] = {"per_day": per_day}
    if len(saved) < needed and not spec["consent"]:
        missing = needed - len(saved)
        return {"text": f"Chuyến này có {len(saved)} điểm đã lưu đủ điều kiện. Bạn muốn mình giữ các điểm đó và chọn thêm {missing} điểm để đủ {ctx.days_count} ngày, mỗi ngày {per_day} điểm không?", "prompts": [{"label": "Tự chọn thêm điểm", "message": "Bạn tự chọn thêm và lên lịch cho tôi đi"}]}
    points = list(saved)
    if spec["consent"] and len(points) < needed:
        candidates, _, _ = search.search({"city": ctx.destination, "omit_ids": [str(p["id"]) for p in points]}, ctx.preferences)
        points += candidates[:needed-len(points)]
    before = current or planning.empty_itinerary(trip_id, ctx)
    alternatives = planning.build_alternatives(
        before,
        points,
        per_day=per_day,
        day_start=ctx.activity_start_time or "09:00",
        day_end=ctx.activity_end_time or "17:00",
    )
    if not alternatives:
        return {"text": "Chưa tạo được lịch nháp; các Ý tưởng của bạn vẫn được giữ nguyên.", "prompts": []}
    after = alternatives[0]["itinerary"]
    warnings = alternatives[0]["warnings"]
    saved_ids = {str(p["id"]) for p in saved}
    actual = []
    for day in after["days"]:
        for stop in day["stops"]:
            if stop.get("poi_id"):
                actual.append(str(stop["poi_id"]))
                stop["comment"] = ("Đã lưu trong Ý tưởng. " if str(stop["poi_id"]) in saved_ids else "Đề xuất thêm; chưa lưu vào Ý tưởng. ") + (stop.get("comment") or "")
    counts = [sum(bool(s.get("poi_id")) for s in day["stops"]) for day in after["days"]]
    if any(n != per_day for n in counts):
        warnings.append("Chưa xếp đủ số điểm mỗi ngày do dữ liệu hoặc giới hạn thời gian; kiểm tra từng ngày trước khi áp dụng.")
    state.pop("pending_auto_plan", None)
    for alternative in alternatives:
        alternative["selected_poi_ids"] = [str(point["id"]) for point in points]
    draft = propose(
        state, current, after, warnings,
        alternatives=alternatives,
        primary_alternative_id=alternatives[0]["id"],
    )
    return {"text": f"Mình tạo bản xem trước {ctx.days_count} ngày với {len(actual)} điểm: {sum(i in saved_ids for i in actual)} điểm đã lưu, {sum(i not in saved_ids for i in actual)} điểm đề xuất thêm. Chưa thay đổi Ý tưởng hoặc lịch đã lưu.", "draft": draft, "prompts": []}
