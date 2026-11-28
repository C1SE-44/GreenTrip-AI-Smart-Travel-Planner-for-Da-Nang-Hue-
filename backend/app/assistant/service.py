from hashlib import sha256
import json
import math
import re
import logging
from time import perf_counter
from copy import deepcopy
from uuid import uuid4, uuid5, NAMESPACE_URL
from fastapi import HTTPException
from datetime import datetime, timedelta, timezone
from app.assistant import store, dialogue, demo_search, auto_plan, workspaces, planning
from app.assistant.schemas import ChatRequest, InTripPreviewRequest
from app.assistant.search import (
    catalogue,
    card,
    criteria,
    fold,
    search,
    rank,
    upper_price,
    select_results,
    preference_score,
    explicit_city,
    reason_for,
)
from app.assistant.planning import (
    create_plan,
    build_alternatives,
    empty_itinerary,
    validate_past,
    edit_plan,
    change_summary,
)
from app.assistant.nlu import extract
from app.trips.schemas import TripItinerarySyncRequest
from app.trips.itinerary_repository import (
    get_itinerary_with_ownership,
    save_itinerary,
)
from app.db.postgres import get_connection


def digest(value):
    return sha256(
        json.dumps(value, sort_keys=True, default=str, ensure_ascii=False).encode()
    ).hexdigest()


def itinerary_content_digest(value):
    """Hash the itinerary payload while excluding its mutable updated_at revision."""
    payload = TripItinerarySyncRequest.model_validate(value).model_dump(mode="json")
    return digest(payload)


def owned_itinerary(trip_id, user_id):
    if not trip_id:
        return None
    workspaces.assert_access(trip_id,user_id)
    if trip_id.startswith("sample-"):
        raise HTTPException(
            403, "Hãy lưu lịch mẫu thành chuyến riêng trước khi dùng trợ lý."
        )
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT user_id FROM public.itineraries WHERE trip_id = %s", (trip_id,)
            )
            row = cursor.fetchone()
            if row and str(row[0] or "") != str(user_id):
                raise HTTPException(
                    403,
                    "Chuyến này không thuộc tài khoản đang đăng nhập. Hãy lưu một bản riêng của bạn.",
                )
    if not row:
        return None
    result = get_itinerary_with_ownership(trip_id, user_id)
    return result.model_dump(mode="json") if result else None


def prompts(context, mode):
    city = context.destination or "Huế"
    if mode == "planner" and context.idea_ids:
        return ["Xếp lịch từ Ý tưởng", f"Tìm địa điểm ở {city}"]
    return [
        f"Tìm cà phê ở {city}",
        f"Gợi ý điểm thiên nhiên ở {city}",
        f"Tìm bảo tàng ở {city}",
    ]


def reply(text, context, mode, **fields):
    return {
        "text": text,
        "pois": [],
        "unknown_price_pois": [],
        "prompts": prompts(context, mode),
        "draft": None,
        "engine": "database",
        "idea_ids": context.idea_ids,
        **fields,
    }


def reference(message, state):
    text = fold(message)
    # Accent folding turns “cho 5 địa điểm” (for five places) into a false “chỗ 5”.
    units = r"thu|so|diem" + (r"|cho" if "chỗ" in message.lower() else "")
    match = re.search(r"\b(?:" + units + r")\s*(\d+|nhat|mot|hai|ba|bon|tu|nam)\b", text)
    if not match:
        return None
    numbers = {"nhat": 1, "mot": 1, "hai": 2, "ba": 3, "bon": 4, "tu": 4, "nam": 5}
    index = int(match[1]) if match[1].isdigit() else numbers[match[1]]
    ids = state.get("last_ids") or []
    return ids[index - 1] if 0 < index <= len(ids) else None


def propose(state, before, after, warnings, kind="itinerary", **extra):
    draft = {
        "id": str(uuid4()),
        "kind": kind,
        "before_digest": digest(before),
        "itinerary": after,
        "warnings": warnings,
        **extra,
    }
    state["draft"] = draft
    return draft


logger = logging.getLogger("greentrip.assistant.route")


def whole_trip_request(message):
    text = fold(message)
    return bool(re.search(r"(?:\bxep\b|\blap\b|\blen\b|\btao\b|lich trinh|ke hoach|chia deu)", text) and re.search(r"(?:\d+\s*ngay|ca chuyen|toan bo chuyen)", text) and not re.search(r"\bngay\s*(?:thu\s*)?\d+\b", text))


def scoped_simple_edit(message):
    text = fold(message)
    day = re.search(r"\bngay\s*(?:thu\s*)?(\d+|hai|ba|bon)\b", text)
    if not day or any(word in text for word in ("diem", "noi ghe", "chot", "thay", "trua")):
        return None
    number = int(day[1]) if day[1].isdigit() else {"hai":2,"ba":3,"bon":4}[day[1]]
    time = re.search(r"(?:bat dau|khoi hanh)\s*(?:luc|tu)?\s*(\d{1,2})(?::|h)(\d{2})?", text)
    if time and int(time[1]) < 24 and int(time[2] or 0) < 60:
        return {"day":number,"start_after":f"{int(time[1]):02d}:{int(time[2] or 0):02d}"}
    if re.search(r"nhe hon|thu tha hon|giam nhip", text):
        return {"day":number}
    return None


def asks_for_ideas(message):
    text = fold(message)
    saved = re.search(r'y tuong|(?:dia diem|diem|noi|cho) da (?:chon|luu)|da them vao chuyen',text)
    query = re.search(r'xem|liet ke|danh sach|gom|nhung|co gi|bao nhieu|kiem tra',text)
    action = re.search(r'\b(?:xep|lap|tao) (?:lich|ke hoach)|\b(?:luu|them|xoa|bo) (?:vao|giup|diem|quan|cho|cai)',text)
    return bool(saved and query and not action)


def list_saved_ideas(request,state,ctx):
    if not request.trip_id:
        return reply('Bạn mở chuyến đi muốn xem Ý tưởng nhé.',ctx,request.mode,prompts=[])
    ids = list(dict.fromkeys(ctx.idea_ids))
    if not ids:
        return reply('Chuyến này chưa có địa điểm nào trong Ý tưởng.',ctx,request.mode,prompts=[])
    points = {str(p['id']):p for p in catalogue(ids=ids)}
    selected = [points[id] for id in ids if id in points]
    cards = [card(point) for point in selected]
    missing = len(ids)-len(selected)
    text = f'Chuyến này có {len(ids)} địa điểm trong Ý tưởng:'
    text += '\n' + '\n'.join(f"**{point['name']}** — {reason_for(point,{})}" for point in selected)
    if missing:
        text += f'\nCó {missing} địa điểm đã lưu chưa tải được thông tin; mình không thay bằng điểm khác.'
    state['last_ids'] = [p['id'] for p in cards]
    state['last_results'] = cards
    return reply(text,ctx,request.mode,pois=cards,prompts=[{'label':'Xếp lịch từ Ý tưởng','message':f'Xếp {len(ids)} điểm trong Ý tưởng thành lịch {ctx.days_count} ngày'}] if cards and not missing else [],outcome={'status':'partial' if missing else 'complete','missing_count':missing})


def fast_path(request):
    text = fold(request.message)
    if asks_for_ideas(request.message):
        return "list_ideas"
    if re.search(r"\b(?:green|diem xanh|eco score|du lich xanh)\b", text) and re.search(r"la gi|nghia la|giai thich|hieu the nao", text):
        return "explain_green"
    if scoped_simple_edit(request.message):
        return "scoped_simple_edit"
    if whole_trip_request(request.message):
        return "whole_trip_plan"
    if request.selected_poi_id:
        return "card_action"
    if re.fullmatch(
        r"(?:hello+|helo+|hi|hey|xin chao|chao+|alo)(?: ban| ban oi| there| nhe)?[ !?.]*",
        text,
    ):
        return "greeting"
    if text in ("xep lich tu y tuong", "luu cho vua chon vao y tuong"):
        return "explicit_action"
    return None


def needs_model(message):
    text = fold(message)
    # Rules cannot represent mixed quantities, exclusions or conversational edits.
    return bool(
        re.search(r"\b(?:\d+|mot|hai|ba|bon|nam)\s+(?:dia diem|diem|noi|quan)\b", text)
        or any(
            word in text
            for word in (
                "khong can",
                "dung goi",
                "loai tru",
                "khac",
                "giu",
                "doi",
                "con lai",
                "yen hon",
                "di tre",
                "uu tien",
                "dia phuong",
                "must try",
                "must-try",
            )
        )
    )


def process(request, user_id):
    started = perf_counter()
    ctx = request.context
    registered=workspaces.load_if_registered(request.trip_id,user_id)
    if registered is not None:ctx=ctx.model_copy(update={"idea_ids":registered.get("ideas",[])})
    current = owned_itinerary(request.trip_id, user_id)
    if current:
        current_fields = {
            k: current[k]
            for k in ("destination", "days_count", "title")
        }
        if ctx.date_mode != "flex":
            current_fields["start_date"] = current["start_date"]
        ctx = ctx.model_copy(
            update=current_fields
        )
    fast = fast_path(request)
    with store.session(user_id, request.trip_id, request.mode, request.conversation_id) as snapshot:
        if not snapshot.get("criteria"):
            snapshot["criteria"] = {"city": ctx.destination}
        if not fast and snapshot.get("topic") == "green" and re.search(r"\b(?:vi du|minh hoa)\b", fold(request.message)):
            fast = "green_examples"
        context = None
        if not fast:
            # Select only the mentioned day's stops, never the complete itinerary.
            focus = re.search(r"ngay\s*(\d+)", fold(request.message))
            context_state = deepcopy(snapshot)
            if focus:
                context_state["focused_day"] = int(focus[1])
            context = dialogue.compact(context_state, ctx, current, catalogue)
            for key in ("idea_refs", "idea_ref_ids"):
                if key in context_state:
                    snapshot[key] = context_state[key]
            context["mode"] = request.mode
        before_signature = dialogue.signature(snapshot)
    parsed = {} if fast else extract(request.message, context=context)
    model_calls = parsed.pop("_model_calls", int(bool(parsed)))
    prompt_version = parsed.pop("_prompt_version", None)
    model_name = parsed.pop("_model_name", None)
    try:
        parsed = dialogue.upgrade(parsed)
    except ValueError:
        parsed = {"_model_status": "invalid_response"}
    city = explicit_city(request.message)
    if city and parsed.get("intent") in ("search", "compare"):
        parsed["changes"] = [
            c for c in parsed.get("changes", []) if c["field"] != "city"
        ] + [{"field": "city", "op": "set", "value": city}]
    route = (
        "rules"
        if fast
        else (
            "fallback"
            if parsed.get("_model_status")
            else "gemini" if parsed.get("intent") else "rules"
        )
    )
    reason = (
        fast
        or parsed.get("_model_status")
        or ("structured_turn" if route == "gemini" else "ai_disabled")
    )
    with store.session(user_id, request.trip_id, request.mode, request.conversation_id) as state:
        if parsed.get("intent") and before_signature != dialogue.signature(state):
            raise HTTPException(
                409,
                "Ngữ cảnh vừa thay đổi. Bạn gửi lại yêu cầu trên danh sách hoặc bản nháp mới nhé.",
            )
        report = {}
        if route == "gemini" and parsed.get("intent") != "list_ideas":
            try:
                working = deepcopy(state)
                if (
                    parsed.get("intent") == "search"
                    and parsed.get("search_scope") == "new"
                ):
                    previous_city = (
                        working.get("criteria", {}).get("city") or ctx.destination
                    )
                    working["criteria"] = {"city": previous_city}
                    for key in ("anchor", "anchor_id", "selected_id", "last_results"):
                        working.pop(key, None)
                    working["last_ids"] = []
                    working["seen_ids"] = []
                report = dialogue.apply_changes(working, parsed.get("changes", []))
                state.clear()
                state.update(working)
            except ValueError:
                route, reason, parsed = "fallback", "invalid_reference", {}
        intent = parsed.get("intent")
        bounded_search = demo_search.understand(request.message, state, ctx.destination)
        if bounded_search and route == "gemini" and intent == "search" and bounded_search.get("filters"):
            # Preserve validated model constraints; enforce additive/dish semantics at execution.
            if bounded_search.get("append") or bounded_search["filters"].get("dish"):
                filters = deepcopy(state.get("criteria", {}))
                if bounded_search["filters"].get("dish"):
                    filters.pop("mix", None)
                    filters["category"] = "food"
                    # A validated model dish must not be replaced by the fallback phrase parser.
                    model_dish = next((c['value'] for c in parsed.get('changes', []) if c['field']=='dish' and c['op']=='set'), None)
                    filters["dish"] = model_dish or bounded_search["filters"]["dish"]
                if bounded_search.get("append"):
                    filters.pop("mix", None)
                    filters["result_count"] = bounded_search["filters"]["result_count"]
                    filters["omit_ids"] = list(dict.fromkeys(filters.get("omit_ids", []) + state.get("seen_ids", [])))
                bounded_search["filters"] = filters
            else:
                # Explicit current quantity wins; model constraints remain authoritative.
                state.setdefault("criteria", {})["result_count"] = bounded_search["filters"].get("result_count", 5)
                if bounded_search["filters"].get("mix"):
                    state["criteria"].pop("category",None)
                    state["criteria"]["mix"] = bounded_search["filters"]["mix"]
                if bounded_search["filters"].get("high_rating"):
                    state["criteria"]["high_rating"] = True
                if bounded_search["filters"].get("mix"):
                    bounded_search["filters"] = deepcopy(state["criteria"])
                else:
                    bounded_search = None
        plan_request = auto_plan.understand(request.message, state)
        if fast == "list_ideas" or intent == "list_ideas":
            result = list_saved_ideas(request,state,ctx)
        elif fast == "explain_green":
            state["topic"] = "green"
            result = reply("Trong GreenTrip, địa điểm ‘green’ là gợi ý có dấu hiệu phù hợp du lịch bền vững trong dữ liệu, như gần gũi thiên nhiên, kinh doanh địa phương hoặc có thuộc tính sinh thái. Đây không phải chứng nhận môi trường. Mức phù hợp còn phụ thuộc thông tin đã có ở từng địa điểm; mình không khẳng định quán xanh chỉ vì có cây hay tên gọi.", ctx, request.mode, prompts=[{"label":"Xem ví dụ ở Huế","message":"Cho mình 2 ví dụ ở Huế"}])
        elif fast == "green_examples":
            count = re.search(r"\b(\d+|mot|hai|ba|bon|nam)\s+(?:vi du|diem|minh hoa)", fold(request.message))
            amount = (int(count[1]) if count[1].isdigit() else {"mot":1,"hai":2,"ba":3,"bon":4,"nam":5}[count[1]]) if count else 3
            if not 1 <= amount <= 50:
                result = reply("Bạn chọn từ 1 đến 50 ví dụ nhé.",ctx,request.mode,prompts=[])
            else:
                result = reply("",ctx,request.mode)
                result.update(demo_search.respond({"filters":{"city":explicit_city(request.message) or state.get("criteria",{}).get("city") or ctx.destination,"green":True,"result_count":amount},"append":False},state,ctx.preferences))
        elif fast == "scoped_simple_edit":
            if state.get("draft") and state["draft"].get("before_digest") != digest(current):
                raise HTTPException(409,"Lịch đã thay đổi ở nơi khác. Bạn tạo lại bản nháp từ lịch mới nhé.")
            spec = scoped_simple_edit(request.message)
            base = (state.get("draft") or {}).get("itinerary") or current
            selected = next((d for d in (base or {}).get("days",[]) if d["day_number"]==spec["day"]),None)
            if not selected:
                result = reply("Chưa có ngày đó trong bản nháp hoặc lịch đang mở. Bạn tạo bản nháp trước nhé.",ctx,request.mode,prompts=[])
            elif "start_after" not in spec:
                n = sum(bool(s.get("poi_id")) for s in selected["stops"])
                if n > 2:
                    ids = [s["poi_id"] for s in selected["stops"] if s.get("poi_id")]
                    after, warnings = create_plan(base,catalogue(ids=ids),target_day=spec["day"],light=True)
                    draft = propose(state,current,after,warnings)
                    result = reply(change_summary(base,after) + " Các ngày khác giữ nguyên.",ctx,request.mode,draft=draft,prompts=[])
                else:
                    result = reply(f"Ngày {spec['day']} hiện có {n} điểm. Bạn muốn bắt đầu muộn hơn hay bớt điểm? Mình giữ nguyên các ngày khác.",ctx,request.mode,prompts=[{"label":f"Bắt đầu ngày {spec['day']} lúc 10h","message":f"Ngày {spec['day']} bắt đầu lúc 10:00, giữ nguyên các ngày khác"}],outcome={"status":"needs_clarification"})
            else:
                try:
                    after, warnings = edit_plan(base,{str(spec["day"]):{"start_after":spec["start_after"]}},[],[],[])
                except HTTPException as error:
                    result = reply(
                        str(error.detail),
                        ctx,
                        request.mode,
                        prompts=[],
                        outcome={"status": "needs_clarification"},
                    )
                else:
                    draft = propose(state,current,after,warnings)
                    result = reply(change_summary(base,after) + " Các ngày khác giữ nguyên; đây vẫn là bản xem trước.",ctx,request.mode,draft=draft,prompts=[],outcome={"status":"complete","changed_day":spec["day"]})
        elif plan_request:
            result = reply("", ctx, request.mode)
            result.update(auto_plan.preview(plan_request, state, ctx, current, request.trip_id, propose))
        elif bounded_search and fast != "whole_trip_plan" and (route != "gemini" or intent == "search" or bounded_search.get("filters", {}).get("dish")):
            result = reply("", ctx, request.mode)
            result.update(demo_search.respond(bounded_search, state, ctx.preferences))
        elif intent in ("greeting", "clarify", "out_of_scope"):
            message = (
                parsed.get("reply")
                or "Bạn muốn tìm địa điểm hay sắp xếp lịch cho chuyến đi này?"
            )
            if any(
                x in fold(message)
                for x in (
                    "da luu",
                    "da ap dung",
                    "da doi",
                    "da cap nhat",
                    "da sap xep",
                    "da them",
                    "da xoa",
                    "da tao lich",
                    "da dieu chinh",
                )
            ):
                message = "Bạn muốn tìm địa điểm hay xem trước một thay đổi lịch trình?"
            result = reply(message, ctx, request.mode)
        elif fast == "greeting":
            result = reply(
                "Chào bạn! Bạn muốn tìm địa điểm hay lên lịch cho chuyến đi?",
                ctx,
                request.mode,
            )
        elif (
            route != "gemini"
            and not fast
            and not any(
                criteria(request.message).get(k)
                for k in (
                    "category",
                    "max_price",
                    "radius_km",
                    "tier",
                    "quiet",
                    "green",
                )
            )
            and not re.search(
                r"\b(?:luu|them|xep lich|len lich|lap lich|tao lich|len ke hoach|ngan sach|ngay\s*\d+)\b",
                fold(request.message),
            )
        ):
            result = reply(
                "Mình chưa hiểu chắc phần muốn điều chỉnh; tiêu chí và bản nháp vẫn được giữ. Bạn muốn sửa tiêu chí nào?",
                ctx,
                request.mode,
            )
        elif (
            route != "gemini"
            and not fast
            and (reason == "invalid_reference" or needs_model(request.message))
        ):
            result = reply(
                (
                    "AI đang tắt nên mình chưa xử lý chắc yêu cầu kết hợp này. Bạn muốn tìm một loại địa điểm trước?"
                    if reason == "ai_disabled"
                    else "Kết nối AI gián đoạn nên mình giữ nguyên tiêu chí và bản nháp. Bạn muốn tìm một loại địa điểm trước?"
                ),
                ctx,
                request.mode,
            )
        else:
            result = handle(
                request, state, ctx, current, parsed if route == "gemini" else {}, user_id=user_id
            )
        if fast != "greeting" and intent != "greeting" and result.get("prompts") == prompts(ctx, request.mode):
            result["prompts"] = []
        summary = dialogue.result_summary(state, report)
        if route == "fallback" and result.get("pois"):
            result["text"] = (
                "AI tạm gián đoạn; dưới đây là các điểm theo bộ lọc đã đọc được.\n"
                + result["text"]
            )
        if summary and result.get("pois"):
            result["text"] = summary + "\n" + result["text"]
        if route == "gemini":
            result["engine"] = "gemini+database"
        result["active_draft_id"] = (state.get("draft") or {}).get("id")
        elapsed_ms = round((perf_counter() - started) * 1000, 2)
        result["trace"] = {
            "route": route,
            "reason": reason,
            "changes": report,
            "elapsed_ms": elapsed_ms,
            "model_calls": model_calls,
            "prompt_version": prompt_version,
            "model": model_name,
        }
        # Whitelisted metadata only; no raw text, IDs, personal context or provider payloads.
        logger.debug(
            "route=%s reason=%s intent=%s changed=%s cleared=%s elapsed_ms=%s model_calls=%s",
            route,
            reason,
            intent or "rules",
            ",".join(report.get("changed", [])),
            ",".join(report.get("cleared", [])),
            elapsed_ms,
            model_calls,
        )
        state["context"] = ctx.model_dump()
        state["trip_id"] = request.trip_id
        state["messages"].extend(
            [
                {"id": str(uuid4()), "role": "user", "text": request.message},
                {"id": str(uuid4()), "role": "assistant", **result},
            ]
        )
        state["messages"] = state["messages"][-80:]
        return result


def handle(request, state, ctx, current, parsed=None, user_id=None):
    parsed = parsed or {}
    intent = parsed.get("intent")
    text = fold(request.message)
    mode = request.mode
    greeting = bool(
        re.fullmatch(r"(?:hello|helo|hi|hey|xin chao|chao|alo)[ !?.]*", text)
    )
    if greeting:
        return reply(
            "Chào bạn! Mình giúp tìm địa điểm hoặc xếp lịch từ Ý tưởng của chuyến đang mở. Bạn muốn bắt đầu với việc nào?",
            ctx,
            mode,
            engine="rules",
        )
    if not (parsed or {}).get("intent") and any(
        x in text
        for x in (
            "lap trinh",
            "python",
            "javascript",
            "chinh tri",
            "bai tap",
            "bitcoin",
            "thoi tiet",
            "du bao mua",
            "dat ve",
            "dat phong",
        )
    ):
        return reply(
            "Mình hỗ trợ tìm địa điểm và lên lịch từ dữ liệu GreenTrip. Bạn muốn khám phá Huế hay Đà Nẵng?",
            ctx,
            mode,
            engine="rules",
        )
    target = reference(request.message, state) if not intent else None
    if parsed.get("reference_index"):
        ids = state.get("last_ids", [])
        index = parsed["reference_index"]
        if index > len(ids):
            return reply(
                "Thẻ được nhắc tới không còn trong danh sách. Bạn chọn lại nhé.",
                ctx,
                mode,
            )
        target = ids[index - 1]
    if request.selected_poi_id:
        shown = {
            str(p["id"])
            for message in state["messages"]
            for p in message.get("pois", [])
        }
        if request.selected_poi_id not in shown:
            raise HTTPException(
                422, "Thẻ này không còn trong hội thoại. Hãy tìm địa điểm lại."
            )
        target = request.selected_poi_id
        state["selected_id"] = target
    if "vua chon" in text:
        target = state.get("selected_id") or target
    wants_save = (
        intent == "save_idea"
        if intent
        else any(x in text for x in ("luu", "them")) and "y tuong" in text
    )
    day_match = re.search(r"ngay\s*(\d+)", text)
    schedule = whole_trip_request(request.message) or any(
        x in text
        for x in (
            "xep lich",
            "len lich",
            "lap lich",
            "tao lich",
            "len ke hoach",
            "nhe hon",
            "thong tha hon",
            "uu tien",
            "lich day",
            "di nhanh",
        )
    ) or ("them" in text and day_match)
    if intent:
        schedule = intent == "plan"
    if wants_save:
        if not request.trip_id:
            return reply("Bạn chọn chuyến muốn lưu Ý tưởng trước nhé.", ctx, mode)
        if not target:
            return reply("Bạn muốn lưu điểm nào trong các thẻ vừa xem?", ctx, mode)
        point = next(
            (p for p in catalogue(ids=[target]) if str(p["id"]) == target), None
        )
        if not point:
            raise HTTPException(404, "Địa điểm không còn trong dữ liệu GreenTrip.")
        if ctx.destination in ("Huế", "Đà Nẵng") and fold(ctx.destination).replace(
            " ", ""
        ) != fold(point.get("city")).replace(" ", ""):
            return reply(
                f"**{point['name']}** thuộc {point.get('city')}; chuyến đang mở là {ctx.destination}. Bạn chọn đúng chuyến trước khi lưu nhé.",
                ctx,
                mode,
            )
        ctx.idea_ids = list(dict.fromkeys([*ctx.idea_ids, target]))
        saved_workspace = workspaces.save_ideas_if_registered(request.trip_id,user_id,[target]) if user_id else None
        workspace_revision=saved_workspace["revision"] if saved_workspace else None
        if saved_workspace:ctx.idea_ids=saved_workspace["ideas"]
        return reply(
            f"Đã lưu **{point['name']}** vào Ý tưởng của chuyến **{ctx.title}**.",
            ctx,
            mode,
            idea_ids=ctx.idea_ids,
            workspace_revision=workspace_revision,
            action="ideas_saved",
        )
    if (
        not intent
        and ("them" in text or "luu" in text)
        and target
        and not wants_save
        and not day_match
    ):
        return reply(
            "Lưu vào Ý tưởng hay thêm vào ngày nào trong lịch?",
            ctx,
            mode,
            prompts=["Lưu chỗ vừa chọn vào Ý tưởng", "Xếp lịch từ Ý tưởng"],
        )
    budget = re.search(
        r"(?:ngan sach|dung|tam)\s*(\d+(?:[.,]\d+)?)\s*(trieu|tr)\b", text
    )
    if (
        parsed.get("budget")
        if intent == "change_budget"
        else budget if not intent else None
    ) and request.trip_id:
        amount = (
            parsed["budget"]
            if intent == "change_budget"
            else float(budget[1].replace(",", ".")) * 1_000_000
        )
        if not math.isfinite(amount) or not 0 < amount <= 1_000_000_000:
            return reply(
                "Ngân sách cần lớn hơn 0 và không quá 1 tỷ đồng. Bạn nhập lại mức tiền nhé.",
                ctx,
                mode,
            )
        draft = propose(state, current, None, [], kind="budget", budget=amount)
        return reply(
            f'Ngân sách: {ctx.budget or "chưa nhập"} → {amount:,.0f} ₫. Bấm Áp dụng nếu bạn muốn đổi ngân sách của chuyến.',
            ctx,
            mode,
            draft=draft,
        )
    if schedule:
        if not request.trip_id:
            return reply(
                "Bạn mở một chuyến đi để mình xếp lịch theo số ngày và Ý tưởng của chuyến đó nhé.",
                ctx,
                mode,
            )
        pending = state.get("draft") or {}
        if pending and pending.get("before_digest") != digest(current):
            return reply(
                "Lịch đã thay đổi ở nơi khác. Bạn tạo lại bản nháp từ lịch mới nhé.",
                ctx,
                mode,
            )
        full_trip = whole_trip_request(request.message)
        before = (
            (current or empty_itinerary(request.trip_id, ctx))
            if full_trip else
            (pending.get("itinerary") or current or empty_itinerary(request.trip_id, ctx))
        )
        if full_trip and current:
            selected_ideas = {str(value) for value in ctx.idea_ids}
            before = deepcopy(before)
            for day in before.get("days", []):
                day["stops"] = [
                    stop
                    for stop in day.get("stops", [])
                    if not stop.get("poi_id")
                    or str(stop["poi_id"]) in selected_ideas
                    or stop.get("source") in {"manual", "idea"}
                ]
        if intent and not full_trip and (
            state.get("plan_base") is not None
            or any(
                set(spec)
                & {"start_after", "meal", "replace_stop", "replacement", "nearer"}
                for spec in state.get("plan_edits", {}).values()
            )
        ):
            if state.get("plan_base_digest", digest(current)) != digest(current):
                for key in ("plan_base", "plan_base_digest", "draft"):
                    state.pop(key, None)
                state["plan_edits"] = {}
                return reply(
                    "Lịch vừa thay đổi. Bạn gửi lại yêu cầu trên lịch mới nhé.",
                    ctx,
                    mode,
                )
            state.setdefault("plan_base", deepcopy(before))
            state.setdefault("plan_base_digest", digest(current))
            ids = list(
                dict.fromkeys(
                    [
                        *ctx.idea_ids,
                        *state.get("last_ids", []),
                        *[
                            s.get("poi_id")
                            for plan in (before, state["plan_base"])
                            for d in plan["days"]
                            for s in d["stops"]
                            if s.get("poi_id")
                        ],
                    ]
                )
            )
            try:
                after, warnings = edit_plan(
                    state["plan_base"],
                    state["plan_edits"],
                    catalogue(ids=ids),
                    [p["id"] for p in state.get("idea_refs", [])],
                    state.get("last_ids", []),
                )
                TripItinerarySyncRequest.model_validate(after)
            except (HTTPException, ValueError) as error:
                # Retain requested edits, but hide any superseded draft until missing details are resolved.
                state["draft"] = None
                return reply(
                    (
                        str(error.detail)
                        if isinstance(error, HTTPException)
                        else "Chưa đủ dữ liệu hợp lệ để xem trước chỉnh sửa."
                    ),
                    ctx,
                    mode,
                )
            draft = propose(state, current, after, warnings)
            return reply(
                change_summary(state["plan_base"], after),
                ctx,
                mode,
                draft=draft,
            )
        ids = list(ctx.idea_ids)
        selected_day = (
            state.get("focused_day")
            if intent
            else int(day_match[1]) if day_match else None
        )
        if full_trip:
            selected_day = None
            state.pop("focused_day", None)
        if target:
            ids.append(target)
        if selected_day and target and not current:
            ids = [target]
        pace = (
            state.get("plan_edits", {})
            .get(str(selected_day or "pending"), {})
            .get("pace")
        )
        light = pace == "light" if intent else "nhe hon" in text or "thong tha" in text
        if selected_day and before:
            selected = next(
                (d for d in before["days"] if d["day_number"] == selected_day), None
            )
            if not selected:
                return reply(
                    "Ngày này nằm ngoài chuyến đi. Bạn chọn lại ngày nhé.", ctx, mode
                )
            ids = [s["poi_id"] for s in selected["stops"] if s.get("poi_id")] + (
                [target] if target else []
            )
        all_points = catalogue(ids=ids)
        points = [p for p in all_points if str(p["id"]) in set(ids)]
        if not points:
            return reply(
                ("Các Ý tưởng đã gửi chưa khớp bản ghi địa điểm hiện có. Mình chưa tạo lịch; bạn kiểm tra lại địa điểm đã lưu nhé." if ids else "Chuyến này chưa có Ý tưởng để xếp. Bạn muốn tìm cà phê hay điểm tham quan trước?"),
                ctx,
                mode,
                outcome={"status":"error" if ids else "needs_clarification","reason":"unresolved_ideas" if ids else "empty_ideas","unresolved_ids":ids},
            )
        if ctx.preferences:
            points = rank(points, ctx.preferences)
        if target and "uu tien" in text:
            points.sort(key=lambda point: str(point["id"]) != target)
        known_prices = [upper_price(point, "person") for point in points]
        budget_travelers = (
            ctx.adult_count
            if ctx.adult_count is not None
            else ctx.people_count
        )
        known_ceiling = sum(price for price in known_prices if price is not None) * budget_travelers
        budget_notes = []
        if ctx.child_count or ctx.infant_count:
            budget_notes.append("Giá trẻ em/trẻ sơ sinh chưa được xác định riêng; ước tính giá vé/người không coi trẻ em và trẻ sơ sinh có cùng mức với người lớn. Thú cưng không được tính là du khách.")
        elif ctx.pet_count:
            budget_notes.append("Thú cưng không được tính là du khách hay một đơn vị vé; phụ phí cho thú cưng chưa được xác định.")
        if ctx.budget is not None:
            if known_ceiling > ctx.budget:
                budget_notes.append(
                    f"Cảnh báo ngân sách mềm: mức giá tham khảo đã biết cho vé/POI khoảng {known_ceiling:,.0f} ₫ / {budget_travelers} người lớn, cao hơn ngân sách chuyến {ctx.budget:,.0f} ₫; hệ thống vẫn giữ các POI đã chọn. Giá trẻ em, ăn, ở và vận chuyển chưa được tính."
                )
            else:
                budget_notes.append(
                    f"Ngân sách mềm tham chiếu {ctx.budget:,.0f} ₫ cho chuyến. Chưa đủ dữ liệu đơn vị giá, ăn/ở và vận chuyển để xác nhận tổng chi phí; hệ thống không dùng ngân sách để loại POI."
                )
        try:
            alternatives = build_alternatives(
                before,
                points,
                target_day=selected_day,
                light=light,
                balance=full_trip,
                fast=(
                    pace == "fast"
                    if intent
                    else "lich day" in text or "di nhanh" in text
                ),
                day_start=ctx.activity_start_time or "09:00",
                day_end=ctx.activity_end_time or "17:00",
            )
        except HTTPException as error:
            return reply(str(error.detail), ctx, mode)
        if not alternatives:
            return reply("Chưa tạo được lịch nháp từ các POI đã chọn. Ý tưởng của bạn vẫn được giữ nguyên.", ctx, mode)
        requested = list(dict.fromkeys(str(value) for value in ids))
        resolved_ids = {str(point["id"]) for point in points}
        unresolved_ids = [value for value in requested if value not in resolved_ids]
        for alternative in alternatives:
            alternative["warnings"] = list(dict.fromkeys(alternative.get("warnings", []) + budget_notes))
            alternative["selected_poi_ids"] = requested
            alternative.setdefault("unscheduled_pois", []).extend(
                {"poi_id": value, "name": value, "reasons": ["POI_NOT_FOUND"], "attempted_days": []}
                for value in unresolved_ids
            )
            if unresolved_ids:
                alternative.setdefault("metrics", {})["selected_poi_count"] = len(requested)
                alternative["feasibility_status"] = "PARTIAL"
                alternative["warnings"].append(
                    f"{len(unresolved_ids)} POI chưa đối chiếu được dữ liệu; các địa điểm này vẫn được giữ trong Ý tưởng."
                )
        after = alternatives[0]["itinerary"]
        warnings = list(dict.fromkeys(alternatives[0].get("warnings", []) + budget_notes))
        state.pop("plan_base", None)
        state.pop("plan_base_digest", None)
        state["plan_edits"] = {}
        draft = propose(
            state, current, after, warnings,
            alternatives=alternatives,
            primary_alternative_id=alternatives[0]["id"],
        )
        requested_set = set(requested)
        used = list(dict.fromkeys(
            str(stop["poi_id"])
            for day in after["days"]
            for stop in day["stops"]
            if stop.get("poi_id") and str(stop["poi_id"]) in requested_set
        ))
        resolved = {str(p["id"]): p for p in points}
        unresolved = [id for id in requested if id not in resolved]
        unscheduled = [id for id in requested if id in resolved and id not in used]
        missing = [resolved[id]["name"] + " (chưa xếp được; xem lý do trong bản nháp)" for id in unscheduled]
        if unresolved:
            missing += [id + " (chưa tải/đối chiếu được bản ghi địa điểm)" for id in unresolved]
        text = f"Mình đã xếp {len(used)} điểm trong {ctx.days_count} ngày. Đây là **bản nháp**, lịch hiện tại chưa thay đổi."
        if missing:
            text += " Chưa xếp được: " + "; ".join(missing) + "."
        return reply(text, ctx, mode, draft=draft,
            outcome={"status":"partial" if missing else "complete","requested_ids":requested,"scheduler_input_ids":[str(p["id"]) for p in points],"used_ids":used,"unresolved_ids":unresolved,"unscheduled_ids":unscheduled},
            prompts=[{"label":f"Chỉnh ngày {day['day_number']}","message":f"Ngày {day['day_number']} nhẹ hơn, giữ nguyên các ngày khác"} for day in after["days"] if any(stop.get("poi_id") for stop in day["stops"])][:3])
    if intent == "compare":
        if not state.get("last_ids"):
            return reply(
                "Mình chưa có danh sách để so sánh. Bạn muốn tìm loại địa điểm nào trước?",
                ctx,
                mode,
            )
        points, unknown, _ = search(
            state.get("criteria", {}),
            ctx.preferences,
            state.get("anchor_id"),
            candidate_ids=state["last_ids"],
        )
        soft = state.get("criteria", {}).get("preferences", {})
        points.sort(key=lambda p: preference_score(p, soft), reverse=True)
        cards = [card(p) for p in points]
        state["last_ids"] = [p["id"] for p in cards]
        state["last_results"] = cards
        if not cards:
            return reply(
                "Các điểm vừa xem chưa khớp đủ điều kiện mới. Các điểm thiếu đơn vị giá không được coi là nằm trong ngân sách.",
                ctx,
                mode,
                unknown_price_pois=[card(p) for p in unknown],
            )
        return reply(
            "So trong các điểm vừa xem; chưa có đo đạc độ ồn hay xác nhận trải nghiệm tại chỗ.\n"
            + "\n".join(
                f"**{p['name']}** — {reason_for(p,state.get('criteria',{}))}"
                for p in points
            ),
            ctx,
            mode,
            pois=cards,
        )
    filters = (
        deepcopy(state.get("criteria", {}))
        if intent
        else criteria(request.message, state.get("criteria"), ctx.destination)
    )
    if not intent:
        filters.pop("_structured", None)
    if not filters.get("city") or filters.get("city") not in (
        "Huế",
        "Đà Nẵng",
        "Đà Nẵng & Huế",
    ):
        return reply(
            "Bạn muốn tìm ở Huế hay Đà Nẵng?",
            ctx,
            mode,
            prompts=["Tìm cà phê ở Huế", "Tìm bảo tàng ở Đà Nẵng"],
        )
    # A follow-up may refine existing criteria. Unrelated questions should not spill a catalogue.
    travel_query = any(
        word in text
        for word in ("tim", "goi y", "tham quan", "kham pha", "di dau", "trai nghiem")
    )
    if (
        not filters.get("category")
        and not filters.get("radius_km")
        and not travel_query
        and not intent
    ):
        return reply(
            "Mình chưa rõ bạn muốn tìm loại địa điểm nào. Bạn chọn cà phê, bảo tàng hay thiên nhiên nhé.",
            ctx,
            mode,
        )
    points, unknown, anchor = search(filters, ctx.preferences, state.get("anchor_id"))
    if filters.get("radius_km") and not anchor:
        return reply(
            "Bạn muốn tìm gần địa điểm nào? Mình cần một mốc trong GreenTrip, chưa tự lấy vị trí của bạn.",
            ctx,
            mode,
        )
    expanded = False
    if (
        not points
        and 0 < filters.get("radius_km", 0) < 3
        and not filters.get("strict_radius")
    ):
        filters["radius_km"] = 3
        points, unknown, anchor = search(
            filters, ctx.preferences, state.get("anchor_id")
        )
        expanded = bool(points)
    state["criteria"] = filters
    if anchor:
        state["anchor_id"] = str(anchor["id"])
        state["anchor"] = {"name": anchor["name"]}
        filters["anchor_name"] = anchor["name"]
    state["last_ids"] = [str(p["id"]) for p in points]
    cards = [card(p) for p in select_results(points, filters)]
    if filters.get("dish"):
        for item in cards:
            item["price_label"] = "Chưa xác nhận giá riêng của món"
    state["last_results"] = cards
    state["seen_ids"] = list(
        dict.fromkeys([*state.get("seen_ids", []), *[p["id"] for p in cards]])
    )[-400:]
    state["last_ids"] = [p["id"] for p in cards]
    if not cards:
        text = "Chưa có địa điểm khớp đủ yêu cầu trong dữ liệu GreenTrip."
        if unknown:
            text += " Các thẻ giá chưa xác định ở dưới không được tính là khớp mức tiền bạn yêu cầu."
        return reply(
            text,
            ctx,
            mode,
            unknown_price_pois=[card(p) for p in unknown],
            prompts=(
                ["Xem trong 3 km"] if filters.get("radius_km") else []
            ),
        )
    heading = (
        "**Gợi ý trong 3 km** (mở rộng từ bán kính mặc định 1 km):\n"
        if expanded
        else f"Mình gợi ý {len(cards)} điểm ở {filters.get('city') or 'khu vực đã chọn'}.\n"
    )
    lines = [
        f"**{p['name']}** — {reason_for(p,filters)}"
        for p in select_results(points, filters)
    ]
    return reply(
        heading
        + (
            f"Có {len(cards)} điểm phù hợp.\n"
            if len(cards) < filters.get("result_count", len(cards))
            else ""
        )
        + "\n".join(lines),
        ctx,
        mode,
        pois=cards,
        unknown_price_pois=[card(p) for p in unknown],
        prompts=(
            [{"label": "Lưu điểm đầu", "message": "Lưu chỗ thứ nhất vào Ý tưởng"}]
            if cards and request.trip_id
            else []
        ),
    )


def history(user_id, trip_id, mode, conversation_id=1):
    owned_itinerary(trip_id, user_id)
    with store.session(user_id, trip_id, mode, conversation_id) as state:
        return {
            "messages": state["messages"],
            "context": state.get("context"),
            "draft": state.get("draft"),
        }


def _stop_locations(itinerary):
    return {
        str(stop.get("stop_id")): (day["day_number"], stop)
        for day in itinerary.get("days", [])
        for stop in day.get("stops", [])
        if stop.get("stop_id")
    }


def _status_by_stop(progress):
    return {item["stopId"]: item for item in progress.get("stops", []) if item.get("stopId")}


def _catalogue_points_for_stops(stops):
    ids = list(dict.fromkeys(str(stop["poi_id"]) for stop in stops if stop.get("poi_id")))
    catalogue_unavailable = False
    try:
        records = catalogue(ids=ids) if ids else []
    except Exception as error:
        # A saved itinerary is still enough to prepare a provisional preview when
        # the catalogue provider is unavailable; missing coordinates stay unknown.
        logger.warning(
            "POI catalogue unavailable during in-trip preview; using saved stop details (%s)",
            type(error).__name__,
        )
        records = []
        catalogue_unavailable = True
    by_id = {str(item.get("id")): item for item in records}
    result = []
    for stop in stops:
        poi_id = str(stop.get("poi_id") or "")
        if not poi_id or poi_id in {str(item.get("id")) for item in result}:
            continue
        item = dict(by_id.get(poi_id) or {})
        item.update({
            "id": poi_id,
            "name": item.get("name") or stop.get("title") or poi_id,
            "city": item.get("city") or stop.get("city"),
            "latitude": item.get("latitude", stop.get("latitude")),
            "longitude": item.get("longitude", stop.get("longitude")),
            "average_visit_minutes": item.get("average_visit_minutes") or stop.get("duration_minutes"),
        })
        result.append(item)
    return result, catalogue_unavailable


def _restore_stop_ids(alternative, before):
    originals = {}
    for day in before.get("days", []):
        for stop in day.get("stops", []):
            if stop.get("poi_id") and stop.get("stop_id"):
                originals.setdefault(str(stop["poi_id"]), []).append(str(stop["stop_id"]))
    for day in alternative.get("itinerary", {}).get("days", []):
        for stop in day.get("stops", []):
            candidates = originals.get(str(stop.get("poi_id")), [])
            if candidates:
                stop["stop_id"] = candidates.pop(0)


def preview_in_trip(user_id, request):
    before = owned_itinerary(request.trip_id, user_id)
    if not before:
        raise HTTPException(404, "Chưa có lịch trình để điều chỉnh.")
    workspace = workspaces.load_if_registered(request.trip_id, user_id)
    if not workspace:
        raise HTTPException(409, "Hãy lưu chuyến đi vào Trip Workspace trước khi cập nhật tiến độ.")
    progress = workspace.get("actualProgress") or {"version": 1, "stops": [], "movements": []}
    try:
        workspaces._validate_actual_progress(progress)
    except ValueError as error:
        raise HTTPException(422, "Tiến độ chuyến đi chưa hợp lệ.") from error
    day = next((item for item in before.get("days", []) if item["day_number"] == request.day_number), None)
    if not day:
        raise HTTPException(422, "Ngày được chọn nằm ngoài chuyến đi.")
    selected_date = day.get("date")
    if not selected_date and before.get("start_date"):
        selected_date = (datetime.fromisoformat(before["start_date"]) + timedelta(days=request.day_number - 1)).date().isoformat()
    if selected_date and selected_date < planning.now_vn().date().isoformat():
        raise HTTPException(422, "Không thể lập lại lịch cho ngày đã qua. Tiến độ tham quan vẫn có thể được cập nhật.")
    by_status = _status_by_stop(progress)
    locations = _stop_locations(before)
    selected = locations.get(request.stop_id) if request.stop_id else None
    if request.stop_id and (not selected or selected[0] != request.day_number):
        raise HTTPException(409, "Điểm dừng đã thay đổi. Tải lại lịch trình rồi thử lại.")

    def eligible(stop):
        status = by_status.get(str(stop.get("stop_id") or ""), {}).get("status", "PLANNED")
        return (
            stop.get("poi_id")
            and stop.get("stop_type", "poi") == "poi"
            and stop.get("source") == "assistant"
            and status not in {"VISITED", "IN_PROGRESS", "SKIPPED"}
        )

    protected_ids = {
        stop_id for stop_id, entry in by_status.items()
        if entry.get("status") in {"VISITED", "IN_PROGRESS"}
    }
    working = deepcopy(before)
    affected = []
    first_day = request.day_number
    minimum_days = {}
    extended = None
    day_start = workspace.get("activityStartTime") or "09:00"
    day_end = workspace.get("activityEndTime") or "17:00"

    if request.action == "end_day_early":
        if request.day_number >= len(before.get("days", [])):
            raise HTTPException(422, "Đây là ngày cuối chuyến; không có ngày khác để dời các điểm còn lại.")
        affected = [stop for stop in day.get("stops", []) if eligible(stop)]
        first_day = request.day_number + 1
    elif request.action == "postpone":
        stop = selected[1]
        if not eligible(stop):
            raise HTTPException(422, "Chỉ có thể dời một điểm chưa hoàn tất do trợ lý xếp lịch.")
        if request.day_number >= len(before.get("days", [])):
            raise HTTPException(422, "Đây là ngày cuối chuyến; không còn ngày để dời điểm này.")
        affected = [stop]
        minimum_days[str(stop["poi_id"])] = request.day_number + 1
    else:
        stop = selected[1]
        status = by_status.get(request.stop_id, {}).get("status", "PLANNED")
        if status != "IN_PROGRESS":
            raise HTTPException(422, "Hãy đánh dấu điểm đang tham quan trước khi kéo dài thời gian.")
        stop_day = next(item for item in working["days"] if item["day_number"] == request.day_number)
        active = next(item for item in stop_day["stops"] if item.get("stop_id") == request.stop_id)
        old_end = active.get("end_time")
        if not active.get("start_time") or not old_end:
            raise HTTPException(422, "Điểm đang tham quan chưa có giờ kết thúc dự kiến để điều chỉnh.")
        old_end_minutes = planning.minute(old_end)
        new_end_minutes = old_end_minutes + request.extra_minutes
        if new_end_minutes > 23 * 60 + 59:
            raise HTTPException(422, "Thời lượng bổ sung vượt quá cuối ngày.")
        active["duration_minutes"] = int(active.get("duration_minutes") or old_end_minutes - planning.minute(active["start_time"])) + request.extra_minutes
        active["end_time"] = planning.clock(new_end_minutes)
        extended = {"stop_id": request.stop_id, "extra_minutes": request.extra_minutes}
        current = planning.now_vn()
        current_minutes = current.hour * 60 + current.minute
        earliest_start = ((current_minutes + 14) // 15) * 15
        day_start = planning.clock(max(planning.minute(day_start), earliest_start, new_end_minutes))
        day_stops = day.get("stops", [])
        active_index = next(index for index, item in enumerate(day_stops) if item.get("stop_id") == request.stop_id)
        affected = [item for item in day_stops[active_index + 1:] if eligible(item)]

    if not affected:
        raise HTTPException(422, "Không còn điểm tham quan phù hợp để điều chỉnh trong ngày đã chọn.")
    points, catalogue_unavailable = _catalogue_points_for_stops(affected)
    point_ids = {str(point["id"]) for point in points}
    affected = [stop for stop in affected if str(stop.get("poi_id")) in point_ids]
    if not affected:
        raise HTTPException(422, "Không tìm thấy dữ liệu địa điểm để lập bản xem trước.")
    point_ids = {str(stop["poi_id"]) for stop in affected}
    minimum_days = {key: value for key, value in minimum_days.items() if key in point_ids}

    alternatives = planning.build_alternatives(
        working,
        points,
        ignore_elapsed_clock=True,
        protected_stop_ids=protected_ids,
        first_day=first_day,
        minimum_day_by_poi=minimum_days,
        day_start=day_start,
        day_end=day_end,
    )
    if not alternatives:
        raise HTTPException(422, "Chưa tạo được phương án điều chỉnh an toàn.")
    for alternative in alternatives:
        _restore_stop_ids(alternative, before)
    affected_stop_ids = {str(stop["stop_id"]) for stop in affected}
    fixed_remaining = [
        stop for stop in day.get("stops", [])
        if str(stop.get("stop_id") or "") not in affected_stop_ids
        and stop.get("source") in {"manual", "idea"}
        and by_status.get(str(stop.get("stop_id") or ""), {}).get("status") not in {"VISITED", "SKIPPED"}
    ]
    warnings = list(dict.fromkeys(
        [warning for alternative in alternatives for warning in alternative.get("warnings", [])]
        + ["Địa điểm đã tham quan hoặc đang tham quan được giữ nguyên theo xác nhận của bạn.",
           "Khách sạn và phương tiện đã chọn không bị thay đổi; hãy xem lại nếu chặng mới khác."]
        + (["Không tải được dữ liệu POI mới; bản xem trước dùng thông tin đã lưu, các tuyến thiếu tọa độ vẫn chưa xác định."] if catalogue_unavailable else [])
        + ([f"{len(fixed_remaining)} điểm được thêm thủ công hoặc từ Ý tưởng được giữ nguyên theo lịch đã xác nhận; hãy kiểm tra chúng riêng." ] if fixed_remaining else [])
    ))
    meta = {
        "action": request.action,
        "day_number": request.day_number,
        "affected_stop_ids": [str(stop["stop_id"]) for stop in affected],
        "locked_stop_ids": sorted(protected_ids),
        "fixed_stop_ids": sorted(
            str(stop["stop_id"])
            for item in before.get("days", [])
            for stop in item.get("stops", [])
            if stop.get("stop_id") and stop.get("source") in {"manual", "idea"}
        ),
        "workspace_revision": workspace.get("workspaceRevision"),
        "extended_stop": extended,
        "progress_snapshot": progress,
    }
    with store.session(user_id, request.trip_id, "planner", 1) as state:
        draft = propose(
            state,
            before,
            alternatives[0]["itinerary"],
            warnings,
            alternatives=alternatives,
            in_trip=meta,
        )
        return {"draft": draft, "workspace_revision": workspace.get("workspaceRevision")}


def _validate_in_trip_locked_stops(before, after, meta):
    before_locations = _stop_locations(before)
    after_locations = _stop_locations(after)
    extended_id = (meta.get("extended_stop") or {}).get("stop_id")
    for stop_id in meta.get("locked_stop_ids", []):
        old = before_locations.get(stop_id)
        new = after_locations.get(stop_id)
        if not old or not new or old[0] != new[0]:
            raise HTTPException(409, "Một điểm đã xác nhận không còn nguyên vị trí. Tạo lại bản xem trước.")
        if stop_id == extended_id:
            old_stop, new_stop = old[1], new[1]
            if any(old_stop.get(key) != new_stop.get(key) for key in ("poi_id", "start_time", "source")):
                raise HTTPException(409, "Điểm đang tham quan đã thay đổi. Tạo lại bản xem trước.")
            if new_stop.get("duration_minutes", 0) < old_stop.get("duration_minutes", 0) or planning.minute(new_stop.get("end_time", "00:00")) <= planning.minute(old_stop.get("end_time", "00:00")):
                raise HTTPException(409, "Thời lượng đang tham quan chưa được kéo dài đúng yêu cầu.")
        elif any(old[1].get(key) != new[1].get(key) for key in ("poi_id", "title", "start_time", "end_time", "duration_minutes", "source")):
            raise HTTPException(409, "Một điểm đã tham quan hoặc đang tham quan đã bị thay đổi.")
    for stop_id in meta.get("fixed_stop_ids", []):
        old = before_locations.get(stop_id)
        new = after_locations.get(stop_id)
        if not old or not new or old[0] != new[0] or any(
            old[1].get(key) != new[1].get(key)
            for key in ("poi_id", "title", "start_time", "end_time", "duration_minutes", "source", "stop_type")
        ):
            raise HTTPException(409, "Một điểm được giữ cố định đã thay đổi. Tạo lại bản xem trước.")


def _progress_after_in_trip_apply(progress, before, after, meta, alternative):
    result = deepcopy(progress)
    result.setdefault("version", 1)
    result.setdefault("stops", [])
    result.setdefault("movements", [])
    entries = _status_by_stop(result)
    before_locations = _stop_locations(before)
    after_locations = _stop_locations(after)
    unscheduled = {str(item.get("poi_id")): item for item in alternative.get("unscheduled_pois", [])}
    changed_at = datetime.now(timezone.utc).isoformat()
    for stop_id in meta.get("affected_stop_ids", []):
        old = before_locations.get(stop_id)
        if not old:
            continue
        old_day, old_stop = old
        entry = entries.get(stop_id)
        if entry is None:
            entry = {"stopId": stop_id, "status": "PLANNED", "statusUpdatedAt": changed_at}
            result["stops"].append(entry)
            entries[stop_id] = entry
        entry["poiId"] = str(old_stop.get("poi_id")) if old_stop.get("poi_id") else None
        entry["name"] = old_stop.get("title") or str(old_stop.get("poi_id") or "")
        moved = after_locations.get(stop_id)
        if moved is None:
            item = unscheduled.get(str(old_stop.get("poi_id")), {})
            entry["status"] = "UNSCHEDULED"
            entry["reasonCodes"] = item.get("reasons", ["NO_FEASIBLE_SLOT_FOUND"])
            entry["statusUpdatedAt"] = changed_at
        elif moved[0] != old_day:
            entry["status"] = "POSTPONED"
            entry["reasonCodes"] = []
            entry["statusUpdatedAt"] = changed_at
            result["movements"].append({"stopId": stop_id, "fromDay": old_day, "toDay": moved[0], "changedAt": changed_at})
    result["movements"] = result["movements"][-500:]
    return result


def reconcile_in_trip_apply(user_id, trip_id):
    """Reconcile a durable cross-store intent against the currently saved plan."""
    pending = workspaces.pending_in_trip_apply(trip_id, user_id)
    current = owned_itinerary(trip_id, user_id)
    if current is None:
        raise HTTPException(404, "No saved itinerary exists for this trip.")
    if not pending:
        workspace = workspaces.load_if_registered(trip_id, user_id) or {}
        return {
            "status": "CLEAN",
            "itinerary": current,
            "actual_progress": workspace.get("actualProgress"),
            "workspace_revision": workspace.get("workspaceRevision"),
        }
    resolution = workspaces.reconcile_in_trip_apply(
        trip_id,
        user_id,
        pending["operation_id"],
        itinerary_content_digest(current),
        str(current.get("updated_at") or ""),
    )
    if resolution["status"] == "CONFLICT":
        raise HTTPException(
            409,
            {
                "code": "IN_TRIP_RECONCILIATION_REQUIRED",
                "message": "The current itinerary matches neither side of the pending apply. Keep both stores unchanged and resolve manually.",
            },
        )
    return {
        "status": resolution["status"],
        "itinerary": current,
        "actual_progress": resolution.get("actualProgress"),
        "workspace_revision": resolution.get("workspaceRevision"),
    }


def apply(user_id, request):
    before = owned_itinerary(request.trip_id, user_id)
    with store.session(user_id, request.trip_id, request.mode, request.conversation_id) as state:
        draft = state.get("draft")
        if not draft or draft["id"] != request.draft_id:
            raise HTTPException(
                409,
                "Bản nháp đã thay đổi hoặc được áp dụng. Hãy tạo lại bản xem trước.",
            )
        if digest(before) != draft["before_digest"]:
            raise HTTPException(
                409, "Lịch đã được sửa ở nơi khác. Hãy tạo lại bản nháp từ lịch mới."
            )
        in_trip = draft.get("in_trip")
        workspace = None
        if in_trip:
            workspace = workspaces.load_if_registered(request.trip_id, user_id)
            if not workspace or workspace.get("workspaceRevision") != in_trip.get("workspace_revision"):
                raise HTTPException(409, "Tiến độ chuyến đi đã thay đổi. Tải lại rồi tạo bản xem trước mới.")
        if draft["kind"] == "budget":
            state.setdefault("context", {})["budget"] = draft["budget"]
            state["draft"] = None
            state["messages"].append(
                {
                    "id": str(uuid4()),
                    "role": "assistant",
                    "text": "Đã cập nhật ngân sách của chuyến.",
                    "action": "budget_saved",
                }
            )
            state["messages"] = state["messages"][-80:]
            return {
                "text": "Đã cập nhật ngân sách của chuyến.",
                "budget": draft["budget"],
                "action": "budget_saved",
            }
        after = draft["itinerary"]
        selected_alternative = None
        alternative_id = request.alternative_id
        if alternative_id:
            alternatives = draft.get("alternatives") or []
            selected = next((item for item in alternatives if item.get("id") == alternative_id), None)
            if selected is None:
                raise HTTPException(409, "Phương án đã chọn không còn trong bản nháp. Hãy tạo lại lịch xem trước.")
            after = selected.get("itinerary")
            selected_alternative = selected
            if not after:
                raise HTTPException(409, "Phương án không còn dữ liệu lịch trình. Hãy tạo lại lịch xem trước.")
        validate_past(before or {"days": []}, after, ignore_elapsed=bool(in_trip))
        if in_trip:
            _validate_in_trip_locked_stops(before, after, in_trip)
        payload = TripItinerarySyncRequest.model_validate(after)
        updated_workspace = None
        result_itinerary = None
        operation_id = None
        target_progress = None
        if in_trip:
            target_progress = _progress_after_in_trip_apply(
                workspace.get("actualProgress") or {"version": 1, "stops": [], "movements": []},
                before,
                after,
                in_trip,
                selected_alternative or (draft.get("alternatives") or [{}])[0],
            )
            chosen = selected_alternative or (draft.get("alternatives") or [{}])[0]
            choice_id = str(chosen.get("id") or "primary")
            operation_id = str(uuid5(
                NAMESPACE_URL,
                f"greentrip-in-trip:{request.trip_id}:{draft['id']}:{choice_id}",
            ))
            operation = {
                "operation_id": operation_id,
                "before_digest": itinerary_content_digest(before),
                "after_digest": itinerary_content_digest(payload.model_dump(mode="json")),
                "base_updated_at": str(before.get("updated_at") or ""),
                "target_progress": target_progress,
            }
            workspaces.begin_in_trip_apply(
                request.trip_id,
                user_id,
                operation,
                in_trip.get("workspace_revision"),
            )

        try:
            result = save_itinerary(
                payload,
                user_id,
                expected_updated_at=(before.get("updated_at") if before else "__missing__"),
            )
            result_itinerary = result.model_dump(mode="json")
            if in_trip:
                resolution = workspaces.reconcile_in_trip_apply(
                    request.trip_id,
                    user_id,
                    operation_id,
                    itinerary_content_digest(result_itinerary),
                    str(result.updated_at),
                )
                if resolution["status"] != "APPLIED":
                    raise HTTPException(
                        409,
                        {
                            "code": "IN_TRIP_RECONCILIATION_REQUIRED",
                            "message": "The itinerary was saved but progress still needs reconciliation.",
                        },
                    )
                updated_workspace = {
                    "actualProgress": resolution.get("actualProgress"),
                    "workspaceRevision": resolution.get("workspaceRevision"),
                }
        except Exception as write_error:
            if not in_trip:
                raise
            try:
                resolution = reconcile_in_trip_apply(user_id, request.trip_id)
            except Exception as recovery_error:
                raise HTTPException(
                    409,
                    {
                        "code": "IN_TRIP_RECONCILIATION_REQUIRED",
                        "message": "The apply outcome could not be verified. The durable intent is retained for recovery.",
                    },
                ) from recovery_error
            if resolution["status"] == "APPLIED":
                result_itinerary = resolution["itinerary"]
                updated_workspace = {
                    "actualProgress": resolution.get("actual_progress"),
                    "workspaceRevision": resolution.get("workspace_revision"),
                }
            elif resolution["status"] == "NOT_APPLIED":
                if isinstance(write_error, HTTPException):
                    raise write_error
                raise HTTPException(503, "The itinerary was not saved; the pending apply was safely cancelled.") from write_error
            else:
                raise HTTPException(
                    409,
                    {
                        "code": "IN_TRIP_RECONCILIATION_REQUIRED",
                        "message": "The current itinerary matches neither side of the pending apply. Keep both stores unchanged and resolve manually.",
                    },
                ) from write_error
        state["draft"] = None
        state.pop("plan_base", None)
        state.pop("plan_base_digest", None)
        state["plan_edits"] = {}
        state["messages"].append(
            {
                "id": str(uuid4()),
                "role": "assistant",
                "text": "Đã áp dụng lịch trình vào chuyến đi.",
                "action": "itinerary_saved",
            }
        )
        state["messages"] = state["messages"][-80:]
        return {
            "text": "Đã áp dụng lịch trình vào chuyến đi.",
            "itinerary": result_itinerary,
            "action": "itinerary_saved",
            **({"actual_progress": updated_workspace.get("actualProgress"), "workspace_revision": updated_workspace.get("workspaceRevision")} if updated_workspace else {}),
        }



def conversations(user_id,trip_id,mode):
    owned_itinerary(trip_id,user_id)
    items=[]
    for slot in (1,2,3):
        with store.session(user_id,trip_id,mode,slot) as state:
            first=next((m.get("text","").strip() for m in state["messages"] if m.get("role")=="user"),None)
            if first:items.append({"id":slot,"title":" ".join(first.split())[:55],"message_count":len(state["messages"])})
    return {"items":items}
