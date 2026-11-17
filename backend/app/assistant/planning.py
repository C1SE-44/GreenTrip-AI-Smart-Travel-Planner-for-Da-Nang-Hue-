"""Pure planning and validation: preview first, no network or persistence here."""

from copy import deepcopy
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from fastapi import HTTPException
from app.assistant.search import distance, fold

VN = timezone(timedelta(hours=7))


def now_vn():
    return datetime.now(VN)


def empty_itinerary(trip_id, context):
    start = context.start_date
    if start:
        try:
            datetime.fromisoformat(start)
        except ValueError:
            raise HTTPException(422, "Ngày khởi hành cần có dạng YYYY-MM-DD.")
    return {
        "trip_id": trip_id,
        "title": context.title,
        "destination": context.destination,
        "start_date": start,
        "days_count": context.days_count,
        "days": [
            {
                "day_id": f"{trip_id}-day-{i}",
                "day_number": i,
                "date": (
                    (datetime.fromisoformat(start) + timedelta(days=i - 1))
                    .date()
                    .isoformat()
                    if start
                    else None
                ),
                "title": f"Ngày {i}",
                "stops": [],
            }
            for i in range(1, context.days_count + 1)
        ],
    }


def minute(text):
    hour, minutes = map(int, text.split(":"))
    return hour * 60 + minutes


def clock(value):
    return f"{value//60:02d}:{value%60:02d}"


def stop_end(stop):
    return (
        minute(stop["end_time"])
        if stop.get("end_time")
        else minute(stop["start_time"]) + int(stop.get("duration_minutes") or 60)
    )


def validate_past(before, after, now=None):
    current = now or now_vn()
    today = current.date().isoformat()

    old = {d["day_number"]: d for d in before.get("days", [])}
    for day in after["days"]:
        previous = old.get(day["day_number"], {})
        if day.get("date") and day["date"] < today and day != previous:
            raise HTTPException(
                422, "Không thể chỉnh ngày đã qua. Chọn lại ngày khởi hành trước nhé."
            )
        if day.get("date") == today:
            old_stops = {s["stop_id"]: s for s in previous.get("stops", [])}
            new_stops = {s["stop_id"]: s for s in day["stops"]}
            for key, s in old_stops.items():
                if (
                    s.get("start_time")
                    and minute(s["start_time"]) < current.hour * 60 + current.minute
                    and new_stops.get(key) != s
                ):
                    raise HTTPException(422, "Hoạt động đã bắt đầu được giữ nguyên.")
            for key, s in new_stops.items():
                if (
                    s.get("start_time")
                    and minute(s["start_time"]) < current.hour * 60 + current.minute
                    and old_stops.get(key) != s
                ):
                    raise HTTPException(422, "Không thể xếp hoạt động vào giờ đã qua.")


def opening_windows(poi):
    hours = poi.get("opening_hours") or {}
    # Only use explicit numeric windows; open_now does not establish tomorrow's hours.
    if isinstance(hours, dict) and hours.get("open_time") and hours.get("close_time"):
        try:
            return minute(hours["open_time"]), minute(hours["close_time"])
        except (ValueError, TypeError):
            pass
    return None


def edit_plan(base, edits, points, idea_ids, result_ids):
    """Surgical edits only; fixed stops and all unmentioned fields survive verbatim."""
    plan = deepcopy(base)
    by_id = {str(p["id"]): p for p in points}
    for number, spec in edits.items():
        if not spec:
            continue
        if number == "pending":
            raise HTTPException(422, "Bạn muốn chỉnh ngày nào trong chuyến?")
        day = next((d for d in plan["days"] if d["day_number"] == int(number)), None)
        if not day:
            raise HTTPException(422, "Ngày này nằm ngoài chuyến đi.")
        if not day.get("date"):
            if not plan.get("start_date"):
                raise HTTPException(422, "Bạn chọn ngày khởi hành trước nhé.")
            day["date"] = (
                (
                    datetime.fromisoformat(plan["start_date"])
                    + timedelta(days=int(number) - 1)
                )
                .date()
                .isoformat()
            )
        if spec.get("start_after") == "later":
            raise HTTPException(422, "Sáng hôm đó bạn muốn bắt đầu lúc mấy giờ?")
        stops = day.get("stops", [])
        lunch = [
            s
            for s in stops
            if "trua" in fold(s.get("title"))
            or (
                s.get("stop_type") == "rest"
                and s.get("start_time")
                and 12 * 60 <= minute(s["start_time"]) < 14 * 60
            )
        ]
        if spec.get("meal") == "lunch" and not lunch:
            raise HTTPException(422, "Chỗ ăn trưa cần giữ là điểm nào trong ngày này?")
        if spec.get("start_after"):
            morning = [
                s
                for s in stops
                if s not in lunch
                and s.get("start_time")
                and minute(s["start_time"]) < 12 * 60
            ]
            if not morning:
                raise HTTPException(
                    422, "Ngày này chưa có hoạt động buổi sáng có giờ để điều chỉnh."
                )
            delta = max(
                0,
                minute(spec["start_after"])
                - min(minute(s["start_time"]) for s in morning),
            )
            for stop in morning:
                end = stop_end(stop) + delta
                stop["start_time"] = clock(minute(stop["start_time"]) + delta)
                stop["end_time"] = clock(end)
        if spec.get("replace_stop"):
            eligible = [s for s in stops if s.get("poi_id") and s not in lunch]
            if not eligible:
                raise HTTPException(422, "Ngày này chưa có điểm tham quan để thay.")
            old = eligible[-1 if spec["replace_stop"] == "last" else 0]
            previous = next(
                (s for s in reversed(stops[: stops.index(old)]) if s.get("poi_id")),
                None,
            )
            origin = by_id.get(str((previous or {}).get("poi_id")))
            old_point = by_id.get(str(old.get("poi_id")))
            old_distance = distance(origin, old_point) if origin and old_point else None

            def closer(point):
                km = distance(origin, point) if origin else None
                return old_distance is not None and km is not None and km < old_distance

            candidate = spec.get("_replacement_id")
            ref = spec.get("replacement")
            if ref:
                ids = result_ids if ref["source"] == "results" else idea_ids
                if ref["index"] > len(ids):
                    raise HTTPException(
                        422,
                        "Thẻ thay thế không còn trong danh sách. Bạn chọn lại điểm nhé.",
                    )
                candidate = ids[ref["index"] - 1]
            if not candidate:
                used = {str(s.get("poi_id")) for d in plan["days"] for s in d["stops"]}
                candidate = next(
                    (
                        id
                        for id in idea_ids
                        if id in by_id
                        and id not in used
                        and (not spec.get("nearer") or closer(by_id[id]))
                    ),
                    None,
                )
            point = by_id.get(candidate)
            if spec.get("nearer") and (not point or not closer(point)):
                raise HTTPException(
                    422,
                    "Chưa có điểm thay thế đủ tọa độ và gần điểm trước hơn. Bạn muốn chọn điểm khác trong Ý tưởng hay bỏ yêu cầu gần hơn?",
                )
            if not point:
                raise HTTPException(
                    422,
                    "Bạn muốn thay bằng điểm nào trong Ý tưởng hoặc các thẻ vừa xem?",
                )
            destination = old.get("city") or plan.get("destination")
            if destination in ("Huế", "Đà Nẵng") and fold(destination).replace(
                " ", ""
            ) != fold(point.get("city")).replace(" ", ""):
                raise HTTPException(
                    422, "Điểm thay thế thuộc thành phố khác ngày đang chỉnh."
                )
            if not old.get("start_time"):
                raise HTTPException(422, "Bạn nhập giờ cho điểm cần thay trước nhé.")
            start = minute(old["start_time"])
            duration = max(20, min(240, int(point.get("average_visit_minutes") or 60)))
            end = start + duration
            window = opening_windows(point)
            if end > 17 * 60 or window and (start < window[0] or end > window[1]):
                raise HTTPException(
                    422,
                    "Điểm thay thế chưa phù hợp khung giờ đang giữ. Bạn chọn điểm khác nhé.",
                )
            old.update(
                poi_id=str(point["id"]),
                title=point["name"],
                city=point.get("city"),
                address=point.get("address"),
                category=point.get("category"),
                latitude=point.get("latitude"),
                longitude=point.get("longitude"),
                duration_minutes=duration,
                end_time=clock(end),
                source="assistant",
                comment="Thay riêng điểm này; cần kiểm tra lại thời gian di chuyển và giờ mở cửa nếu chưa có dữ liệu.",
            )
            spec["_replacement_id"] = str(point["id"])
        timed = sorted(
            [s for s in stops if s.get("start_time")],
            key=lambda s: minute(s["start_time"]),
        )
        for left, right in zip(timed, timed[1:]):
            if stop_end(left) > minute(right["start_time"]):
                raise HTTPException(
                    422,
                    "Giờ mới trùng hoạt động đang giữ. Bạn muốn bắt đầu sớm hơn hay giảm thời lượng buổi sáng?",
                )
    validate_past(base, plan)
    return plan, [
        "Giữ các điểm và ngày không được yêu cầu sửa. Thời gian di chuyển giữa các điểm sau khi thay cần kiểm tra lại."
    ]


def change_summary(before, after):
    changes = []
    kept_stops = kept_days = 0
    old_days = {d["day_number"]: d for d in before.get("days", [])}
    for day in after["days"]:
        previous = old_days.get(day["day_number"], {})
        if previous == day:
            kept_days += 1
            continue
        old_stops = {s["stop_id"]: s for s in previous.get("stops", [])}
        for stop in day["stops"]:
            old = old_stops.get(stop["stop_id"], {})
            if old == stop:
                kept_stops += 1
            elif old.get("poi_id") != stop.get("poi_id"):
                changes.append(
                    f"Ngày {day['day_number']}: đổi điểm {old.get('title','')} → {stop.get('title','')}"
                )
            elif old.get("start_time") != stop.get("start_time"):
                changes.append(
                    f"Ngày {day['day_number']}: giờ {stop.get('title','')} {old.get('start_time','')} → {stop.get('start_time','')}"
                )
    return (
        ". ".join(changes[:8])
        + f". Giữ {kept_stops} hoạt động trong ngày đang sửa và {kept_days} ngày không đổi. Đây là bản nháp; bấm Áp dụng để lưu."
    )


def create_plan(before, points, target_day=None, light=False, fast=False, per_day=None, balance=False):
    plan = deepcopy(before)
    overflow = []
    warnings = []
    current = now_vn()
    if not plan.get("start_date"):
        raise HTTPException(
            422, "Bạn chọn ngày khởi hành trước nhé, để mình tránh xếp vào ngày đã qua."
        )
    if target_day is not None and target_day not in [
        d["day_number"] for d in plan["days"]
    ]:
        raise HTTPException(422, "Ngày bạn chọn nằm ngoài chuyến đi.")
    today = current.date().isoformat()

    def date_for(day):
        return (
            day.get("date")
            or (
                datetime.fromisoformat(plan["start_date"])
                + timedelta(days=day["day_number"] - 1)
            )
            .date()
            .isoformat()
        )

    protected_ids = {
        str(s["poi_id"])
        for day in plan["days"]
        for s in day.get("stops", [])
        if s.get("poi_id")
        and (
            date_for(day) < today
            or (
                date_for(day) == today
                and s.get("start_time")
                and minute(s["start_time"]) < current.hour * 60 + current.minute
            )
        )
    }
    remaining = [p for p in points if str(p["id"]) not in protected_ids]
    touched = False
    for day in plan["days"]:
        if target_day is not None and day["day_number"] != target_day:
            continue
        if date_for(day) < today:
            continue
        day["date"] = date_for(day)
        touched = True
        old = day.get("stops", [])
        locked = [
            s
            for s in old
            if day.get("date") == current.date().isoformat()
            and s.get("start_time")
            and minute(s["start_time"]) < current.hour * 60 + current.minute
        ]
        available_ids = {str(p["id"]) for p in points}
        preserved = [
            s
            for s in old
            if s not in locked
            and not (balance and s.get("poi_id"))
            and (not s.get("poi_id") or str(s["poi_id"]) not in available_ids)
        ]
        fixed = [s for s in preserved if s.get("start_time") and s.get("end_time")]
        untimed = [s for s in preserved if s not in fixed]
        if (
            untimed
            and "Giữ các hoạt động cũ chưa đủ dữ liệu; bạn kiểm tra và nhập giờ riêng nhé."
            not in warnings
        ):
            warnings.append(
                "Giữ các hoạt động cũ chưa đủ dữ liệu; bạn kiểm tra và nhập giờ riêng nhé."
            )
        day["stops"] = locked[:] + fixed
        cursor = max(
            9 * 60,
            (
                ((current.hour * 60 + current.minute + 14) // 15) * 15
                if day.get("date") == current.date().isoformat()
                else 0
            ),
        )
        if locked:
            cursor = max(
                cursor,
                max(stop_end(s) for s in locked),
            )
        # Keep user meal/rest appointments and reserve one lunch window if none was entered.
        if (
            (remaining or old)
            and cursor < 13 * 60
            and not any(
                minute(s["start_time"]) < 13 * 60 and stop_end(s) > 12 * 60
                for s in day["stops"]
            )
        ):
            lunch_start = max(cursor, 12 * 60)
            fixed.append(
                {
                    "stop_id": str(uuid4()),
                    "title": "Ăn trưa và nghỉ",
                    "stop_type": "rest",
                    "source": "assistant",
                    "sequence": len(day["stops"]),
                    "duration_minutes": 13 * 60 - lunch_start,
                    "start_time": clock(lunch_start),
                    "end_time": "13:00",
                }
            )
            day["stops"].append(fixed[-1])
        last = next(
            (
                p
                for p in points
                if locked and str(p["id"]) == str(locked[-1].get("poi_id"))
            ),
            None,
        )
        count = 0
        future_days = sum(1 for candidate in plan["days"] if candidate["day_number"] >= day["day_number"] and date_for(candidate) >= today)
        capacity = per_day if per_day is not None else (2 if light else 5)
        if balance:
            capacity = min(capacity, max(1, (len(remaining) + future_days - 1) // future_days))
        while remaining and count < capacity:
            if last:
                remaining.sort(
                    key=lambda p: (
                        distance(last, p)
                        if distance(last, p) is not None
                        else float("inf")
                    )
                )
            poi = remaining.pop(0)
            km = distance(last, poi) if last else 0
            travel = (
                30 if km is None else round((km / 25 * 60 + 5) * 1.5) if km > 0 else 0
            )
            duration = max(20, min(240, int(poi.get("average_visit_minutes") or 60)))
            if fast:
                duration = max(20, round(duration * 0.5))
            start = cursor + travel
            window = opening_windows(poi)
            if window:
                start = max(start, window[0])
            for block in sorted(fixed, key=lambda s: minute(s["start_time"])):
                if start < minute(block["end_time"]) and start + duration > minute(
                    block["start_time"]
                ):
                    start = minute(block["end_time"]) + travel
            if start + duration > 17 * 60 or (window and start + duration > window[1]):
                overflow.append(poi)
                continue
            travel_note = (
                "Chưa tính chặng đến điểm đầu trong ngày."
                if last is None
                else (
                    "Thiếu tọa độ: chừa dự phòng 30 phút, chưa biết thời gian đi thực tế."
                    if km is None
                    else f"Di chuyển ước tính {travel} phút (đã đệm ×1,5); chưa phải ETA đường đi."
                )
            )
            day["stops"].append(
                {
                    "stop_id": str(uuid4()),
                    "poi_id": str(poi["id"]),
                    "title": poi["name"],
                    "city": poi.get("city"),
                    "address": poi.get("address"),
                    "category": poi.get("category"),
                    "stop_type": "poi",
                    "source": "assistant",
                    "sequence": len(day["stops"]),
                    "duration_minutes": duration,
                    "start_time": clock(start),
                    "end_time": clock(start + duration),
                    "latitude": poi.get("latitude"),
                    "longitude": poi.get("longitude"),
                    "comment": travel_note
                    + (
                        " Thời lượng ghé tạm tính 60 phút."
                        if not poi.get("average_visit_minutes")
                        else ""
                    )
                    + (" Cần kiểm tra giờ mở cửa." if not window else ""),
                }
            )
            if (
                not window
                and "Cần kiểm tra giờ mở cửa tại các điểm chưa có khung giờ rõ ràng."
                not in warnings
            ):
                warnings.append(
                    "Cần kiểm tra giờ mở cửa tại các điểm chưa có khung giờ rõ ràng."
                )
            cursor = start + duration + 15
            last = poi
            count += 1
        remaining.extend(overflow)
        overflow = []
        day["stops"].extend(untimed)
        day["stops"].sort(
            key=lambda stop: (
                minute(stop["start_time"]) if stop.get("start_time") else 24 * 60
            )
        )
        for index, stop in enumerate(day["stops"]):
            if stop not in locked:
                stop["sequence"] = index
    if not touched:
        raise HTTPException(
            422, "Các ngày của chuyến đã qua; hãy đổi ngày khởi hành trước."
        )
    validate_past(before, plan)
    if remaining:
        warnings.append(
            f"{len(remaining)} điểm chưa xếp vừa thời gian hoặc giờ mở cửa: " + "; ".join(p["name"] for p in remaining) + ". Các điểm này chưa được đưa vào lịch; Ý tưởng không bị thay đổi."
        )
    if fast:
        warnings.append(
            "Lịch dày: thời lượng ghé thăm giảm còn tối đa một nửa theo lựa chọn của bạn."
        )
    warnings.append(
        "Thời gian di chuyển tính từ tọa độ, không gọi dịch vụ tuyến có phí; chi phí khách sạn/ăn uống chưa được cộng thành tổng chuyến."
    )
    return plan, warnings
