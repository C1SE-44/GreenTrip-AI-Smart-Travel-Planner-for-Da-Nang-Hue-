from typing import Literal
from fastapi import APIRouter, Depends, Query
from app.auth.dependencies import get_current_user_id
from app.assistant.schemas import ChatRequest, ApplyRequest, InTripPreviewRequest, InTripReconcileRequest
from app.assistant import service

router = APIRouter(prefix="/assistant", tags=["Travel Assistant"])


@router.post("/chat")
def chat(payload: ChatRequest, user_id: str = Depends(get_current_user_id)):
    return service.process(payload, user_id)


@router.get("/history")
def history(
    mode: Literal["discover", "planner"] = "discover",
    trip_id: str | None = Query(default=None, max_length=100),
    conversation_id: int = Query(default=1, ge=1, le=3),
    user_id: str = Depends(get_current_user_id),
):
    return service.history(user_id, trip_id, mode, conversation_id)


@router.post("/apply")
def apply(payload: ApplyRequest, user_id: str = Depends(get_current_user_id)):
    return service.apply(user_id, payload)


@router.post("/in-trip/preview")
def in_trip_preview(payload: InTripPreviewRequest, user_id: str = Depends(get_current_user_id)):
    return service.preview_in_trip(user_id, payload)


@router.post("/in-trip/reconcile")
def in_trip_reconcile(payload: InTripReconcileRequest, user_id: str = Depends(get_current_user_id)):
    return service.reconcile_in_trip_apply(user_id, payload.trip_id)


@router.get("/conversations")
def conversations(mode: Literal["discover","planner"]="discover",trip_id: str | None=Query(default=None,max_length=100),user_id: str=Depends(get_current_user_id)):
    return service.conversations(user_id,trip_id,mode)
