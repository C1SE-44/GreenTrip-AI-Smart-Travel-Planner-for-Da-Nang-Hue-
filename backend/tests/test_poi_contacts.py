"""Unit tests for POI contact and operating hours fields (Migration 006)."""

from pathlib import Path
import sys
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.main import app


def test_list_pois_includes_contact_and_hours_fields():
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
