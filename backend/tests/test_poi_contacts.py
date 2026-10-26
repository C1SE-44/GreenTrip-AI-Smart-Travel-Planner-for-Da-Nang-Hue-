"""Unit tests for POI contact and operating hours fields (Migration 006)."""

from pathlib import Path
import sys
import pytest
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.main import app
from app.pois.schemas import PaginatedPOIResponse, POIResponse, PaginationMetadata


def test_list_pois_includes_contact_and_hours_fields(monkeypatch: pytest.MonkeyPatch):
    fake_response = PaginatedPOIResponse(
        items=[
            POIResponse(
                id=1,
                name="Pizza 4P's Hoang Van Thu",
                category="food",
                latitude=16.066,
                longitude=108.222,
                city="Da Nang",
                phone_number="02836220500",
                website_url="https://pizza4ps.com",
                social_links={"facebook": "https://facebook.com/pizza4ps"},
                opening_hours={
                    "open_now": True,
                    "status_text": "Open",
                    "weekday_text": ["Monday: 10:00 AM - 10:00 PM"],
                },
                email="info@pizza4ps.com",
            )
        ],
        pagination=PaginationMetadata(
            page=1,
            limit=5,
            total=1,
            total_pages=1,
            has_next=False,
            has_previous=False,
        ),
    )
    monkeypatch.setattr("app.pois.router.get_poi_page", lambda **kwargs: fake_response)

    client = TestClient(app)
    response = client.get("/pois?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert len(data["items"]) > 0

    first_item = data["items"][0]
    # Check that the 5 new fields exist in the schema response
    assert "phone_number" in first_item
    assert "website_url" in first_item
    assert "social_links" in first_item
    assert "opening_hours" in first_item
    assert "email" in first_item
