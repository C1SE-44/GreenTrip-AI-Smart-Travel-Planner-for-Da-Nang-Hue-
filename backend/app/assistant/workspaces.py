"""Account-owned trip metadata in the private demo store; no public Data API table."""
import json
import sqlite3
from contextlib import contextmanager
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from app.assistant import store
from app.auth.dependencies import get_current_user_id
from app.db.postgres import get_connection
from app.trips.itinerary_repository import _ensure_local_tables

router = APIRouter(prefix="/trip-workspaces", tags=["Private trip workspace"])

@contextmanager
def connection():
    path = store.PATH.with_name(store.PATH.stem + "_trips.db")
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path, timeout=15) as db:
        db.execute("CREATE TABLE IF NOT EXISTS trip_workspaces(trip_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,data TEXT NOT NULL,revision INTEGER NOT NULL,deleted INTEGER NOT NULL DEFAULT 0)")
        yield db


def legacy_owner(trip_id):
    with get_connection() as db:
        with db.cursor() as cursor:
            _ensure_local_tables(db,cursor)
            cursor.execute("SELECT user_id FROM public.itineraries WHERE trip_id = %s",(trip_id,))
            row=cursor.fetchone()
            return str(row[0] or "") if row else None


def assert_access(trip_id,user_id):
    if not trip_id:return
    with connection() as db:
        row=db.execute("SELECT user_id,deleted FROM trip_workspaces WHERE trip_id=?",(trip_id,)).fetchone()
    if row and row[0]!=str(user_id):raise HTTPException(403,"Chuyến đi không thuộc tài khoản này.")
    if row and row[1]:raise HTTPException(410,"Chuyến đi đã được xóa khỏi tài khoản.")


def unpack(row):
    return json.loads(row[0]) | {"workspaceRevision":row[1]}


class WorkspaceWrite(BaseModel):
    data: dict
    expected_revision: int | None = Field(default=None,ge=1)

    @field_validator("data")
    @classmethod
    def bounded(cls,data):
        if len(json.dumps(data,ensure_ascii=False))>100_000:raise ValueError("Trip metadata is too large")
        if not isinstance(data.get("id"),str) or not 1<=len(data["id"])<=100 or data["id"].startswith("sample-"):
            raise ValueError("A private trip ID is required")
        if not isinstance(data.get("title"),str) or not 1<=len(data["title"])<=200:raise ValueError("Title is required")
        if data.get("destination") not in ("Huế","Đà Nẵng","Đà Nẵng & Huế"):raise ValueError("Unsupported destination")
        for key in ("ideas","savedPlaces"):
            ids=data.get(key,[])
            if not isinstance(ids,list) or len(ids)>200 or any(not isinstance(i,str) or not 1<=len(i)<=200 for i in ids):raise ValueError("Invalid place IDs")
        for key,lo,hi in (("daysCount",1,31),("flexibleDays",1,31),("peopleCount",1,20)):
            if data.get(key) is not None and (not isinstance(data[key],int) or isinstance(data[key],bool) or not lo<=data[key]<=hi):raise ValueError("Invalid trip duration or people count")
        return {k:v for k,v in data.items() if k not in ("user_id","owner_id","workspaceRevision","copilotChatHistory")}


@router.get("")
def list_workspaces(user: str=Depends(get_current_user_id)):
    with connection() as db:
        rows=db.execute("SELECT data,revision,deleted,trip_id FROM trip_workspaces WHERE user_id=? ORDER BY rowid DESC",(str(user),)).fetchall()
    return {"items":[unpack(row) for row in rows if not row[2]],"deleted_ids":[row[3] for row in rows if row[2]]}


@router.get("/{trip_id}")
def get_workspace(trip_id: str,user: str=Depends(get_current_user_id)):
    assert_access(trip_id,user)
    with connection() as db:
        row=db.execute("SELECT data,revision FROM trip_workspaces WHERE trip_id=? AND user_id=? AND deleted=0",(trip_id,str(user))).fetchone()
    if not row:raise HTTPException(404,"Chưa có bản lưu chuyến đi.")
    return unpack(row)


@router.put("/{trip_id}")
def put_workspace(trip_id: str,payload: WorkspaceWrite,user: str=Depends(get_current_user_id)):
    if payload.data["id"]!=trip_id:raise HTTPException(422,"Mã chuyến đi không khớp.")
    owner=legacy_owner(trip_id)
    if owner is None and store.PATH.exists():
        with sqlite3.connect(store.PATH,timeout=15) as old:
            exists=old.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='assistant_sessions'").fetchone()
            rows=old.execute("SELECT user_id,state FROM assistant_sessions WHERE scope=?",(f"trip:{trip_id}",)).fetchall() if exists else []
            owners={row[0] for row in rows if json.loads(row[1]).get("messages")}
        if owners and (str(user) not in owners or len(owners)>1):
            raise HTTPException(403,"Không thể nhận bản lưu cũ của tài khoản khác. Bạn tạo một chuyến riêng nhé.")
    if owner is not None and owner!=str(user):raise HTTPException(403,"Chuyến đi không thuộc tài khoản này.")
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        row=db.execute("SELECT user_id,revision,deleted FROM trip_workspaces WHERE trip_id=?",(trip_id,)).fetchone()
        if row and row[0]!=str(user):raise HTTPException(403,"Chuyến đi không thuộc tài khoản này.")
        if row and row[2]:raise HTTPException(410,"Chuyến đi đã được xóa.")
        if row and payload.expected_revision!=row[1]:raise HTTPException(409,"Bản lưu chuyến đi đã thay đổi. Tải lại trước khi chỉnh tiếp.")
        if not row and payload.expected_revision is not None:raise HTTPException(409,"Bản lưu chuyến đi không còn tồn tại.")
        revision=(row[1]+1) if row else 1
        db.execute("INSERT INTO trip_workspaces(trip_id,user_id,data,revision) VALUES(?,?,?,?) ON CONFLICT(trip_id) DO UPDATE SET data=excluded.data,revision=excluded.revision",(trip_id,str(user),json.dumps(payload.data,ensure_ascii=False),revision))
    return payload.data | {"workspaceRevision":revision}


def save_ideas_if_registered(trip_id,user,ids):
    assert_access(trip_id,user)
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        row=db.execute("SELECT data,revision FROM trip_workspaces WHERE trip_id=? AND user_id=? AND deleted=0",(trip_id,str(user))).fetchone()
        if not row:return None
        data=json.loads(row[0]);data["ideas"]=list(dict.fromkeys([*data.get("ideas",[]),*ids]))
        db.execute("UPDATE trip_workspaces SET data=?,revision=revision+1 WHERE trip_id=? AND user_id=?",(json.dumps(data,ensure_ascii=False),trip_id,str(user)))
        return {"ideas":data["ideas"],"revision":row[1]+1}


@router.delete("/{trip_id}")
def delete_workspace(trip_id: str,user: str=Depends(get_current_user_id)):
    assert_access(trip_id,user)
    with connection() as db:
        cursor=db.execute("UPDATE trip_workspaces SET deleted=1,revision=revision+1 WHERE trip_id=? AND user_id=? AND deleted=0",(trip_id,str(user)))
        if not cursor.rowcount:raise HTTPException(404,"Không tìm thấy chuyến đi.")
    return {"deleted":True}


def load_if_registered(trip_id,user):
    if not trip_id:return None
    try:return get_workspace(trip_id,user)
    except HTTPException as error:
        if error.status_code==404:return None
        raise
