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


def test_expired_trip_shift_forward_to_today_allows_existing_stops_with_past_times():
    past_plan = TripItinerarySyncRequest(
        trip_id="trip-10-13",
        title="Chuyến đi Đà Nẵng",
        destination="Đà Nẵng",
        start_date="2026-11-10",
        days_count=2,
        days=[
            dict(
                day_id="day-1",
                day_number=1,
                date="2026-11-10",
                stops=[
                    dict(stop_id="s1", title="Bán đảo Sơn Trà", sequence=0, start_time="08:30", end_time="10:00"),
                    dict(stop_id="s2", title="Cầu Rồng", sequence=1, start_time="14:00", end_time="15:30"),
                ],
            ),
            dict(
                day_id="day-2",
                day_number=2,
                date="2026-11-11",
                stops=[
                    dict(stop_id="s3", title="Bà Nà Hills", sequence=0, start_time="09:00", end_time="16:00"),
                ],
            ),
        ],
    )
    # Today is 2026-11-16 11:43 Vietnam time (as observed in user scenario)
    now = datetime(2026, 11, 16, 11, 43, tzinfo=ZoneInfo("Asia/Ho_Chi_Minh"))

    # Shift trip forward to start on 2026-11-16
    shifted_to_today = past_plan.model_copy(deep=True)
    shifted_to_today.start_date = "2026-11-16"
    shifted_to_today.days[0].date = "2026-11-16"
    shifted_to_today.days[1].date = "2026-11-17"

    # Stop s1 on Day 1 has start_time="08:30" < 11:43, but because it's a forward trip shift, it is allowed!
    validate_schedule_changes(shifted_to_today, past_plan, now)


def test_expired_trip_shift_forward_to_future_date_succeeds():
    past_plan = TripItinerarySyncRequest(
        trip_id="trip-10-13",
        title="Chuyến đi Đà Nẵng",
        destination="Đà Nẵng",
        start_date="2026-11-10",
        days_count=1,
        days=[
            dict(
                day_id="day-1",
                day_number=1,
                date="2026-11-10",
                stops=[
                    dict(stop_id="s1", title="Bán đảo Sơn Trà", sequence=0, start_time="08:30", end_time="10:00"),
                ],
            ),
        ],
    )
    now = datetime(2026, 11, 16, 11, 43, tzinfo=ZoneInfo("Asia/Ho_Chi_Minh"))

    shifted_future = past_plan.model_copy(deep=True)
    shifted_future.start_date = "2026-11-20"
    shifted_future.days[0].date = "2026-11-20"

    validate_schedule_changes(shifted_future, past_plan, now)


def test_new_stop_added_in_past_time_today_is_rejected():
    past_plan = TripItinerarySyncRequest(
        trip_id="trip-10-13",
        title="Chuyến đi Đà Nẵng",
        destination="Đà Nẵng",
        start_date="2026-11-10",
        days_count=1,
        days=[
            dict(
                day_id="day-1",
                day_number=1,
                date="2026-11-10",
                stops=[
                    dict(stop_id="s1", title="Bán đảo Sơn Trà", sequence=0, start_time="08:30", end_time="10:00"),
                ],
            ),
        ],
    )
    now = datetime(2026, 11, 16, 11, 43, tzinfo=ZoneInfo("Asia/Ho_Chi_Minh"))

    shifted_to_today = past_plan.model_copy(deep=True)
    shifted_to_today.start_date = "2026-11-16"
    shifted_to_today.days[0].date = "2026-11-16"

    # Add a brand new stop s_new with start_time 09:30 AM (before current time 11:43)
    shifted_to_today.days[0].stops.append(
        dict(stop_id="s_new", title="Chợ Cồn", sequence=1, start_time="09:30", end_time="11:00")
    )

    with pytest.raises(HTTPException) as exc_info:
        validate_schedule_changes(shifted_to_today, past_plan, now)
    assert exc_info.value.status_code == 422


def test_shifting_trip_to_still_past_date_is_rejected():
    past_plan = TripItinerarySyncRequest(
        trip_id="trip-10-13",
        title="Chuyến đi Đà Nẵng",
        destination="Đà Nẵng",
        start_date="2026-11-10",
        days_count=1,
        days=[
            dict(
                day_id="day-1",
                day_number=1,
                date="2026-11-10",
                stops=[
                    dict(stop_id="s1", title="Bán đảo Sơn Trà", sequence=0, start_time="08:30", end_time="10:00"),
                ],
            ),
        ],
    )
    now = datetime(2026, 11, 16, 11, 43, tzinfo=ZoneInfo("Asia/Ho_Chi_Minh"))

    # Shifting from Nov 10 to Nov 12 (still before Nov 16)
    shifted_past = past_plan.model_copy(deep=True)
    shifted_past.start_date = "2026-11-12"
    shifted_past.days[0].date = "2026-11-12"

    with pytest.raises(HTTPException) as exc_info:
        validate_schedule_changes(shifted_past, past_plan, now)
    assert exc_info.value.status_code == 422
