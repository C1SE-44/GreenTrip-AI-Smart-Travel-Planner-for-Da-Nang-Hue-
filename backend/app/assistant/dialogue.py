"""Validated conversational deltas and compact, account-scoped working memory."""

from copy import deepcopy
from typing import Literal
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    TypeAdapter,
    model_validator,
)
from app.assistant import search

Category = Literal["cafe", "museum", "church", "temple", "spiritual", "nature", "food"]
City = Literal["Huế", "Đà Nẵng", "Đà Nẵng & Huế"]


class Nearby(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=2, max_length=120)
    radius_km: float | None = Field(default=None, gt=0, le=50)
    strict: bool | None = None


class Replacement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source: Literal["results", "ideas"]
    index: int = Field(ge=1, le=20)


class Change(BaseModel):
    model_config = ConfigDict(extra="forbid")
    field: Literal[
        "city",
        "category",
        "dish",
        "max_price",
        "price_unit",
        "quiet",
        "green",
        "local",
        "nearby",
        "count",
        "mix",
        "must_try",
        "ambience",
        "places",
        "day",
        "start_after",
        "meal",
        "replace_stop",
        "replacement",
        "nearer",
        "pace",
    ]
    op: Literal["keep", "set", "clear", "prefer", "exclude"]
    value: JsonValue = None

    @model_validator(mode="after")
    def validate_value(self):
        if self.op == "keep" and self.field == "meal" and self.value in (None, "lunch"):
            self.value = "lunch"
            return self
        if self.op in ("keep", "clear"):
            if self.value is not None:
                raise ValueError("keep/clear must have no value")
            return self
        if self.field == "dish" and (not isinstance(self.value, str) or not 2 <= len(self.value.strip()) <= 100):
            raise ValueError("dish must be a bounded nonempty name")
        if self.op == "exclude" and self.field not in ("category", "city", "places"):
            raise ValueError("This field cannot be excluded")
        if self.op == "prefer" and self.field not in (
            "quiet",
            "green",
            "local",
            "nearer",
            "must_try",
            "ambience",
            "start_after",
            "pace",
        ):
            raise ValueError("This field cannot be a preference")
        adapters = {
            "city": City,
            "category": Category,
            "dish": str,
            "max_price": float,
            "price_unit": Literal["item", "person"],
            "quiet": bool,
            "green": bool,
            "local": bool,
            "nearer": bool,
            "count": int,
            "must_try": bool,
            "ambience": Literal["quiet", "conversation"],
            "day": int,
            "start_after": str,
            "meal": Literal["lunch"],
            "replace_stop": Literal["first", "last"],
            "pace": Literal["normal", "light", "fast"],
        }
        if self.field in adapters:
            value = TypeAdapter(adapters[self.field]).validate_python(
                self.value, strict=True
            )
            if self.field == "count" and not 1 <= value <= 50:
                raise ValueError("count must be 1..50")
            if self.field == "day" and not 1 <= value <= 31:
                raise ValueError("day must be 1..31")
            if self.field == "max_price" and not 0 <= value <= 10_000_000:
                raise ValueError("invalid price")
            if self.field == "start_after":
                if not (self.op == "prefer" and value == "later"):
                    import re

                    if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value):
                        raise ValueError("invalid time")
        elif self.field == "nearby":
            value = Nearby.model_validate(self.value).model_dump(exclude_none=True)
            if not value:
                raise ValueError("nearby needs a landmark or radius")
        elif self.field == "replacement":
            value = Replacement.model_validate(self.value).model_dump()
        elif self.field == "mix":
            value = TypeAdapter(dict[str, int]).validate_python(self.value, strict=True)
            if (
                not value
                or any(
                    k
                    not in (
                        "cafe",
                        "museum",
                        "church",
                        "temple",
                        "spiritual",
                        "nature",
                        "food",
                        "other",
                    )
                    or not 0 <= v <= 50
                    for k, v in value.items()
                )
                or not 1 <= sum(value.values()) <= 50
            ):
                raise ValueError("invalid mix")
        elif self.field == "places":
            value = self.value
            if value != "shown":
                value = TypeAdapter(list[int]).validate_python(value, strict=True)
                if not value or any(not 1 <= i <= 5 for i in value):
                    raise ValueError("invalid card references")
            if self.op != "exclude":
                raise ValueError("places needs exclude or clear")
        self.value = value
        return self


class Turn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    intent: Literal[
        "greeting",
        "clarify",
        "search",
        "compare",
        "plan",
        "save_idea",
        "list_ideas",
        "change_budget",
        "out_of_scope",
    ]
    reply: str = Field(default="", max_length=400)
    changes: list[Change] = Field(default_factory=list, max_length=16)
    search_scope: Literal["refine", "new"] = "refine"
    reference_index: int | None = Field(default=None, ge=1, le=5)
    budget: float | None = Field(default=None, gt=0, le=1_000_000_000)


PLAN_FIELDS = {"start_after", "meal", "replace_stop", "replacement", "nearer", "pace"}


def wire_schema():
    """Bounded JSON grammar for the provider; semantic validation still runs locally."""
    schema = Turn.model_json_schema()
    change = schema["$defs"]["Change"]
    change["required"] = ["field", "op", "value"]
    change["properties"]["value"] = {
        "anyOf": [
            {"type": "null"},
            {"type": "string"},
            {"type": "number"},
            {"type": "boolean"},
            {"type": "array", "items": {"type": "integer"}},
            {"type": "object", "additionalProperties": True},
        ]
    }
    schema["properties"]["changes"]["items"] = change
    schema["required"] = ["intent", "changes"]
    schema.pop("$defs")

    # Provider grammar size grows rapidly with optional object keys and bounded arrays.
    # Local Change validation enforces these limits and the meaning of each field.
    def simplify(node):
        if isinstance(node, dict):
            for key in (
                "default",
                "maxItems",
                "minItems",
                "maximum",
                "minimum",
                "exclusiveMinimum",
                "maxLength",
                "minLength",
                "title",
            ):
                node.pop(key, None)
            for value in node.values():
                simplify(value)
        elif isinstance(node, list):
            for value in node:
                simplify(value)

    simplify(schema)
    return schema


def upgrade(parsed):
    """Read old mocked/in-flight turn shapes; live model protocol uses deltas only."""
    if not parsed or parsed.get("_model_status"):
        return parsed
    if "changes" in parsed:
        return Turn.model_validate(parsed).model_dump(exclude_none=True)
    changes = []
    for old, field in (
        ("city", "city"),
        ("category", "category"),
        ("max_price", "max_price"),
        ("quiet", "quiet"),
        ("green", "green"),
        ("day", "day"),
    ):
        if parsed.get(old) is not None:
            changes.append({"field": field, "op": "set", "value": parsed[old]})
    if parsed.get("pace") and parsed["pace"] != "normal":
        changes.append({"field": "pace", "op": "set", "value": parsed["pace"]})
    if parsed.get("exclude_previous"):
        changes.append({"field": "places", "op": "exclude", "value": "shown"})
    return Turn(
        intent=parsed["intent"],
        reply=parsed.get("reply", ""),
        changes=changes,
        reference_index=parsed.get("reference_index"),
        budget=parsed.get("budget"),
    ).model_dump(exclude_none=True)


def apply_changes(state, changes):
    changes = [Change.model_validate(c) for c in changes]
    filters = state.setdefault("criteria", {})
    before = deepcopy(filters)
    changed = []
    cleared = []
    preferred = []
    excluded = []
    explicit_kept = []
    # Resolve a day before applying edits, regardless of the model's field order.
    for change in changes:
        if change.field == "day":
            if change.op == "set":
                state["focused_day"] = change.value
            elif change.op == "clear":
                state.pop("focused_day", None)
    day = str(state.get("focused_day") or "pending")
    edits = state.setdefault("plan_edits", {})
    if day != "pending" and "pending" in edits:
        edits.setdefault(day, {}).update(edits.pop("pending"))
    for change in changes:
        field, op, value = change.field, change.op, change.value
        if op == "keep" and field != "meal":
            continue
        if field == "day":
            (cleared if op == "clear" else changed).append(field)
            continue
        if field in PLAN_FIELDS:
            spec = edits.setdefault(day, {})
            if op == "clear":
                spec.pop(field, None)
                if field == "replace_stop":
                    for key in ("replacement", "_replacement_id"):
                        spec.pop(key, None)
                cleared.append(field)
            else:
                spec[field] = value
                if field in ("replace_stop", "replacement", "nearer"):
                    spec.pop("_replacement_id", None)
                (explicit_kept if op == "keep" else changed).append(field)
            continue
        if field == "nearby":
            if op == "clear":
                for key in ("anchor_id", "anchor"):
                    state.pop(key, None)
                for key in ("anchor_name", "radius_km", "strict_radius"):
                    filters.pop(key, None)
                cleared.append(field)
            else:
                if value.get("name"):
                    filters["anchor_name"] = value["name"]
                    state.pop("anchor_id", None)
                    state.pop("anchor", None)
                filters["radius_km"] = value.get(
                    "radius_km", filters.get("radius_km", 1)
                )
                if "strict" in value:
                    filters["strict_radius"] = value["strict"]
                changed.append(field)
            continue
        if field == "places":
            if op == "clear":
                filters.pop("omit_ids", None)
                cleared.append(field)
            else:
                ids = state.get("last_ids", [])
                if value == "shown":
                    selected = state.get("seen_ids", ids)
                else:
                    if any(index > len(ids) for index in value):
                        raise ValueError("card reference is no longer available")
                    selected = [ids[index - 1] for index in value]
                filters["omit_ids"] = list(
                    dict.fromkeys([*filters.get("omit_ids", []), *selected])
                )[-400:]
                excluded.append(field)
            continue
        key = {"count": "result_count"}.get(field, field)
        if op == "clear":
            filters.pop(key, None)
            filters.get("preferences", {}).pop(field, None)
            if field in ("category", "city"):
                filters.pop("excluded_" + field, None)
            cleared.append(field)
        elif op == "exclude":
            filters.setdefault("excluded_" + field, [])
            if value not in filters["excluded_" + field]:
                filters["excluded_" + field].append(value)
            if filters.get(field) == value:
                filters.pop(field, None)
            if field == "category":
                if filters.pop("mix", None):
                    cleared.append("mix")
            excluded.append(field)
        elif op == "prefer":
            filters.setdefault("preferences", {})[field] = value
            preferred.append(field)
        else:
            if (
                field == "city"
                and value != filters.get("city")
                and not any(c.field == "nearby" and c.op == "set" for c in changes)
            ):
                for item in ("anchor_name", "radius_km", "strict_radius", "query"):
                    filters.pop(item, None)
                for item in ("anchor", "anchor_id"):
                    state.pop(item, None)
            filters[key] = value
            changed.append(field)
            if field == "mix":
                if filters.pop("category", None):
                    cleared.append("category")
            if field == "category":
                filters.pop("mix", None)
                filters.pop("excluded_category", None)
            if field == "city":
                filters.pop("excluded_city", None)
    filters["_structured"] = True
    kept = [
        key
        for key, value in before.items()
        if key in filters
        and filters[key] == value
        and not key.startswith("_")
        and key not in ("query", "omit_ids")
    ]
    return {
        "kept": kept + explicit_kept,
        "changed": changed,
        "cleared": cleared,
        "preferred": preferred,
        "excluded": excluded,
    }


def signature(state):
    return {
        key: deepcopy(state.get(key))
        for key in ("criteria", "last_ids", "anchor_id", "focused_day", "plan_edits")
    } | {"draft_id": (state.get("draft") or {}).get("id")}


def compact(state, context, current, getter):
    cards = state.get("last_results")
    if cards is None:
        cards = next(
            (
                m.get("pois", [])
                for m in reversed(state.get("messages", []))
                if m.get("pois")
            ),
            [],
        )
    filters = {
        key: value
        for key, value in state.get("criteria", {}).items()
        if key not in ("query", "omit_ids", "_structured")
    }
    result_refs = [
        {
            "index": i + 1,
            **{
                k: p.get(k)
                for k in ("name", "city", "category", "price_label", "evidence")
                if p.get(k) is not None
            },
        }
        for i, p in enumerate(cards[:5])
    ]
    day = state.get("focused_day")
    plan = (state.get("draft") or {}).get("itinerary") or current
    selected = next(
        (d for d in (plan or {}).get("days", []) if d["day_number"] == day), None
    )
    ids = context.idea_ids[:20]
    if ids and state.get("idea_ref_ids") != ids:
        points = {str(p["id"]): p for p in getter(ids=ids)}
        state["idea_ref_ids"] = ids
        state["idea_refs"] = [
            {"id": id, "name": points[id]["name"], "city": points[id].get("city")}
            for id in ids
            if id in points
        ]
    return {
        "destination": context.destination,
        "days_count": context.days_count,
        "people_count": context.people_count,
        "budget": context.budget,
        "saved_ideas_count": len(context.idea_ids),
        "filters": filters,
        "result_refs": result_refs,
        "anchor": (state.get("anchor") or {}).get("name"),
        "focused_day": day,
        "pending_plan": {
            k: v
            for k, v in state.get("plan_edits", {})
            .get(str(day or "pending"), {})
            .items()
            if not k.startswith("_")
        },
        "draft_active": bool(state.get("draft")),
        "day_stops": [
            {
                "position": i + 1,
                **{
                    k: s.get(k)
                    for k in ("title", "stop_type", "start_time", "end_time")
                },
            }
            for i, s in enumerate((selected or {}).get("stops", [])[:10])
        ],
        "idea_refs": (
            [
                {"index": i + 1, "name": p["name"], "city": p.get("city")}
                for i, p in enumerate(state.get("idea_refs", [])[:20])
            ]
            if ids
            else []
        ),
    }


def result_summary(state, changes):
    labels = {
        "city": "khu vực",
        "category": "loại địa điểm",
        "max_price": "mức giá",
        "nearby": "mốc gần và bán kính",
        "count": "số điểm",
        "mix": "cơ cấu nhóm điểm",
        "quiet": "yên tĩnh",
        "ambience": "không gian phù hợp",
        "local": "quán địa phương",
        "nearer": "khoảng cách gần hơn",
        "must_try": "điểm đáng ghé theo đánh giá",
        "green": "trải nghiệm xanh",
        "price_unit": "đơn vị giá",
        "places": "địa điểm",
        "day": "ngày đang chỉnh",
        "start_after": "giờ bắt đầu",
        "meal": "ăn trưa",
        "replace_stop": "điểm thay thế",
    }
    parts = []
    if changes.get("cleared"):
        parts.append(
            "Bỏ "
            + ", ".join(labels.get(k, k) for k in dict.fromkeys(changes["cleared"]))
        )
    if changes.get("excluded"):
        parts.append(
            "Loại trừ "
            + ", ".join(labels.get(k, k) for k in dict.fromkeys(changes["excluded"]))
        )
    if changes.get("preferred"):
        parts.append(
            "Ưu tiên "
            + ", ".join(labels.get(k, k) for k in dict.fromkeys(changes["preferred"]))
        )
    filters = state.get("criteria", {})
    if parts:
        kept = []
        if filters.get("city"):
            kept.append(filters["city"])
        if filters.get("max_price") is not None:
            kept.append(f"giá không quá {filters['max_price']:,.0f} ₫")
        if kept:
            parts.append("Giữ " + ", ".join(kept))
    return ". ".join(parts) + "." if parts else ""
