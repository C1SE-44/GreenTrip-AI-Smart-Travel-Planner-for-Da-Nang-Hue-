import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import neo4j
from app.auth.router import router as auth_router
from app.pois.router import router as pois_router
from app.trips.router import router as trips_router
from app.recommendations.router import router as recommendations_router
from app.itineraries.router import router as itineraries_router
from app.itineraries.repository import seed_sample_itineraries


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    try:
        await asyncio.to_thread(seed_sample_itineraries)
    except Exception as e:
        print(f"Warning: could not seed sample itineraries: {e}")
    try:
        yield
    finally:
        neo4j.close_driver()


app = FastAPI(title="GreenTrip AI API", lifespan=lifespan)

# Cấu hình cho phép tất cả nguồn (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(pois_router)
app.include_router(trips_router)
app.include_router(
    recommendations_router,
    prefix="/api/v1/recommendations",
    tags=["Recommendations"],
)
app.include_router(
    recommendations_router,
    prefix="/v1/recommendations",
    tags=["Recommendations"],
)
app.include_router(
    recommendations_router,
    prefix="/recommendations",
    tags=["Recommendations"],
)
app.include_router(
    itineraries_router,
    prefix="/api/itineraries",
    tags=["Itineraries"],
)
app.include_router(
    itineraries_router,
    prefix="/itineraries",
    tags=["Itineraries"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "greentrip-api"}


@app.get("/")
async def root() -> dict[str, str]:
    return {"status": "ok", "service": "greentrip-api"}
