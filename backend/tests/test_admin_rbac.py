"""Tests for Two-Layer RBAC (401/403) and Audited Admin POI Management endpoints."""
from pathlib import Path
import sys
import uuid

from fastapi.testclient import TestClient
import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.auth.service import create_access_token  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.db.postgres import get_connection  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)


def test_admin_endpoints_enforce_rbac_and_audit_logging(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", " ")
    get_settings.cache_clear()

    regular_user_id = str(uuid.uuid4())
    admin_user_id = str(uuid.uuid4())
    inactive_admin_id = str(uuid.uuid4())
    poi_id = str(uuid.uuid4())

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO public.users (user_id, full_name, email, role, status) VALUES (%s, %s, %s, 'USER', 'ACTIVE')",
                (regular_user_id, "Normal Traveler", f"user-{uuid.uuid4().hex[:8]}@example.com"),
            )
            cur.execute(
                "INSERT INTO public.users (user_id, full_name, email, role, status) VALUES (%s, %s, %s, 'ADMIN', 'ACTIVE')",
                (admin_user_id, "System Admin", f"admin-{uuid.uuid4().hex[:8]}@example.com"),
            )
            cur.execute(
                "INSERT INTO public.users (user_id, full_name, email, role, status) VALUES (%s, %s, %s, 'ADMIN', 'SUSPENDED')",
                (inactive_admin_id, "Suspended Admin", f"suspended-{uuid.uuid4().hex[:8]}@example.com"),
            )
            cur.execute(
                """
                INSERT INTO public.pois (poi_id, name, category_id, city_id, estimated_cost, green_score, is_active)
                VALUES (%s, %s, %s, %s, %s, %s, 1)
                """,
                (
                    poi_id,
                    "Admin RBAC Test Museum",
                    "54da4319-c68b-4e42-a488-8ccdfba2b71c",
                    "887a5372-9e6f-48a7-bf50-1e6ef9f2ebce",
                    50000.0,
                    0.85,
                ),
            )
        conn.commit()

    try:
        # 1. Guest without Authorization header -> 401
        assert client.get("/admin/overview").status_code == 401
        assert client.get("/admin/pois").status_code == 401
        assert client.patch(f"/admin/pois/{poi_id}", json={"is_active": False}).status_code == 401

        # 2. Invalid token -> 401
        assert client.get("/admin/overview", headers={"Authorization": "Bearer invalid.jwt.token"}).status_code == 401

        # 3. Regular USER trying to access /admin -> 403 Forbidden (even if token forged/normal)
        user_headers = {"Authorization": f"Bearer {create_access_token(regular_user_id, role='USER')}"}
        res_user_overview = client.get("/admin/overview", headers=user_headers)
        assert res_user_overview.status_code == 403
        assert client.get("/admin/pois", headers=user_headers).status_code == 403
        assert client.patch(f"/admin/pois/{poi_id}", headers=user_headers, json={"is_active": False}).status_code == 403

        # 4. Suspended ADMIN -> 403 Forbidden (authoritative DB status check)
        suspended_headers = {"Authorization": f"Bearer {create_access_token(inactive_admin_id, role='ADMIN')}"}
        assert client.get("/admin/overview", headers=suspended_headers).status_code == 403

        # 5. Active ADMIN -> 200 OK + ACID update + Audit Log entry
        admin_headers = {"Authorization": f"Bearer {create_access_token(admin_user_id, role='ADMIN')}"}
        res_overview = client.get("/admin/overview", headers=admin_headers)
        assert res_overview.status_code == 200, res_overview.text
        overview_data = res_overview.json()
        assert overview_data["total_pois"] >= 1
        assert overview_data["admin_users"] >= 1

        res_list = client.get("/admin/pois?q=Admin+RBAC+Test+Museum", headers=admin_headers)
        assert res_list.status_code == 200, res_list.text
        list_data = res_list.json()
        assert list_data["total"] == 1
        assert list_data["items"][0]["poi_id"] == poi_id

        res_patch = client.patch(
            f"/admin/pois/{poi_id}",
            headers=admin_headers,
            json={"is_active": False, "estimated_cost": 75000.0},
        )
        assert res_patch.status_code == 200, res_patch.text
        patch_data = res_patch.json()
        assert patch_data["poi"]["is_active"] is False
        assert patch_data["poi"]["estimated_cost"] == 75000.0
        assert patch_data["audit_id"]

        # Verify audit log exists in DB and inactive POI stays in inactive filter while disappearing from active filter
        res_inactive = client.get("/admin/pois?status_filter=inactive&q=Admin+RBAC+Test+Museum", headers=admin_headers)
        assert res_inactive.status_code == 200
        assert res_inactive.json()["total"] == 1

        res_active = client.get("/admin/pois?status_filter=active&q=Admin+RBAC+Test+Museum", headers=admin_headers)
        assert res_active.status_code == 200
        assert res_active.json()["total"] == 0

        res_overview_after = client.get("/admin/overview", headers=admin_headers)
        assert any(log["target_id"] == poi_id and log["action"] == "UPDATE_POI" for log in res_overview_after.json()["recent_audit_logs"])
    finally:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM public.admin_audit_logs WHERE target_id = %s", (poi_id,))
                cur.execute("DELETE FROM public.pois WHERE poi_id = %s", (poi_id,))
                cur.execute(
                    "DELETE FROM public.users WHERE user_id IN (%s, %s, %s)",
                    (regular_user_id, admin_user_id, inactive_admin_id),
                )
            conn.commit()
