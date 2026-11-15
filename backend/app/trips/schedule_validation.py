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

    def schedules(plan: TripItinerarySyncRequest | None) -> dict:
        if plan is None:
            return {}
        entries = {}
        for day in plan.days:
            day_date = day.date
            if not day_date and plan.start_date:
                day_date = (date.fromisoformat(plan.start_date) + timedelta(days=day.day_number - 1)).isoformat()
            for stop in day.stops:
                entries[stop.stop_id] = (day_date, stop.start_time, stop.end_time)
        return entries

    old = schedules(previous)
    for stop_id, schedule in schedules(payload).items():
        day_date, start, _ = schedule
        if schedule == old.get(stop_id) or not day_date or not start:
            continue
        hour, minute = map(int, start.split(":"))
        if day_date < current.date().isoformat() or (
            day_date == current.date().isoformat() and hour * 60 + minute < current.hour * 60 + current.minute
        ):
            raise HTTPException(status_code=422, detail="Không thể thêm hoặc dời hoạt động vào quá khứ (giờ Việt Nam).")
