"""Local UI acceptance fixture. Run directly; never import the production app lifespan."""

from contextlib import contextmanager
from copy import deepcopy
import json
import os
from pathlib import Path
import secrets
import sqlite3
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import config
from app.db import postgres

STATE = Path(tempfile.mkdtemp(prefix="greentrip-ui-sqlite-"))
QA_PORT = int(os.environ.get("QA_PORT", "8017"))
QA_FRONTEND_PORT = int(os.environ.get("QA_FRONTEND_PORT", "5177"))
DB = STATE / "demo.db"
original = config.get_settings()
settings = original.model_copy(
    update={
        "DATABASE_URL": "",
        "SUPABASE_URL": "",
        "SUPABASE_SECRET_KEY": "",
        "SUPABASE_SERVICE_ROLE_KEY": "",
        "SUPABASE_ANON_KEY": "",
        "SUPABASE_PUBLISHABLE_KEY": "",
        "NEO4J_URI": "",
        "SMTP_HOST": "",
        "JWT_SECRET_KEY": secrets.token_urlsafe(32),
        "ASSISTANT_AI_DAILY_LIMIT": 12,
        "ASSISTANT_AI_ENABLED": original.ASSISTANT_AI_ENABLED
        and os.environ.get("QA_AI_ENABLED", "1") != "0",
    }
)
config.get_settings = lambda: settings


@contextmanager
def connection():
    with postgres.SQLiteConnectionWrapper(sqlite3.connect(DB, timeout=15)) as db:
        yield db


# Bind every imported repository to the private SQLite fixture before importing routers.
postgres.get_connection = connection
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from app.assistant import service, store, search, nlu
from app.assistant.router import router
from app.auth.router import router as auth_router
from app.auth.dependencies import get_current_user_id
from app.auth.password import hash_password

store.PATH = STATE / "chat.db"
with sqlite3.connect(DB) as db:
    db.execute(
        "CREATE TABLE users(user_id TEXT PRIMARY KEY,email TEXT,password_hash TEXT,status TEXT)"
    )
    db.execute(
        "INSERT INTO users VALUES(?,?,?,?)",
        (
            "ui-demo",
            "assistant-qa@example.test",
            hash_password("AssistantQA123!"),
            "ACTIVE",
        ),
    )
    db.execute("CREATE TABLE qa_pois(id TEXT PRIMARY KEY,payload TEXT)")
    db.execute("INSERT INTO users VALUES(?,?,?,?)", ("ui-demo-b", "assistant-b@example.test", hash_password("AssistantQA123!"), "ACTIVE"))

from app.trips.itinerary_repository import save_itinerary
from app.trips.schemas import TripItinerarySyncRequest

from app.assistant.schemas import Context
save_itinerary(TripItinerarySyncRequest.model_validate(service.empty_itinerary(
    "foreign-assistant-qa", Context(destination="Huế", days_count=2, start_date="2026-12-20")
)), "ui-demo-b")


expired = service.empty_itinerary('qa-expired-sync', Context(destination='Huế', days_count=3, start_date='2026-11-10'))
expired['title'] = 'Kiểm đồng bộ ngày'
for index, day in enumerate(expired['days']):
    day['stops'] = [dict(stop_id=f'qa-preserved-{index}', poi_id=['cafe-garden','museum','park'][index], title=['Cà phê Vườn Demo','Bảo tàng Demo','Công viên Demo'][index], sequence=0, start_time='08:30', end_time='09:30', duration_minutes=60)]
save_itinerary(TripItinerarySyncRequest.model_validate(expired), 'ui-demo')


def poi(id, name, category, lat, price, vibes, city="Hue"):
    return dict(
        id=id,
        name=name,
        city=city,
        category=category,
        latitude=lat,
        longitude=107.58 if city == "Hue" else 108.2,
        description="Địa điểm giả lập phục vụ kiểm thử giao diện.",
        estimated_cost=40000,
        green_score=0.8,
        satisfaction_score=4.5,
        popularity_score=1,
        is_active=True,
        is_local_business=True,
        average_visit_minutes=60,
        opening_hours={},
        budget_tier="$",
        vibes=vibes,
        ai_metadata={"price_range_display": price},
        image_url=f"http://127.0.0.1:{QA_PORT}/qa/poi.svg",
    )


points = [
    poi(
        "cafe-garden",
        "Cà phê Vườn Demo",
        "Quán cafe giải khát",
        16.46,
        "30.000–60.000 ₫ / ly",
        ["quiet", "garden"],
    ),
    poi(
        "cafe-group",
        "Cà phê Nhóm Demo",
        "Quán cafe giải khát",
        16.465,
        "40.000–70.000 ₫ / ly",
        ["spacious", "group_friendly"],
    ),
    poi(
        "museum",
        "Bảo tàng Demo",
        "Di tích lịch sử và văn hóa",
        16.47,
        "40.000 ₫ / người",
        ["culture"],
    ),
    poi(
        "park",
        "Công viên Demo",
        "Cảnh quan thiên nhiên",
        16.475,
        "Miễn phí tham quan",
        ["nature"],
    ),
    poi(
        "temple",
        "Chùa Demo",
        "Tâm linh & Tôn giáo",
        16.46,
        "Miễn phí tham quan",
        ["peaceful"],
    ),
    poi(
        "dn-cafe",
        "Cà phê Sông Demo",
        "Quán cafe giải khát",
        16.05,
        "30.000–50.000 ₫ / ly",
        ["quiet"],
        "Da Nang",
    ),
]
points.extend([
    poi('dn-temple-a', 'Chùa A Demo', 'Tâm linh & Tôn giáo', 16.06, 'Miễn phí tham quan', ['quiet'], 'Da Nang'),
    poi('dn-temple-b', 'Chùa B Demo', 'Tâm linh & Tôn giáo', 16.07, 'Miễn phí tham quan', ['quiet'], 'Da Nang'),
    poi('dn-park', 'Công viên Đà Nẵng Demo', 'Cảnh quan thiên nhiên', 16.08, 'Miễn phí tham quan', ['nature'], 'Da Nang'),
    {**poi('dn-food', 'Quán Mì Demo', 'Ẩm thực', 16.055, '40.000–80.000 ₫ / người', [], 'Da Nang'), 'description': 'Thực đơn giả lập kiểm thử: mì Quảng gà.'},
])
points.extend([poi(f'extra-{i}', f'Điểm Huế Demo {i}', 'Cảnh quan thiên nhiên',16.46+i*.001,'Miễn phí tham quan',['nature']) for i in range(5)])
# Read-only project snapshot for the reported cafe/brewery acceptance case.
import csv
with (Path(__file__).resolve().parents[2]/"data/processed/all_pois_cleaned.csv").open(encoding="utf-8-sig") as source:
    for row in csv.DictReader(source):
        if row["name"] in ("7 Bridges Brewing Company", "Đi Lạc Coffee – Specialty Coffee Roastery"):
            sample = poi(row["poi_id"], row["name"], row["category"], float(row["latitude"]), row["price_range_display"], [], "Da Nang")
            sample.update(sub_category=row["sub_category"], satisfaction_score=float(row["satisfaction_score"]))
            sample["ai_metadata"]["review_count"] = int(row["review_count"])
            points.append(sample)
for p in points:
    if "Miễn phí" in p["ai_metadata"]["price_range_display"]:
        p["estimated_cost"] = 0
with sqlite3.connect(DB) as db:
    db.executemany(
        "INSERT INTO qa_pois VALUES(?,?)",
        [(p["id"], json.dumps(p, ensure_ascii=False)) for p in points],
    )


def catalogue(city=None, ids=None):
    with sqlite3.connect(DB) as db:
        rows = [
            json.loads(row[0])
            for row in db.execute("SELECT payload FROM qa_pois ORDER BY id")
        ]
    return [
        p
        for p in rows
        if (ids is None or p["id"] in ids)
        and (
            not city
            or search.fold(city).replace(" ", "")
            == search.fold(p["city"]).replace(" ", "")
        )
    ]


service.catalogue = search.catalogue = catalogue
provider_metadata = []
provider_post = nlu.httpx.post


def observed_post(*args, **kwargs):
    try:
        response = provider_post(*args, **kwargs)
        meta = {
            "status": response.status_code,
            "content_type": response.headers.get("content-type"),
        }
        try:
            body = response.json()
            meta["keys"] = list(body)
            candidate = next(iter(body.get("candidates", [])), {})
            meta["finish_reason"] = candidate.get("finishReason")
            meta["has_content"] = bool(candidate.get("content"))
            meta["block_reason"] = body.get("promptFeedback", {}).get("blockReason")
        except ValueError:
            meta["json_valid"] = False
        provider_metadata.append(meta)
        return response
    except Exception as error:
        provider_metadata.append({"exception_type": type(error).__name__})
        raise


nlu.httpx.post = observed_post
app = FastAPI(title="GreenTrip isolated SQLite UI demo")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[f"http://127.0.0.1:{QA_FRONTEND_PORT}", f"http://localhost:{QA_FRONTEND_PORT}"],
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.get("/auth/me")
def fixture_profile(user: str = Depends(get_current_user_id)):
    return {"user_id": user, "full_name": "SQLite QA A" if user=="ui-demo" else "SQLite QA B", "email": "assistant-qa@example.test" if user=="ui-demo" else "assistant-b@example.test", "role":"USER", "status":"ACTIVE"}

@app.get("/pois")
def fixture_pois():
    return {"items": points, "pagination":{"total":len(points),"limit":200,"page":1,"total_pages":1,"has_next":False,"has_previous":False}}

from app.assistant.workspaces import router as workspace_router
from app.trips.my_trips_router import router as my_trips_router
app.include_router(workspace_router)
app.include_router(my_trips_router,prefix="/api/my-trips")
from app.trips.router import router as trip_router
app.include_router(trip_router)
app.include_router(auth_router)
app.include_router(router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "database": "isolated-sqlite",
        "online_database": False,
        "ai_enabled": settings.ASSISTANT_AI_ENABLED,
        "model": settings.GEMINI_MODEL,
    }


@app.get("/saved-places")
@app.get("/saved-places/collections")
def empty_saved(user: str = Depends(get_current_user_id)):
    return {"items": []}


@app.get("/qa/state")
def state(
    trip_id: str, mode: str = "planner", user: str = Depends(get_current_user_id)
):
    history = service.history(user, trip_id, mode)
    with store.session(user, trip_id, mode) as working:
        debug = {
            k: deepcopy(working.get(k))
            for k in ("criteria", "last_ids", "focused_day", "plan_edits")
        }
    return {
        "itinerary": service.owned_itinerary(trip_id, user),
        "chat": history,
        "working": debug,
    }


class AIFlag(BaseModel):
    enabled: bool


@app.post("/qa/ai")
def ai(flag: AIFlag, user: str = Depends(get_current_user_id)):
    if flag.enabled and not (
        settings.ASSISTANT_AI_FREE_TIER_CONFIRMED and settings.gemini_configured
    ):
        raise HTTPException(409, "Chưa có cấu hình Free Tier đã xác minh.")
    settings.ASSISTANT_AI_ENABLED = flag.enabled
    return {"ai_enabled": flag.enabled, "scope": "this demo process only"}


@app.get("/qa/provider-diagnostics")
def provider_diagnostics(user: str = Depends(get_current_user_id)):
    return {"provider_metadata": provider_metadata}


@app.get("/qa/poi.svg")
def fixture_image():
    return Response(
        '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="170"><rect width="320" height="170" fill="#e6efe8"/><text x="35" y="90" fill="#28503b" font-size="22">GreenTrip · SQLite demo</text></svg>',
        media_type="image/svg+xml",
    )


if __name__ == "__main__":
    import uvicorn

    print(f"SQLITE_ONLY={DB}", flush=True)
    print(f"QA_BACKEND_URL=http://127.0.0.1:{QA_PORT}", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=QA_PORT, access_log=True)
