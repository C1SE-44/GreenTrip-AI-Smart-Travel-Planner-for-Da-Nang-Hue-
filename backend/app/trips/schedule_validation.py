from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from app.trips.schemas import TripItinerarySyncRequest


def validate_schedule_changes(
    payload: TripItinerarySyncRequest,
    previous: TripItinerarySyncRequest | None,
    now: datetime | None = None,
) -> None:
    current = (now or datetime.now(ZoneInfo("Asia/Ho_Chi_Minh"))).astimezone(ZoneInfo("Asia/Ho_Chi_Minh"))

    def parse_iso_date(raw: str | None) -> str | None:
        if not raw:
            return None
        try:
            return date.fromisoformat(raw.strip()).isoformat()
        except Exception:
            return None

    def schedules(plan: TripItinerarySyncRequest | None) -> dict:
        if plan is None:
            return {}
        entries = {}
        for day in plan.days:
            day_date = parse_iso_date(day.date)
            if not day_date and plan.start_date:
                base = parse_iso_date(plan.start_date)
                if base:
                    day_date = (date.fromisoformat(base) + timedelta(days=day.day_number - 1)).isoformat()
            for stop in day.stops:
                s_id = stop.get("stop_id") if isinstance(stop, dict) else getattr(stop, "stop_id", None)
                s_start = stop.get("start_time") if isinstance(stop, dict) else getattr(stop, "start_time", None)
                s_end = stop.get("end_time") if isinstance(stop, dict) else getattr(stop, "end_time", None)
                if s_id:
                    entries[s_id] = (day_date, s_start, s_end)
        return entries

    old = schedules(previous)
    prev_start = parse_iso_date(previous.start_date) if previous else None
    new_start = parse_iso_date(payload.start_date)
    is_trip_shift_forward = bool(
        previous
        and new_start
        and new_start >= current.date().isoformat()
        and (prev_start is None or new_start > prev_start)
    )

    for stop_id, schedule in schedules(payload).items():
        day_date, start, end = schedule
        if schedule == old.get(stop_id) or not day_date or not start:
            continue
        old_entry = old.get(stop_id)
        if (
            is_trip_shift_forward
            and old_entry
            and old_entry[1] == start
            and old_entry[2] == end
            and day_date >= current.date().isoformat()
        ):
            continue
        hour, minute = map(int, start.split(":"))
        if day_date < current.date().isoformat() or (
            day_date == current.date().isoformat() and hour * 60 + minute < current.hour * 60 + current.minute
        ):
            raise HTTPException(status_code=422, detail="Không thể thêm hoặc dời hoạt động vào quá khứ (giờ Việt Nam).")
