"""Account-owned trip metadata in the private demo store; no public Data API table."""
import json
import math
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from app.assistant import store
from app.auth.dependencies import get_current_user_id
from app.db.postgres import get_connection
from app.trips.schemas import ALLOWED_PREFERENCES

router = APIRouter(prefix="/trip-workspaces", tags=["Private trip workspace"])


def _validate_accommodation_plan(plan):
    if not isinstance(plan, dict) or plan.get("version") != 1:
        raise ValueError("Invalid accommodation plan.")
    if plan.get("itineraryVariantId") is not None and (
        not isinstance(plan["itineraryVariantId"], str) or len(plan["itineraryVariantId"]) > 100
    ):
        raise ValueError("Invalid itinerary variant for accommodation plan.")
    signature = plan.get("itinerarySignature")
    if signature is not None and (not isinstance(signature, str) or len(signature) > 64):
        raise ValueError("Invalid accommodation itinerary signature.")
    groups = plan.get("groups", [])
    if not isinstance(groups, list) or len(groups) > 40:
        raise ValueError("Invalid accommodation groups.")
    allowed_statuses = {"RECOMMENDED", "SELECTED", "BOOKED_BY_USER", "CHOOSE_LATER"}
    for group in groups:
        if not isinstance(group, dict):
            raise ValueError("Invalid accommodation group.")
        for key, limit in (("groupId", 160), ("city", 100)):
            value = group.get(key)
            if not isinstance(value, str) or not 1 <= len(value.strip()) <= limit:
                raise ValueError(f"Accommodation {key} is required.")
        status = group.get("status")
        if status not in allowed_statuses:
            raise ValueError("Invalid accommodation selection status.")
        if status == "SELECTED" and (
            not isinstance(group.get("stayId"), str) or not group["stayId"].strip()
        ):
            raise ValueError("A selected catalogue stay requires a stay ID.")
        if status == "BOOKED_BY_USER" and (
            not isinstance(group.get("name"), str) or not group["name"].strip()
        ):
            raise ValueError("A user-booked stay requires its name.")
        if group.get("stayId") is not None and (not isinstance(group["stayId"], str) or len(group["stayId"]) > 200):
            raise ValueError("Invalid stay ID.")
        for key, limit in (("name", 200), ("address", 500)):
            value = group.get(key)
            if value is not None and (not isinstance(value, str) or len(value) > limit):
                raise ValueError(f"Invalid accommodation {key}.")
        days = group.get("dayNumbers", [])
        if not isinstance(days, list) or len(days) > 31 or any(
            not isinstance(day, int) or isinstance(day, bool) or not 1 <= day <= 31 for day in days
        ):
            raise ValueError("Invalid accommodation day numbers.")
        for key, minimum, maximum in (("latitude", -90, 90), ("longitude", -180, 180)):
            value = group.get(key)
            if value is not None and (
                not isinstance(value, (int, float)) or isinstance(value, bool)
                or not math.isfinite(value) or not minimum <= value <= maximum
            ):
                raise ValueError("Invalid accommodation coordinates.")
        if (group.get("latitude") is None) != (group.get("longitude") is None):
            raise ValueError("Accommodation coordinates must include latitude and longitude.")
        for key in ("nights", "roomCount"):
            value = group.get(key)
            maximum = 31 if key == "nights" else 20
            minimum = 0 if key == "nights" else 1
            if value is not None and (
                not isinstance(value, int) or isinstance(value, bool) or not minimum <= value <= maximum
            ):
                raise ValueError(f"Invalid accommodation {key}.")
        for key in ("nightlyPrice", "estimatedTotalCost"):
            value = group.get(key)
            maximum = 1_000_000_000 if key == "nightlyPrice" else 1_000_000_000_000
            if value is not None and (
                not isinstance(value, (int, float)) or isinstance(value, bool)
                or not math.isfinite(value) or value <= 0 or value > maximum
            ):
                raise ValueError("Invalid accommodation price.")
        if group.get("currency") is not None and group["currency"] not in {"VND", "USD", "EUR"}:
            raise ValueError("Unsupported accommodation currency.")
        if group.get("nightsStatus") is not None and group["nightsStatus"] not in {"DATE_RANGE", "ESTIMATED", "UNKNOWN"}:
            raise ValueError("Invalid accommodation nights status.")


def _validate_transport_plan(plan):
    if not isinstance(plan, dict) or plan.get("version") != 1:
        raise ValueError("Invalid transport plan.")
    alternatives = plan.get("confirmedAlternatives", [])
    if not isinstance(alternatives, list) or len(alternatives) > 2:
        raise ValueError("Transport may store at most two confirmed itinerary alternatives.")
    alternative_ids = set()
    for alternative in alternatives:
        if not isinstance(alternative, dict):
            raise ValueError("Invalid confirmed transport alternative.")
        alternative_id = alternative.get("alternativeId")
        fingerprint = alternative.get("itineraryFingerprint")
        if not isinstance(alternative_id, str) or not 1 <= len(alternative_id) <= 100:
            raise ValueError("Invalid transport alternative ID.")
        if alternative_id in alternative_ids:
            raise ValueError("Transport alternative IDs must be unique.")
        alternative_ids.add(alternative_id)
        if not isinstance(fingerprint, str) or len(fingerprint) != 64 or any(char not in "0123456789abcdef" for char in fingerprint):
            raise ValueError("Invalid transport itinerary fingerprint.")
        selections = alternative.get("selections", [])
        if not isinstance(selections, list) or len(selections) > 100:
            raise ValueError("Invalid transport selections.")
        leg_ids = set()
        for selection in selections:
            if not isinstance(selection, dict):
                raise ValueError("Invalid transport selection.")
            leg_id = selection.get("legId")
            mode = selection.get("mode")
            selected_at = selection.get("selectedAt")
            if not isinstance(leg_id, str) or not 1 <= len(leg_id) <= 64 or leg_id in leg_ids:
                raise ValueError("Transport selection leg IDs must be valid and unique.")
            leg_ids.add(leg_id)
            if mode not in {"CAR", "PRIVATE_CAR", "TRAIN"}:
                raise ValueError("Unsupported selected transport mode.")
            if not isinstance(selected_at, str):
                raise ValueError("Transport selection time is required.")
            try:
                timestamp = datetime.fromisoformat(selected_at)
            except ValueError as error:
                raise ValueError("Invalid transport selection time.") from error
            if timestamp.tzinfo is None or timestamp.utcoffset() is None:
                raise ValueError("Transport selection time must include a timezone.")


def _validate_actual_progress(progress):
    if not isinstance(progress, dict) or progress.get("version") != 1:
        raise ValueError("Invalid actual progress version.")
    statuses = {"PLANNED", "IN_PROGRESS", "VISITED", "POSTPONED", "SKIPPED", "UNSCHEDULED"}
    stops = progress.get("stops", [])
    movements = progress.get("movements", [])
    if not isinstance(stops, list) or len(stops) > 500:
        raise ValueError("Invalid actual progress stops.")
    stop_ids = set()
    for item in stops:
        if not isinstance(item, dict):
            raise ValueError("Invalid actual progress stop.")
        stop_id = item.get("stopId")
        if not isinstance(stop_id, str) or not 1 <= len(stop_id) <= 100 or stop_id in stop_ids:
            raise ValueError("Actual progress stop IDs must be valid and unique.")
        stop_ids.add(stop_id)
        status = item.get("status")
        if not isinstance(status, str) or status not in statuses:
            raise ValueError("Invalid actual progress status.")
        for key in ("statusUpdatedAt", "actualStartAt", "actualEndAt"):
            value = item.get(key)
            if value is None and key != "statusUpdatedAt":
                continue
            if not isinstance(value, str):
                raise ValueError("Invalid actual progress timestamp.")
            try:
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError as error:
                raise ValueError("Invalid actual progress timestamp.") from error
            if parsed.tzinfo is None or parsed.utcoffset() is None:
                raise ValueError("Actual progress timestamps must include a timezone.")
        start, end = item.get("actualStartAt"), item.get("actualEndAt")
        if start and end and datetime.fromisoformat(start.replace("Z", "+00:00")) > datetime.fromisoformat(end.replace("Z", "+00:00")):
            raise ValueError("Actual end time must be after actual start time.")
        for key, limit in (("poiId", 200), ("name", 200)):
            value = item.get(key)
            if value is not None and (not isinstance(value, str) or len(value) > limit):
                raise ValueError("Invalid actual progress place data.")
        reasons = item.get("reasonCodes", [])
        if not isinstance(reasons, list) or len(reasons) > 10 or any(not isinstance(reason, str) or len(reason) > 80 for reason in reasons):
            raise ValueError("Invalid actual progress reason codes.")
    if not isinstance(movements, list) or len(movements) > 500:
        raise ValueError("Invalid actual progress movements.")
    for movement in movements:
        stop_id = movement.get("stopId") if isinstance(movement, dict) else None
        if not isinstance(stop_id, str) or not 1 <= len(stop_id) <= 100:
            raise ValueError("Invalid actual progress movement.")
        source_day = movement.get("fromDay")
        target_day = movement.get("toDay")
        if not isinstance(source_day, int) or isinstance(source_day, bool) or not 1 <= source_day <= 31:
            raise ValueError("Invalid actual progress movement day.")
        if target_day is not None and (not isinstance(target_day, int) or isinstance(target_day, bool) or not 1 <= target_day <= 31):
            raise ValueError("Invalid actual progress movement day.")
        changed = movement.get("changedAt")
        if not isinstance(changed, str):
            raise ValueError("Invalid actual progress movement time.")
        try:
            parsed = datetime.fromisoformat(changed.replace("Z", "+00:00"))
        except ValueError as error:
            raise ValueError("Invalid actual progress movement time.") from error
        if parsed.tzinfo is None or parsed.utcoffset() is None:
            raise ValueError("Actual progress movement time must include a timezone.")
    return progress


@contextmanager
def connection():
    path = store.PATH.with_name(store.PATH.stem + "_trips.db")
    with sqlite3.connect(path, timeout=15) as db:
        yield db


def initialize_store() -> None:
    """Explicitly create the private trip workspace schema for a prepared local/test store."""
    path = store.PATH.with_name(store.PATH.stem + "_trips.db")
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path, timeout=15) as db:
        db.execute(
            "CREATE TABLE IF NOT EXISTS trip_workspaces(trip_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,data TEXT NOT NULL,revision INTEGER NOT NULL,deleted INTEGER NOT NULL DEFAULT 0)"
        )


def legacy_owner(trip_id):
    with get_connection() as db:
        with db.cursor() as cursor:
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
    data = json.loads(row[0])
    # The saga journal is server-only; clients must never be able to forge it.
    data.pop("_inTripApply", None)
    data.pop("_lastInTripApply", None)
    return data | {"workspaceRevision":row[1]}


class WorkspaceWrite(BaseModel):
    data: dict
    expected_revision: int | None = Field(default=None,ge=1)

    @field_validator("data")
    @classmethod
    def bounded(cls,data):
        if len(json.dumps(data,ensure_ascii=False))>100_000:raise ValueError("Trip metadata is too large")
        if "_inTripApply" in data or "_lastInTripApply" in data:
            raise ValueError("Internal trip apply state cannot be provided by clients")
        if not isinstance(data.get("id"),str) or not 1<=len(data["id"])<=100 or data["id"].startswith("sample-"):
            raise ValueError("A private trip ID is required")
        if not isinstance(data.get("title"),str) or not 1<=len(data["title"])<=200:raise ValueError("Title is required")
        if data.get("destination") not in ("Huế","Đà Nẵng","Đà Nẵng & Huế"):raise ValueError("Unsupported destination")
        for key in ("ideas","savedPlaces"):
            ids=data.get(key,[])
            if not isinstance(ids,list) or len(ids)>200 or any(not isinstance(i,str) or not 1<=len(i)<=200 for i in ids):raise ValueError("Invalid place IDs")
        for key,lo,hi in (("daysCount",1,31),("flexibleDays",1,31),("peopleCount",1,20)):
            if data.get(key) is not None and (not isinstance(data[key],int) or isinstance(data[key],bool) or not lo<=data[key]<=hi):raise ValueError("Invalid trip duration or people count")

        for key in ("greenWeight", "budgetWeight"):
            value=data.get(key)
            if value is not None and (not isinstance(value,(int,float)) or isinstance(value,bool) or not 0<=value<=100):
                raise ValueError("Recommendation weights must be between 0 and 100")

        party_keys=("adultCount","childCount","infantCount","petCount")
        if any(key in data for key in party_keys):
            counts={key:data.get(key,0) for key in party_keys}
            if any(not isinstance(value,int) or isinstance(value,bool) or value<0 or value>20 for value in counts.values()):
                raise ValueError("Invalid traveler counts")
            human_count=counts["adultCount"]+counts["childCount"]+counts["infantCount"]
            if not 1<=human_count<=20 or (data.get("tripInputVersion")==1 and data.get("peopleCount")!=human_count):
                raise ValueError("peopleCount must equal adults, children, and infants; pets are separate")

        if "interests" in data:
            interests=data["interests"]
            if not isinstance(interests,list) or len(interests)>len(ALLOWED_PREFERENCES) or any(not isinstance(item,str) or item not in ALLOWED_PREFERENCES for item in interests) or len(set(interests))!=len(interests):
                raise ValueError("Invalid trip interests")
        if data.get("notes") is not None and (not isinstance(data["notes"],str) or len(data["notes"])>2000):
            raise ValueError("Trip notes must be 2,000 characters or fewer")

        if data.get("accommodationPlan") is not None:
            _validate_accommodation_plan(data["accommodationPlan"])
        if data.get("transportPlan") is not None:
            _validate_transport_plan(data["transportPlan"])

        if data.get("actualProgress") is not None:
            _validate_actual_progress(data["actualProgress"])

        date_mode=data.get("dateMode")
        if date_mode is not None:
            if date_mode not in ("dates","flex"):
                raise ValueError("Invalid trip date mode")
            if date_mode=="flex":
                if data.get("startDate") is not None or data.get("endDate") is not None:
                    raise ValueError("Flexible trips cannot store a specific start or end date")
                flexible_days=data.get("flexibleDays")
                if not isinstance(flexible_days,int) or isinstance(flexible_days,bool) or not 1<=flexible_days<=14 or data.get("daysCount")!=flexible_days:
                    raise ValueError("Flexible trip duration must match daysCount and be from 1 to 14")
                if not isinstance(data.get("flexibleMonth"),str) or not data["flexibleMonth"].strip():
                    raise ValueError("Flexible trips require a selected month")
            else:
                try:
                    start=date.fromisoformat(data.get("startDate") or "")
                    end=date.fromisoformat(data.get("endDate") or "")
                except (TypeError,ValueError):
                    raise ValueError("Date-specific trips require valid startDate and endDate values")
                if (end-start).days+1!=data.get("daysCount") or not 1<=data.get("daysCount",0)<=14:
                    raise ValueError("Date range must match daysCount and be from 1 to 14 days")

        amount=data.get("budgetInputAmount")
        scope=data.get("budgetScope")
        total=data.get("totalBudget")
        if amount is None and scope is None:
            if total is not None and (not isinstance(total,(int,float)) or isinstance(total,bool) or total<=0 or total>1_000_000_000 or not float(total).is_integer()):
                raise ValueError("Invalid total budget")
        elif amount is None or scope not in ("PER_PERSON","TOTAL_GROUP"):
            raise ValueError("Budget amount and scope must be provided together")
        else:
            if not isinstance(amount,int) or isinstance(amount,bool) or amount<=0 or amount>1_000_000_000:
                raise ValueError("Budget amount must be a positive whole VND amount")
            if not isinstance(total,(int,float)) or isinstance(total,bool) or total<=0 or total>1_000_000_000 or not float(total).is_integer():
                raise ValueError("A normalized total budget is required")
            applicable_count=(data.get("adultCount",0)+data.get("childCount",0)) if any(key in data for key in party_keys) else data.get("peopleCount",0)
            expected=amount*applicable_count if scope=="PER_PERSON" else amount
            if total!=expected:
                raise ValueError("totalBudget does not match the budget amount and scope")
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
        if row:
            current = db.execute("SELECT data FROM trip_workspaces WHERE trip_id=?", (trip_id,)).fetchone()
            if current and json.loads(current[0]).get("_inTripApply"):
                raise HTTPException(409, "Trip apply reconciliation is in progress.")
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
        data=json.loads(row[0])
        if data.get("_inTripApply"):
            raise HTTPException(409, "Trip apply reconciliation is in progress.")
        data["ideas"]=list(dict.fromkeys([*data.get("ideas",[]),*ids]))
        db.execute("UPDATE trip_workspaces SET data=?,revision=revision+1 WHERE trip_id=? AND user_id=?",(json.dumps(data,ensure_ascii=False),trip_id,str(user)))
        return {"ideas":data["ideas"],"revision":row[1]+1}


@router.delete("/{trip_id}")
def delete_workspace(trip_id: str,user: str=Depends(get_current_user_id)):
    assert_access(trip_id,user)
    with connection() as db:
        row = db.execute("SELECT data FROM trip_workspaces WHERE trip_id=? AND user_id=? AND deleted=0", (trip_id,str(user))).fetchone()
        if row and json.loads(row[0]).get("_inTripApply"):
            raise HTTPException(409, "Trip apply reconciliation is in progress.")
        cursor=db.execute("UPDATE trip_workspaces SET deleted=1,revision=revision+1 WHERE trip_id=? AND user_id=? AND deleted=0",(trip_id,str(user)))
        if not cursor.rowcount:raise HTTPException(404,"Không tìm thấy chuyến đi.")
    return {"deleted":True}


def load_if_registered(trip_id,user):
    if not trip_id:return None
    try:return get_workspace(trip_id,user)
    except HTTPException as error:
        if error.status_code==404:return None
        raise


def save_actual_progress(trip_id, user, progress, expected_revision):
    """Compare-and-save progress in the private Workspace without touching itinerary rows."""
    assert_access(trip_id, user)
    _validate_actual_progress(progress)
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute(
            "SELECT user_id,data,revision,deleted FROM trip_workspaces WHERE trip_id=?",
            (trip_id,),
        ).fetchone()
        if not row or row[3]:
            raise HTTPException(404, "Chưa có bản lưu chuyến đi.")
        if row[0] != str(user):
            raise HTTPException(403, "Chuyến đi không thuộc tài khoản này.")
        if row[2] != expected_revision:
            raise HTTPException(409, "Tiến độ chuyến đi đã thay đổi. Tải lại trước khi áp dụng.")
        data = json.loads(row[1])
        if data.get("_inTripApply"):
            raise HTTPException(409, "Trip apply reconciliation is in progress.")
        data["actualProgress"] = progress
        revision = row[2] + 1
        db.execute(
            "UPDATE trip_workspaces SET data=?,revision=? WHERE trip_id=? AND user_id=?",
            (json.dumps(data, ensure_ascii=False), revision, trip_id, str(user)),
        )
    return data | {"workspaceRevision": revision}


def begin_in_trip_apply(trip_id, user, operation, expected_revision):
    """Persist a server-only intent before writing the itinerary in another store."""
    assert_access(trip_id, user)
    _validate_actual_progress(operation.get("target_progress"))
    operation_id = operation.get("operation_id")
    if not isinstance(operation_id, str) or not 1 <= len(operation_id) <= 100:
        raise ValueError("Invalid in-trip operation ID")
    for key in ("before_digest", "after_digest"):
        value = operation.get(key)
        if not isinstance(value, str) or len(value) != 64:
            raise ValueError("Invalid in-trip itinerary digest")
    if not isinstance(operation.get("base_updated_at"), str):
        raise ValueError("Invalid base itinerary revision")

    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute(
            "SELECT user_id,data,revision,deleted FROM trip_workspaces WHERE trip_id=?",
            (trip_id,),
        ).fetchone()
        if not row or row[3]:
            raise HTTPException(404, "Trip Workspace not found.")
        if row[0] != str(user):
            raise HTTPException(403, "Trip does not belong to this account.")
        data = json.loads(row[1])
        pending = data.get("_inTripApply")
        if pending:
            if pending == operation:
                return {"workspaceRevision": row[2], "operation_id": operation_id}
            raise HTTPException(409, "Another trip apply requires reconciliation.")
        last = data.get("_lastInTripApply") or {}
        if last.get("operation_id") == operation_id:
            return {"workspaceRevision": row[2], "operation_id": operation_id}
        if row[2] != expected_revision:
            raise HTTPException(409, "Trip progress changed; create a fresh preview.")
        data["_inTripApply"] = operation
        revision = row[2] + 1
        db.execute(
            "UPDATE trip_workspaces SET data=?,revision=? WHERE trip_id=? AND user_id=?",
            (json.dumps(data, ensure_ascii=False), revision, trip_id, str(user)),
        )
    return {"workspaceRevision": revision, "operation_id": operation_id}


def reconcile_in_trip_apply(trip_id, user, operation_id, observed_digest, observed_updated_at):
    """Resolve an intent only when the current itinerary proves applied or not applied."""
    assert_access(trip_id, user)
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute(
            "SELECT user_id,data,revision,deleted FROM trip_workspaces WHERE trip_id=?",
            (trip_id,),
        ).fetchone()
        if not row or row[3]:
            raise HTTPException(404, "Trip Workspace not found.")
        if row[0] != str(user):
            raise HTTPException(403, "Trip does not belong to this account.")
        data = json.loads(row[1])
        pending = data.get("_inTripApply")
        if not pending:
            last = data.get("_lastInTripApply") or {}
            if last.get("operation_id") == operation_id:
                return {"status": last["outcome"], "actualProgress": data.get("actualProgress"), "workspaceRevision": row[2]}
            return {"status": "CLEAN", "actualProgress": data.get("actualProgress"), "workspaceRevision": row[2]}
        if pending.get("operation_id") != operation_id:
            raise HTTPException(409, "Trip apply operation does not match the pending intent.")

        base_updated_at = pending.get("base_updated_at")
        applied = observed_digest == pending.get("after_digest") and observed_updated_at != base_updated_at
        not_applied = observed_digest == pending.get("before_digest") and observed_updated_at == base_updated_at
        if not applied and not not_applied:
            return {"status": "CONFLICT", "actualProgress": data.get("actualProgress"), "workspaceRevision": row[2]}

        outcome = "APPLIED" if applied else "NOT_APPLIED"
        if applied:
            data["actualProgress"] = pending["target_progress"]
        data.pop("_inTripApply", None)
        data["_lastInTripApply"] = {
            "operation_id": operation_id,
            "outcome": outcome,
            "itinerary_digest": observed_digest,
        }
        revision = row[2] + 1
        db.execute(
            "UPDATE trip_workspaces SET data=?,revision=? WHERE trip_id=? AND user_id=?",
            (json.dumps(data, ensure_ascii=False), revision, trip_id, str(user)),
        )
    return {"status": outcome, "actualProgress": data.get("actualProgress"), "workspaceRevision": revision}


def has_pending_in_trip_apply(trip_id, user):
    assert_access(trip_id, user)
    with connection() as db:
        row = db.execute(
            "SELECT data FROM trip_workspaces WHERE trip_id=? AND user_id=? AND deleted=0",
            (trip_id, str(user)),
        ).fetchone()
    return bool(row and json.loads(row[0]).get("_inTripApply"))


def pending_in_trip_apply(trip_id, user):
    assert_access(trip_id, user)
    with connection() as db:
        row = db.execute(
            "SELECT data FROM trip_workspaces WHERE trip_id=? AND user_id=? AND deleted=0",
            (trip_id, str(user)),
        ).fetchone()
    return json.loads(row[0]).get("_inTripApply") if row else None
