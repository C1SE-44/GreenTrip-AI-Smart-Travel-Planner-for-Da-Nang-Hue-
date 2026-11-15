from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException

from app.trips.schemas import TripItinerarySyncRequest
from app.trips.schedule_validation import validate_schedule_changes


def test_past_changes_are_rejected_but_history_and_future_are_preserved():
    plan = TripItinerarySyncRequest(
        trip_id="qa-schedule", title="QA", destination="Huế", start_date="2026-11-13", days_count=1,
        days=[dict(day_id="qa-day", day_number=1, date="2026-11-13", stops=[dict(
            stop_id="qa-stop", title="QA POI", sequence=0, start_time="10:30", end_time="11:30"
        )])],
    )
    now = datetime(2026, 11, 13, 18, 30, tzinfo=ZoneInfo("Asia/Ho_Chi_Minh"))
    with pytest.raises(HTTPException) as error:
        validate_schedule_changes(plan, None, now)
    assert error.value.status_code == 422
    validate_schedule_changes(plan, plan, now)
    future = plan.model_copy(deep=True)
    future.days[0].stops[0].start_time = "19:30"
    future.days[0].stops[0].end_time = "20:30"
    validate_schedule_changes(future, plan, now)
    with pytest.raises(HTTPException):
        validate_schedule_changes(plan, future, now)
