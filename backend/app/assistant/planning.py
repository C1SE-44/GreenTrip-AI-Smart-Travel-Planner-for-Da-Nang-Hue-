"""Pure planning and validation: preview first, no network or persistence here."""

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import re
from uuid import uuid4
from fastapi import HTTPException
from app.assistant.search import distance, fold, upper_price
from app.pois.model import INACTIVE_POI_STATUSES

VN = timezone(timedelta(hours=7))
DEFAULT_DAY_START = 9 * 60
DEFAULT_DAY_END = 17 * 60
UNKNOWN_VISIT_MINUTES = 60
DEFAULT_BREAK_AFTER_MINUTES = 180
DEFAULT_BREAK_MINUTES = 15


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


def validate_past(before, after, now=None, *, ignore_elapsed=False):
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
            if ignore_elapsed:
                continue
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


def _clock_minutes(value):
    if isinstance(value, dict):
        value = value.get("time") or value.get("value")
    if not isinstance(value, str):
        return None
    text = value.strip().lower()
    match = re.fullmatch(r"(\d{1,2}):?(\d{2})(?:\s*(am|pm))?", text)
    if not match:
        return None
    hour, minutes = int(match[1]), int(match[2])
    if minutes > 59 or hour > 24 or (hour == 24 and minutes):
        return None
    if match[3]:
        if hour < 1 or hour > 12:
            return None
        hour = hour % 12 + (12 if match[3] == "pm" else 0)
    return hour * 60 + minutes


def _weekday(value):
    key = fold(value).strip().rstrip(":")
    aliases = {
        "mon": 0, "monday": 0, "thu 2": 0, "thu hai": 0,
        "tue": 1, "tuesday": 1, "thu 3": 1, "thu ba": 1,
        "wed": 2, "wednesday": 2, "thu 4": 2, "thu tu": 2,
        "thu": 3, "thursday": 3, "thu 5": 3, "thu nam": 3,
        "fri": 4, "friday": 4, "thu 6": 4, "thu sau": 4,
        "sat": 5, "saturday": 5, "thu 7": 5, "thu bay": 5,
        "sun": 6, "sunday": 6, "chu nhat": 6,
    }
    if key in aliases:
        return aliases[key]
    # Google Places uses Sunday=0, while Python date.weekday() uses Monday=0.
    if key.isdigit() and 0 <= int(key) <= 6:
        return (int(key) + 6) % 7
    return None


def _intervals_from_text(value):
    text = fold(value)
    if any(token in text for token in ("dong cua", "closed", "nghi")):
        return []
    if "24 gio" in text or "24 hours" in text or "ca ngay" in text:
        return [(0, 24 * 60)]
    pairs = re.findall(
        r"(\d{1,2}:?\d{2}\s*(?:am|pm)?)\s*(?:-|–|—|den|to)\s*"
        r"(\d{1,2}:?\d{2}\s*(?:am|pm)?)",
        str(value or ""),
        flags=re.IGNORECASE,
    )
    result = []
    for start_text, end_text in pairs:
        start = _clock_minutes(start_text)
        end = _clock_minutes(end_text)
        if start is not None and end is not None:
            if end == 0:
                end = 24 * 60
            if end > start:
                result.append((start, end))
    return result if result else None


def _normalize_intervals(value):
    if isinstance(value, str):
        return _intervals_from_text(value)
    if isinstance(value, dict):
        start = _clock_minutes(value.get("open") or value.get("start") or value.get("opens_at"))
        end = _clock_minutes(value.get("close") or value.get("end") or value.get("closes_at"))
        if start is not None and end is not None:
            if end == 0:
                end = 24 * 60
            return [(start, end)] if end > start else None
        return None
    if isinstance(value, list):
        intervals = []
        for item in value:
            parsed = _normalize_intervals(item)
            if parsed:
                intervals.extend(parsed)
        return intervals or None
    return None


def _weekly_opening_schedule(hours):
    schedule = {}
    weekday_text = hours.get("weekday_text")
    if isinstance(weekday_text, list):
        for line in weekday_text:
            if not isinstance(line, str) or ":" not in line:
                continue
            label, value = line.split(":", 1)
            day = _weekday(label)
            if day is not None:
                schedule[day] = _intervals_from_text(value)
        if schedule:
            return schedule, len(schedule) == 7

    periods = hours.get("periods")
    if isinstance(periods, list):
        recognized = False
        for period in periods:
            if not isinstance(period, dict):
                continue
            opening = period.get("open")
            closing = period.get("close")
            if not isinstance(opening, dict):
                continue
            raw_day = opening.get("day")
            if not isinstance(raw_day, int) or raw_day not in range(7):
                continue
            start = _clock_minutes(opening.get("time"))
            if start is None:
                continue
            day = (raw_day + 6) % 7
            recognized = True
            schedule.setdefault(day, [])
            end = _clock_minutes(closing.get("time")) if isinstance(closing, dict) else 24 * 60
            if end is None:
                continue
            closing_day = closing.get("day", raw_day) if isinstance(closing, dict) else raw_day
            if closing_day != raw_day:
                end = 24 * 60
                if isinstance(closing_day, int) and closing_day in range(7):
                    next_day = (closing_day + 6) % 7
                    next_end = _clock_minutes(closing.get("time")) if isinstance(closing, dict) else None
                    if next_end is not None:
                        schedule.setdefault(next_day, []).append((0, next_end))
            elif end == 0:
                end = 24 * 60
            if end > start:
                schedule[day].append((start, end))
        if recognized:
            return schedule, True

    for label, value in hours.items():
        day = _weekday(label)
        if day is not None:
            schedule[day] = _normalize_intervals(value)
    return (schedule, False) if schedule else (None, False)


def opening_intervals(poi, day_date=None):
    """Return (intervals, quality); None intervals mean opening hours are unknown."""
    hours = poi.get("opening_hours")
    if not isinstance(hours, dict) or not hours:
        return None, "unknown"
    if hours.get("open_time") and hours.get("close_time"):
        start = _clock_minutes(hours["open_time"])
        end = _clock_minutes(hours["close_time"])
        if start is not None and end is not None:
            if end == 0:
                end = 24 * 60
            return ([(start, end)], "known") if end > start else (None, "unknown")

    schedule, complete = _weekly_opening_schedule(hours)
    if not schedule:
        return None, "unknown"
    if day_date:
        try:
            target_day = datetime.fromisoformat(str(day_date)).date().weekday()
        except ValueError:
            return None, "unknown"
        if target_day in schedule:
            intervals = schedule[target_day]
            return (intervals, "known") if intervals is not None else (None, "unknown")
        return ([], "known") if complete else (None, "unknown")
    # Flexible dates may use an open day, but no weekday-specific claim is made.
    intervals = [interval for day_intervals in schedule.values() for interval in (day_intervals or [])]
    if intervals:
        return intervals, "unknown_date"
    if complete and len(schedule) == 7:
        return [], "known"
    return None, "unknown_date"


def opening_windows(poi, day_date=None):
    windows, quality = opening_intervals(poi, day_date)
    return windows[0] if windows and quality != "unknown" else None


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
            windows, opening_quality = opening_intervals(point, day.get("date"))
            outside_opening_hours = (
                opening_quality == "known"
                and windows is not None
                and not any(start >= window_start and end <= window_end for window_start, window_end in windows)
            )
            if end > 17 * 60 or outside_opening_hours:
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


def _point_city_key(point):
    city_id = point.get("city_id")
    if city_id is not None:
        return f"id:{city_id}"
    city = fold(point.get("city")).replace(" ", "")
    return f"name:{city}" if city else "unknown"


def _point_is_inactive(point):
    status = str(point.get("status") or "").strip().upper()
    active = point.get("is_active")
    return active is False or active == 0 or status in INACTIVE_POI_STATUSES


def _unique_points(points):
    unique = []
    seen = set()
    for point in points:
        if not isinstance(point, dict) or point.get("id") is None:
            continue
        point_id = str(point["id"])
        if point_id in seen:
            continue
        seen.add(point_id)
        unique.append(point)
    return unique


def _day_group_order(points, destination):
    groups = {}
    for index, point in enumerate(points):
        groups.setdefault(_point_city_key(point), []).append((index, point))
    destination_text = fold(destination)

    def group_rank(item):
        key, members = item
        city = fold(members[0][1].get("city"))
        position = destination_text.find(city) if city else -1
        return (0 if position >= 0 else 1, position if position >= 0 else members[0][0], key)

    ordered = sorted(groups.items(), key=group_rank)
    return [point for _, members in ordered for _, point in members]


def _latest_closing_priority(point, day_date):
    intervals, quality = opening_intervals(point, day_date)
    if not intervals:
        return (1, 24 * 60, 0)
    return (0, min(end for _, end in intervals), min(end - start for start, end in intervals))


def create_plan(
    before,
    points,
    target_day=None,
    light=False,
    fast=False,
    per_day=None,
    balance=False,
    strategy="nearby",
    day_start="09:00",
    day_end="17:00",
    details=None,
    ignore_elapsed_clock=False,
    protected_stop_ids=None,
    first_day=None,
    minimum_day_by_poi=None,
):
    """Create a non-persisted draft without truncating selected POIs."""
    plan = deepcopy(before)
    warnings = []
    current = now_vn()
    unique_points = _unique_points(points)
    day_start_min = _clock_minutes(day_start)
    day_end_min = _clock_minutes(day_end)
    if day_start_min is None or day_end_min is None or day_end_min <= day_start_min:
        raise HTTPException(422, "Khung giờ tham quan chưa hợp lệ.")
    if per_day is not None and (not isinstance(per_day, int) or per_day < 1):
        raise HTTPException(422, "Số điểm mỗi ngày cần là số nguyên dương.")
    if target_day is not None and target_day not in [d["day_number"] for d in plan["days"]]:
        raise HTTPException(422, "Ngày bạn chọn nằm ngoài chuyến đi.")
    if first_day is not None and (not isinstance(first_day, int) or first_day not in [d["day_number"] for d in plan["days"]]):
        raise HTTPException(422, "Ngày bắt đầu điều chỉnh nằm ngoài chuyến đi.")
    minimum_day_by_poi = minimum_day_by_poi or {}
    day_numbers = {d["day_number"] for d in plan["days"]}
    if any(str(key) not in {str(point["id"]) for point in unique_points} or value not in day_numbers for key, value in minimum_day_by_poi.items()):
        raise HTTPException(422, "Ngày dời địa điểm chưa hợp lệ.")
    today = current.date().isoformat()

    def date_for(day):
        if day.get("date"):
            return day["date"]
        if plan.get("start_date"):
            return (
                datetime.fromisoformat(plan["start_date"])
                + timedelta(days=day["day_number"] - 1)
            ).date().isoformat()
        return None

    by_id = {str(point["id"]): point for point in unique_points}
    inactive = {str(p["id"]) for p in unique_points if _point_is_inactive(p)}
    ordered_points = _day_group_order(
        [point for point in unique_points if str(point["id"]) not in inactive],
        plan.get("destination") or "",
    )
    remaining = list(ordered_points)
    touched = False
    scheduled_details = []
    attempted_days = {str(point["id"]): [] for point in unique_points}
    rejection_codes = {str(point["id"]): set() for point in unique_points}
    total_travel_minutes = 0
    total_distance_km = 0.0
    unknown_route_legs = 0
    total_opening_wait = 0
    break_after = 120 if light else DEFAULT_BREAK_AFTER_MINUTES
    break_length = 30 if light else DEFAULT_BREAK_MINUTES

    protected_stop_ids = {str(value) for value in (protected_stop_ids or [])}
    protected_ids = set()
    for day_index, day in enumerate(plan["days"]):
        date_value = date_for(day)
        if date_value and date_value < today:
            protected_ids.update(
                str(stop["poi_id"])
                for stop in day.get("stops", [])
                if stop.get("poi_id")
            )
        elif date_value == today and not ignore_elapsed_clock:
            protected_ids.update(
                str(stop["poi_id"])
                for stop in day.get("stops", [])
                if stop.get("poi_id") and stop.get("start_time")
                and minute(stop["start_time"]) < current.hour * 60 + current.minute
            )
    if ignore_elapsed_clock:
        protected_ids.update(
            str(stop.get("poi_id"))
            for day in plan["days"]
            for stop in day.get("stops", [])
            if stop.get("stop_id") is not None
            and str(stop["stop_id"]) in protected_stop_ids
            and stop.get("poi_id")
        )
    preserve_ids = set()
    selected_ids = {str(point["id"]) for point in unique_points}
    for existing_day in plan["days"]:
        existing_date = date_for(existing_day)
        in_scope = (target_day is None or existing_day["day_number"] == target_day) and (first_day is None or existing_day["day_number"] >= first_day)
        for stop in existing_day.get("stops", []):
            poi_id = str(stop.get("poi_id")) if stop.get("poi_id") else None
            if not poi_id:
                continue
            is_locked = poi_id in protected_ids
            is_explicitly_fixed = stop.get("source") in {"manual", "idea"}
            if (not in_scope and (not ignore_elapsed_clock or poi_id not in selected_ids)) or (existing_date and existing_date < today) or is_locked or is_explicitly_fixed or poi_id not in selected_ids:
                preserve_ids.add(poi_id)
    remaining = [p for p in remaining if str(p["id"]) not in protected_ids | preserve_ids]

    for day_index, day in enumerate(plan["days"]):
        date_value = date_for(day)
        in_scope = (target_day is None or day["day_number"] == target_day) and (first_day is None or day["day_number"] >= first_day)
        if not in_scope:
            if ignore_elapsed_clock:
                day["stops"] = [stop for stop in day.get("stops", []) if str(stop.get("poi_id") or "") not in selected_ids]
                for index, stop in enumerate(day["stops"]):
                    stop["sequence"] = index
            else:
                preserve_ids.update(
                    str(stop["poi_id"])
                    for stop in day.get("stops", [])
                    if stop.get("poi_id")
                )
            continue
        if date_value and date_value < today:
            preserve_ids.update(
                str(stop["poi_id"])
                for stop in day.get("stops", [])
                if stop.get("poi_id")
            )
            continue

        touched = True
        if date_value:
            day["date"] = date_value
        old = day.get("stops", [])
        if ignore_elapsed_clock:
            locked = [stop for stop in old if str(stop.get("stop_id") or "") in protected_stop_ids]
        else:
            locked = [
                stop for stop in old
                if date_value == today and stop.get("start_time")
                and minute(stop["start_time"]) < current.hour * 60 + current.minute
            ]
        point_ids = {str(point["id"]) for point in unique_points}
        preserved = [
            stop for stop in old
            if stop not in locked
            and (not stop.get("poi_id")
            or str(stop.get("poi_id")) not in point_ids
            or stop.get("source") in {"manual", "idea"})
        ]
        preserve_ids.update(str(stop["poi_id"]) for stop in preserved if stop.get("poi_id"))
        fixed = [stop for stop in preserved if stop.get("start_time") and stop.get("end_time")]
        untimed = [stop for stop in preserved if stop not in fixed]
        if untimed:
            warnings.append("Một số hoạt động cũ thiếu giờ; chúng được giữ nguyên ở cuối ngày và cần bạn kiểm tra.")
        day["stops"] = locked[:] + fixed

        cursor = day_start_min
        if date_value == today:
            cursor = max(cursor, ((current.hour * 60 + current.minute + 14) // 15) * 15)
        if locked:
            cursor = max(cursor, max(stop_end(stop) for stop in locked if stop.get("start_time")))

        # Retain a user-entered meal/rest; otherwise reserve a one-hour lunch window.
        has_midday_break = any(
            stop.get("start_time") and stop.get("end_time")
            and minute(stop["start_time"]) < 13 * 60 and stop_end(stop) > 12 * 60
            for stop in day["stops"]
        )
        if (remaining or old) and cursor < 13 * 60 and not has_midday_break and day_start_min < 13 * 60 < day_end_min:
            lunch_start = max(cursor, 12 * 60)
            lunch = {
                "stop_id": str(uuid4()), "title": "Ăn trưa và nghỉ", "stop_type": "rest",
                "source": "assistant", "sequence": len(day["stops"]),
                "duration_minutes": 13 * 60 - lunch_start,
                "start_time": clock(lunch_start), "end_time": "13:00",
            }
            day["stops"].append(lunch)
            fixed.append(lunch)

        existing_poi_stops = [stop for stop in day["stops"] if stop.get("poi_id")]
        last_stop = max(
            (stop for stop in existing_poi_stops if stop.get("start_time")),
            key=lambda stop: minute(stop["start_time"]), default=None,
        )
        last = by_id.get(str(last_stop.get("poi_id"))) if last_stop else None
        if last_stop and last is None:
            last = {
                "id": last_stop.get("poi_id"), "city": last_stop.get("city"),
                "latitude": last_stop.get("latitude"), "longitude": last_stop.get("longitude"),
            }
        existing_cities = {_point_city_key(by_id[str(stop["poi_id"])]) for stop in existing_poi_stops if str(stop.get("poi_id")) in by_id}
        day_city = next(iter(sorted(existing_cities)), _point_city_key(remaining[0]) if remaining else None)
        scheduled_today = len(existing_poi_stops)
        day_limit = per_day
        if balance and day_limit is None:
            remaining_days = sum(
                1
                for candidate in plan["days"][day_index:]
                if (target_day is None or candidate["day_number"] == target_day)
                and (first_day is None or candidate["day_number"] >= first_day)
                and not (
                    date_for(candidate)
                    and date_for(candidate) < today
                )
            )
            day_limit = (
                (scheduled_today + len(remaining) + remaining_days - 1)
                // remaining_days
                if remaining_days
                else 0
            )
        active_minutes = 0
        for stop in existing_poi_stops:
            active_minutes += int(stop.get("duration_minutes") or 0)

        while remaining and (day_limit is None or scheduled_today < day_limit):
            candidates = [
                point for point in remaining
                if _point_city_key(point) == day_city
                and day["day_number"] >= minimum_day_by_poi.get(str(point["id"]), 1)
            ]
            if not candidates:
                break
            for point in candidates:
                attempted_days[str(point["id"])].append(day["day_number"])
            if strategy == "opening_hours":
                candidates.sort(key=lambda point: (
                    _latest_closing_priority(point, date_value),
                    distance(last, point) if last and distance(last, point) is not None else float("inf"),
                    str(point.get("id")),
                ))
            elif last:
                candidates.sort(key=lambda point: (
                    distance(last, point) if distance(last, point) is not None else float("inf"),
                    _latest_closing_priority(point, date_value),
                    str(point.get("id")),
                ))

            placed = False
            for poi in candidates:
                km = distance(last, poi) if last else None
                travel = 0 if last is None else (30 if km is None else round((km / 25 * 60 + 5) * 1.5) if km > 0 else 0)
                raw_duration = poi.get("average_visit_minutes")
                try:
                    duration_known = raw_duration is not None and int(raw_duration) > 0
                    duration = int(raw_duration) if duration_known else UNKNOWN_VISIT_MINUTES
                except (TypeError, ValueError):
                    duration_known = False
                    duration = UNKNOWN_VISIT_MINUTES
                if duration > 1440:
                    duration_known = False
                    duration = UNKNOWN_VISIT_MINUTES
                if fast:
                    duration = max(20, round(duration * 0.5))

                intervals, opening_quality = opening_intervals(poi, date_value)
                if intervals == [] and opening_quality == "known":
                    rejection_codes[str(poi["id"])].add("OPENING_HOURS_CONFLICT")
                    continue
                candidate_windows = intervals or [(day_start_min, day_end_min)]
                visit_start = None
                waited = 0
                for window_start, window_end in candidate_windows:
                    earliest = max(cursor + travel, window_start if intervals else cursor + travel)
                    waited_for_open = max(0, earliest - (cursor + travel))
                    attempt_start = earliest
                    while attempt_start + duration <= min(day_end_min, window_end):
                        conflict = next((stop for stop in sorted(fixed, key=lambda item: minute(item["start_time"]))
                            if stop.get("start_time") and stop.get("end_time")
                            and attempt_start < stop_end(stop)
                            and attempt_start + duration > minute(stop["start_time"])), None)
                        if conflict is None:
                            visit_start = attempt_start
                            waited = waited_for_open
                            break
                        attempt_start = max(attempt_start, stop_end(conflict))
                    if visit_start is not None:
                        break
                if visit_start is None:
                    rejection_codes[str(poi["id"])].add(
                        "OPENING_HOURS_CONFLICT" if intervals else "TIME_CAPACITY_EXCEEDED"
                    )
                    continue

                visit_end = visit_start + duration
                if last is None:
                    travel_note = "Chưa có điểm xuất phát để ước tính chặng đầu."
                    unknown_route_legs += 1
                elif km is None:
                    travel_note = "Thiếu tọa độ; dự phòng 30 phút, chưa biết thời gian đi thực tế."
                    unknown_route_legs += 1
                    total_travel_minutes += travel
                else:
                    travel_note = f"Di chuyển ESTIMATED_HEURISTIC khoảng {travel} phút; chưa phải ETA hoặc tuyến đường thực tế."
                    total_travel_minutes += travel
                    total_distance_km += km
                if not duration_known:
                    travel_note += f" Thời lượng ghé tạm tính {UNKNOWN_VISIT_MINUTES} phút vì POI chưa có số liệu."
                if fast:
                    travel_note += " Thời lượng giảm một nửa theo lựa chọn nhịp nhanh; cần bạn xác nhận lại."
                if opening_quality == "unknown":
                    travel_note += " Chưa có giờ mở cửa theo ngày; cần kiểm tra trước chuyến đi."
                    warnings.append("Giờ mở cửa chưa xác định cho một số POI; lịch tại các điểm đó chỉ là tạm tính.")
                elif opening_quality == "unknown_date":
                    travel_note += " Ngày linh hoạt nên chưa thể xác nhận giờ mở cửa theo thứ."
                    warnings.append("Ngày linh hoạt: giờ mở cửa theo thứ chưa thể xác nhận.")
                elif waited:
                    travel_note += f" Chờ {waited} phút đến giờ mở cửa."

                day["stops"].append({
                    "stop_id": str(uuid4()), "poi_id": str(poi["id"]),
                    "title": poi.get("name") or str(poi["id"]), "city": poi.get("city"),
                    "address": poi.get("address"), "category": poi.get("category"),
                    "stop_type": "poi", "source": "assistant", "sequence": len(day["stops"]),
                    "duration_minutes": duration, "start_time": clock(visit_start),
                    "end_time": clock(visit_end), "latitude": poi.get("latitude"),
                    "longitude": poi.get("longitude"), "comment": travel_note,
                })
                scheduled_details.append({
                    "poi_id": str(poi["id"]), "day_number": day["day_number"],
                    "travel_minutes": travel, "distance_km": km,
                    "opening_wait_minutes": waited, "opening_quality": opening_quality,
                    "duration_minutes": duration, "duration_known": duration_known,
                })
                total_opening_wait += waited
                remaining.remove(poi)
                cursor = visit_end
                last = poi
                day_city = _point_city_key(poi)
                scheduled_today += 1
                active_minutes += duration
                placed = True

                if active_minutes >= break_after:
                    next_rest = next((stop for stop in fixed if stop.get("stop_type") == "rest"
                        and stop.get("start_time") and minute(stop["start_time"]) >= visit_end
                        and minute(stop["start_time"]) <= visit_end + break_length), None)
                    if next_rest:
                        cursor = max(cursor, stop_end(next_rest))
                        active_minutes = 0
                    elif visit_end + break_length <= day_end_min:
                        rest = {
                            "stop_id": str(uuid4()), "title": "Nghỉ ngắn", "stop_type": "rest",
                            "source": "assistant", "sequence": len(day["stops"]),
                            "duration_minutes": break_length,
                            "start_time": clock(visit_end),
                            "end_time": clock(visit_end + break_length),
                        }
                        day["stops"].append(rest)
                        fixed.append(rest)
                        cursor = visit_end + break_length
                        active_minutes = 0
                break
            if not placed:
                break

        day["stops"].extend(untimed)
        day["stops"].sort(key=lambda stop: minute(stop["start_time"]) if stop.get("start_time") else 24 * 60)
        for index, stop in enumerate(day["stops"]):
            stop["sequence"] = index

    if not touched:
        raise HTTPException(422, "Các ngày của chuyến đã qua; hãy đổi ngày khởi hành trước.")
    validate_past(before, plan, ignore_elapsed=ignore_elapsed_clock)

    scheduled_ids = {
        str(stop["poi_id"])
        for day in plan["days"]
        for stop in day.get("stops", [])
        if stop.get("poi_id")
    }
    unscheduled = []
    scheduled_cities = {
        _point_city_key(by_id[poi_id])
        for poi_id in scheduled_ids if poi_id in by_id
    }
    requested_city_keys = {
        key for key in (_point_city_key(point) for point in unique_points if str(point["id"]) not in inactive)
        if key != "unknown"
    }
    for point in unique_points:
        point_id = str(point["id"])
        if point_id in scheduled_ids:
            continue
        reasons = []
        if point_id in inactive:
            reasons.append("POI_INACTIVE")
        elif len(requested_city_keys) > 1 and scheduled_cities and _point_city_key(point) not in scheduled_cities and not attempted_days[point_id]:
            reasons.append("INTERCITY_TRANSFER_UNRESOLVED")
        else:
            reasons.extend(sorted(rejection_codes[point_id]))
            if not reasons:
                reasons.append("TIME_CAPACITY_EXCEEDED" if attempted_days[point_id] else "NO_FEASIBLE_SLOT_FOUND")
        unscheduled.append({
            "poi_id": point_id,
            "name": point.get("name") or point_id,
            "reasons": list(dict.fromkeys(reasons)),
            "attempted_days": list(dict.fromkeys(attempted_days[point_id])),
        })

    if unscheduled:
        names = "; ".join(item["name"] for item in unscheduled[:12])
        warnings.append(
            f"{len(unscheduled)} POI đã chọn chưa xếp được: {names}. Các điểm vẫn nằm trong Ý tưởng; hãy kiểm tra lý do trước khi áp dụng."
        )
    if len(requested_city_keys) > 1:
        warnings.append("Chuyến có nhiều thành phố. Các ngày được nhóm liền nhau theo thành phố; chặng chuyển thành phố chưa có thời gian tin cậy và chưa được xếp.")
    if scheduled_details:
        warnings.append("Chặng đầu mỗi ngày chưa được tính vì Workspace chưa có địa điểm xuất phát.")
    if fast:
        warnings.append("Nhịp nhanh dùng thời lượng ghé ngắn hơn một nửa so với dữ liệu; đây là giả định cần bạn kiểm tra.")
    if light:
        warnings.append("Nhịp thư thả chừa khoảng nghỉ 30 phút sau tối đa 120 phút tham quan; không giới hạn cứng số POI mỗi ngày.")
    warnings.append(f"Khung giờ tham quan {clock(day_start_min)}–{clock(day_end_min)}; tuyến nội thành là ESTIMATED_HEURISTIC, không gọi dịch vụ routing và chưa tính giờ đến/đi, khách sạn, ăn uống hoặc phương tiện.")

    if details is not None:
        details.clear()
        details.update({
            "scheduled": scheduled_details,
            "unscheduled": unscheduled,
            "travel_minutes": total_travel_minutes,
            "distance_km": round(total_distance_km, 2),
            "unknown_route_legs": unknown_route_legs,
            "opening_wait_minutes": total_opening_wait,
            "scheduled_ids": sorted(scheduled_ids),
            "selected_ids": [str(point["id"]) for point in unique_points],
        })
    return plan, list(dict.fromkeys(warnings))


def _plan_metrics(itinerary, details, points):
    stops = [stop for day in itinerary.get("days", []) for stop in day.get("stops", [])]
    poi_stops = [stop for stop in stops if stop.get("poi_id")]
    rest_minutes = sum(int(stop.get("duration_minutes") or 0) for stop in stops if stop.get("stop_type") == "rest")
    by_id = {str(point["id"]): point for point in points if point.get("id") is not None}
    person_costs = [upper_price(by_id[str(stop["poi_id"])], "person") for stop in poi_stops if str(stop["poi_id"]) in by_id]
    known_costs = [cost for cost in person_costs if cost is not None]
    selected_ids = {str(point["id"]) for point in points if point.get("id") is not None}
    scheduled_selected_ids = {str(stop["poi_id"]) for stop in poi_stops} & selected_ids
    return {
        "scheduled_poi_count": len(scheduled_selected_ids),
        "selected_poi_count": len(selected_ids),
        "visit_minutes": sum(int(stop.get("duration_minutes") or 0) for stop in poi_stops),
        "travel_minutes_estimated": int(details.get("travel_minutes", 0)),
        "distance_km_estimated": details.get("distance_km"),
        "opening_wait_minutes": int(details.get("opening_wait_minutes", 0)),
        "rest_minutes": rest_minutes,
        "unknown_route_legs": int(details.get("unknown_route_legs", 0)),
        "unknown_visit_duration_count": sum(not item.get("duration_known") for item in details.get("scheduled", [])),
        "unknown_opening_hours_count": sum(item.get("opening_quality") in {"unknown", "unknown_date"} for item in details.get("scheduled", [])),
        "known_poi_cost_vnd_per_person": sum(known_costs),
        "unknown_poi_cost_count": len(person_costs) - len(known_costs),
    }


def _dominates(left, right):
    left_metrics, right_metrics = left["metrics"], right["metrics"]
    dimensions = (
        (left_metrics["scheduled_poi_count"], right_metrics["scheduled_poi_count"], True),
        (left_metrics["travel_minutes_estimated"], right_metrics["travel_minutes_estimated"], False),
        (left_metrics["opening_wait_minutes"], right_metrics["opening_wait_minutes"], False),
        (left_metrics["unknown_route_legs"], right_metrics["unknown_route_legs"], False),
    )
    no_worse = all(a >= b if maximize else a <= b for a, b, maximize in dimensions)
    strictly_better = any(a != b for a, b, _ in dimensions)
    return no_worse and strictly_better


def build_alternatives(before, points, **options):
    """Build at most two deterministic, same-input, non-dominated draft plans."""
    unique_points = _unique_points(points)
    variants = [
        ("nearby", "A · Cân bằng tuyến", "Ưu tiên các điểm gần nhau trong từng thành phố."),
        ("opening_hours", "B · Ưu tiên giờ mở cửa", "Ưu tiên các điểm có khung mở cửa hạn chế trước."),
    ]
    candidates = []
    for strategy, title, summary in variants:
        details = {}
        try:
            itinerary, warnings = create_plan(
                before, unique_points, strategy=strategy, details=details, **options
            )
        except HTTPException as error:
            if not candidates:
                raise
            continue
        metrics = _plan_metrics(itinerary, details, unique_points)
        scheduled = metrics["scheduled_poi_count"]
        selected = metrics["selected_poi_count"]
        opening_unknown = any(item.get("opening_quality") in {"unknown", "unknown_date"} for item in details.get("scheduled", []))
        cross_city = len({_point_city_key(point) for point in unique_points if _point_city_key(point) != "unknown"}) > 1
        status = "PARTIAL" if scheduled < selected else "PROVISIONAL" if opening_unknown or metrics["unknown_route_legs"] or cross_city else "ESTIMATED_HEURISTIC"
        configured_start = options.get("day_start") or "09:00"
        configured_end = options.get("day_end") or "17:00"
        candidates.append({
            "id": strategy,
            "title": title,
            "summary": summary,
            "itinerary": itinerary,
            "selected_poi_ids": [str(point["id"]) for point in unique_points],
        "scheduled_poi_ids": sorted(set(details.get("scheduled_ids", [])) & {str(point["id"]) for point in unique_points}),
            "unscheduled_pois": details.get("unscheduled", []),
            "metrics": metrics,
            "assumptions": [f"Khung tham quan {configured_start}–{configured_end} (mặc định 09:00–17:00 nếu bạn chưa đặt giờ).", "Thời gian đường bộ nội thành là heuristic theo tọa độ, không phải ETA.", "Chi phí chỉ gồm mức giá POI có đơn vị /người; không gồm ăn, ở và vận chuyển."],
            "warnings": warnings,
            "feasibility_status": status,
        })

    if len(candidates) < 2:
        return candidates
    first, second = candidates
    first_signature = [
        (day["day_number"], tuple(stop.get("poi_id") for stop in day["stops"] if stop.get("poi_id")))
        for day in first["itinerary"].get("days", [])
    ]
    second_signature = [
        (day["day_number"], tuple(stop.get("poi_id") for stop in day["stops"] if stop.get("poi_id")))
        for day in second["itinerary"].get("days", [])
    ]
    if first_signature == second_signature:
        return [first]
    if _dominates(first, second):
        return [first]
    if _dominates(second, first):
        second["title"] = second["title"].replace("B ·", "A ·", 1)
        return [second]
    return candidates[:2]
