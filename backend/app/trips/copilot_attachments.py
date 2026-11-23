"""Multimodal attachment analyzer for GreenTrip Copilot ('+' Upload file / Add link / Add receipt)."""
from __future__ import annotations

import base64
import html
import ipaddress
import json
import logging
import re
import socket
from typing import Any
from urllib.parse import unquote, urlparse

import httpx
from psycopg import Connection

from app.config import get_settings
from app.trips.copilot_consultant import finalize_copilot_response
from app.trips.copilot_enrichment import (
    DEFAULT_POI_COORDS_KB,
    build_kg_explanation_for_poi,
    format_three_layer_poi_bullet,
    resolve_poi_coordinates,
)
from app.trips.copilot_intent import extract_persistent_constraints
from app.trips.copilot_mutation import _insert_landmark_into_day
from app.trips.handlers.swap_meal_handler import format_green_score
from app.trips.schemas import (
    CopilotAttachmentPayload,
    CopilotChatRequest,
    CopilotChatResponse,
    CopilotSuggestedPoiItem,
    TripContextPayload,
)
from app.trips.text_utils import strip_vietnamese_accents

logger = logging.getLogger(__name__)

_CODE_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$")
_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
_META_TAG_RE = re.compile(r"<meta\s+[^>]*>", re.IGNORECASE)
_ATTR_RE = re.compile(r'([a-zA-Z0-9_:-]+)\s*=\s*(?:"([^"]*)"|\'([^\']*)\')')
_SCRIPT_STYLE_RE = re.compile(r"<(script|style|noscript)[^>]*>.*?</\1>", re.IGNORECASE | re.DOTALL)
_HTML_TAG_RE = re.compile(r"<[^>]+>")
_ALLOWED_IMAGE_MIMES = frozenset({"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "application/pdf"})


def detect_link_platform(url: str) -> str:
    """Identify the social/content platform for a shared travel URL."""
    host = (urlparse(url).hostname or "").lower()
    if any(k in host for k in ("youtube.com", "youtu.be")):
        return "YouTube"
    if "tiktok.com" in host:
        return "TikTok"
    if "instagram.com" in host:
        return "Instagram"
    if any(k in host for k in ("facebook.com", "fb.watch", "fb.com")):
        return "Facebook"
    if any(k in host for k in ("pinterest.com", "pin.it")):
        return "Pinterest"
    if any(k in host for k in ("maps.google.", "goo.gl", "maps.app.goo.gl")):
        return "Google Maps"
    return "Bài viết du lịch"


def is_safe_public_url(url: str) -> bool:
    """Block SSRF against loopback, private RFC1918, link-local, or non-HTTP(S) endpoints."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        hostname = (parsed.hostname or "").strip().lower()
        if not hostname or hostname in ("localhost", "localhost.localdomain") or hostname.endswith(".local"):
            return False

        # Direct IP literal check
        try:
            ip = ipaddress.ip_address(hostname)
            return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast)
        except ValueError:
            pass

        # DNS resolution check (reject if any resolved address is non-public)
        addr_infos = socket.getaddrinfo(hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
        if not addr_infos:
            return False
        for info in addr_infos:
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return False
        return True
    except Exception:
        return False


def _extract_html_metadata(raw_html: str) -> dict[str, str]:
    """Parse title, og:title, og:description, and plain text snippet from HTML."""
    meta: dict[str, str] = {"title": "", "description": "", "snippet": ""}
    title_match = _TITLE_RE.search(raw_html)
    if title_match:
        meta["title"] = html.unescape(re.sub(r"\s+", " ", title_match.group(1))).strip()[:240]

    for tag_match in _META_TAG_RE.finditer(raw_html[:60_000]):
        attrs: dict[str, str] = {}
        for attr_m in _ATTR_RE.finditer(tag_match.group(0)):
            key = attr_m.group(1).lower()
            val = attr_m.group(2) if attr_m.group(2) is not None else (attr_m.group(3) or "")
            attrs[key] = html.unescape(val).strip()
        prop = attrs.get("property", "").lower() or attrs.get("name", "").lower()
        content = attrs.get("content", "")
        if not content:
            continue
        if prop in ("og:title", "twitter:title") and len(content) > len(meta["title"]):
            meta["title"] = content[:240]
        elif prop in ("og:description", "description", "twitter:description") and len(content) > len(meta["description"]):
            meta["description"] = content[:450]

    cleaned = _SCRIPT_STYLE_RE.sub(" ", raw_html[:120_000])
    cleaned = _HTML_TAG_RE.sub(" ", cleaned)
    cleaned = html.unescape(re.sub(r"\s+", " ", cleaned)).strip()
    meta["snippet"] = cleaned[:1000]
    return meta


def fetch_link_metadata(url: str) -> dict[str, str]:
    """Fetch public page metadata / oEmbed safely with strict timeout and SSRF guards."""
    platform = detect_link_platform(url)
    parsed = urlparse(url)
    slug_hint = unquote(f"{parsed.path} {parsed.query}").replace("-", " ").replace("_", " ").replace("/", " ").strip()
    result = {
        "platform": platform,
        "url": url,
        "title": "",
        "description": "",
        "snippet": slug_hint[:400],
    }

    if not is_safe_public_url(url):
        return result

    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; GreenTripBot/1.0; +https://greentrip.vn)",
        "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
    }

    # Try oEmbed first for YouTube/TikTok (much cleaner than raw JS-heavy HTML)
    try:
        if platform == "YouTube":
            oe = httpx.get(
                "https://www.youtube.com/oembed",
                params={"url": url, "format": "json"},
                headers=headers,
                timeout=3.5,
            )
            if oe.status_code == 200:
                oe_json = oe.json()
                result["title"] = str(oe_json.get("title") or "")[:240]
                author = str(oe_json.get("author_name") or "")
                result["description"] = f"Video YouTube bởi {author}".strip()
                if result["title"]:
                    return result
        elif platform == "TikTok":
            oe = httpx.get(
                "https://www.tiktok.com/oembed",
                params={"url": url},
                headers=headers,
                timeout=3.5,
            )
            if oe.status_code == 200:
                oe_json = oe.json()
                result["title"] = str(oe_json.get("title") or "")[:240]
                author = str(oe_json.get("author_name") or "")
                result["description"] = f"Video TikTok bởi {author}".strip()
                if result["title"]:
                    return result
    except Exception as exc:
        logger.debug("oEmbed lookup skipped for %s: %s", platform, exc)

    # Fallback: fetch HTML directly with manual safe redirect validation
    current_url = url
    try:
        for _ in range(3):
            resp = httpx.get(current_url, headers=headers, timeout=4.0, follow_redirects=False)
            if resp.status_code in (301, 302, 303, 307, 308) and resp.headers.get("location"):
                next_url = str(resp.url.join(resp.headers["location"]))
                if not is_safe_public_url(next_url):
                    break
                current_url = next_url
                continue
            if resp.status_code == 200 and "text/html" in (resp.headers.get("content-type") or "").lower():
                parsed_meta = _extract_html_metadata(resp.text)
                result["title"] = parsed_meta["title"] or result["title"]
                result["description"] = parsed_meta["description"] or result["description"]
                if parsed_meta["snippet"]:
                    result["snippet"] = parsed_meta["snippet"]
            break
    except Exception as exc:
        logger.debug("Direct HTML metadata fetch skipped for %s: %s", url, exc)

    return result


def _strip_data_url_prefix(raw_b64: str) -> tuple[str, str | None]:
    """Strip optional data:<mime>;base64, prefix and return (pure_base64, detected_mime)."""
    cleaned = (raw_b64 or "").strip()
    if cleaned.startswith("data:") and "," in cleaned:
        header, body = cleaned.split(",", 1)
        mime = header[5:].split(";", 1)[0].strip().lower()
        return body.strip(), (mime or None)
    return cleaned, None


def _analyze_attachment_with_gemini(
    attachment: CopilotAttachmentPayload,
    user_message: str,
    trip_context: TripContextPayload,
    link_meta: dict[str, str] | None,
) -> dict[str, Any] | None:
    """Use Gemini 2.5 Flash Multimodal (Vision/PDF/Text JSON mode) when GEMINI_API_KEY is configured."""
    settings = get_settings()
    if not settings.gemini_configured:
        return None

    system_prompt = """Bạn là trợ lý trích xuất dữ liệu du lịch đa phương thức cho GreenTrip AI (chuyên sâu Đà Nẵng, Huế, Hội An).
Hãy phân tích tệp đính kèm (ảnh địa điểm, ảnh chụp màn hình review, PDF, đường dẫn video/bài viết, hoặc hóa đơn/vé đặt chỗ) và trả về DUY NHẤT 1 JSON hợp lệ:
{
  "summary": "Tóm tắt ngắn gọn 1-2 câu bằng tiếng Việt về nội dung ảnh/link/hóa đơn",
  "detected_city": "Đà Nẵng" | "Huế" | "Đà Nẵng & Huế" | null,
  "place_keywords": ["tối đa 6 tên địa danh, quán ăn, món đặc sản hoặc khu vực nhận diện được"],
  "suggested_days": integer (1..7) hoặc null,
  "receipt_info": {
    "booking_type": "hotel" | "train" | "flight" | "restaurant" | "ticket" | null,
    "title": "Tên khách sạn / chuyến tàu / nhà hàng / vé tham quan",
    "date_str": "YYYY-MM-DD hoặc chuỗi ngày ngắn gọn nếu thấy trên vé",
    "time_str": "HH:MM nếu thấy trên vé",
    "city": "Đà Nẵng" | "Huế" | null,
    "estimated_cost_vnd": integer hoặc null
  }
}
Nếu không phải hóa đơn/vé đặt chỗ, đặt receipt_info = null. Chỉ trả JSON thuần."""

    parts: list[dict[str, Any]] = []
    text_context_lines = [
        f"ATTACHMENT_TYPE: {attachment.type}",
        f"TRIP_DESTINATION: {trip_context.destination}, DAYS: {trip_context.days_count}",
    ]
    if user_message.strip():
        text_context_lines.append(f"USER_NOTE: {user_message.strip()}")
    if attachment.file_name:
        text_context_lines.append(f"FILE_NAME: {attachment.file_name}")
    if link_meta:
        text_context_lines.append(f"PLATFORM: {link_meta.get('platform')}")
        text_context_lines.append(f"URL: {link_meta.get('url')}")
        if link_meta.get("title"):
            text_context_lines.append(f"PAGE_TITLE: {link_meta['title']}")
        if link_meta.get("description"):
            text_context_lines.append(f"PAGE_DESCRIPTION: {link_meta['description']}")
        if link_meta.get("snippet"):
            text_context_lines.append(f"PAGE_SNIPPET: {link_meta['snippet'][:700]}")
    if attachment.extracted_text:
        text_context_lines.append(f"EXTRACTED_TEXT: {attachment.extracted_text[:2000]}")

    parts.append({"text": "\n".join(text_context_lines)})

    if attachment.content_base64:
        pure_b64, detected_mime = _strip_data_url_prefix(attachment.content_base64)
        mime_type = (attachment.mime_type or detected_mime or "image/jpeg").lower()
        if mime_type == "image/jpg":
            mime_type = "image/jpeg"
        if mime_type in _ALLOWED_IMAGE_MIMES and len(pure_b64) <= 5_800_000:
            parts.append({"inline_data": {"mime_type": mime_type, "data": pure_b64}})
        elif mime_type.startswith("text/"):
            try:
                decoded = base64.b64decode(pure_b64).decode("utf-8", errors="ignore")[:3000]
                if decoded.strip():
                    parts.append({"text": f"TEXT_FILE_CONTENT:\n{decoded}"})
            except Exception:
                pass

    try:
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"
        )
        resp = httpx.post(
            url,
            json={
                "system_instruction": {"parts": [{"text": system_prompt}]},
                "contents": [{"role": "user", "parts": parts}],
                "generationConfig": {
                    "temperature": 0.1,
                    "maxOutputTokens": 512,
                    "responseMimeType": "application/json",
                },
            },
            timeout=10.0,
        )
        if resp.status_code != 200:
            logger.warning("Gemini attachment analysis returned HTTP %s", resp.status_code)
            return None
        data = resp.json()
        candidates = data.get("candidates") or []
        if not candidates:
            return None
        out_parts = candidates[0].get("content", {}).get("parts") or []
        raw_text = "".join(str(p.get("text", "")) for p in out_parts).strip()
        if not raw_text:
            return None
        cleaned = _CODE_FENCE_RE.sub("", raw_text).strip()
        parsed = json.loads(cleaned)
        return parsed if isinstance(parsed, dict) else None
    except Exception as exc:
        logger.warning("Gemini multimodal attachment fallback due to error: %s", exc)
        return None


def _detect_city_from_text(text: str, default_destination: str) -> str:
    norm = strip_vietnamese_accents(text).lower()
    has_dn = any(k in norm for k in ("da nang", "danang", "my khe", "son tra", "cau rong", "ba na", "ngu hanh son", "hai chau", "han river"))
    has_hue = any(k in norm for k in ("hue", "dai noi", "thien mu", "song huong", "khai dinh", "tu duc", "dong ba", "co do", "bun bo hue"))
    if has_dn and has_hue:
        return "Đà Nẵng & Huế"
    if has_hue:
        return "Huế"
    if has_dn:
        return "Đà Nẵng"
    return default_destination or "Đà Nẵng & Huế"


def _extract_fallback_keywords(combined_text: str) -> list[str]:
    norm = strip_vietnamese_accents(combined_text).lower()
    found: list[str] = []
    for key, _, _ in DEFAULT_POI_COORDS_KB:
        norm_key = strip_vietnamese_accents(key).lower()
        if norm_key in norm and key not in found:
            found.append(key)
    for extra in ("bún bò", "mì quảng", "bánh xèo", "cà phê", "chay", "biển", "chùa", "lăng", "khách sạn", "homestay", "tàu hỏa"):
        if strip_vietnamese_accents(extra).lower() in norm and extra not in found:
            found.append(extra)
    return found[:6]


def _extract_fallback_receipt_info(combined_text: str, file_name: str | None, detected_city: str) -> dict[str, Any]:
    raw = f"{file_name or ''} {combined_text}".strip()
    norm = strip_vietnamese_accents(raw).lower()

    booking_type = "hotel"
    default_title = "Nhận phòng lưu trú (Từ xác nhận đặt chỗ)"
    if any(k in norm for k in ("tau", "train", "dsvn", "hd1", "hd2", "se1", "se2", "ga da nang", "ga hue")):
        booking_type = "train"
        default_title = "Tàu di sản Đà Nẵng – Huế (Từ vé đặt chỗ)"
    elif any(k in norm for k in ("flight", "may bay", "vietjet", "vietnam airlines", "bamboo", "san bay", "dad", "hui", "boarding")):
        booking_type = "flight"
        default_title = f"Chuyến bay đến {detected_city} (Từ vé máy bay)"
    elif any(k in norm for k in ("nha hang", "restaurant", "bill", "hoa don", "quan", "cafe", "coffee")):
        booking_type = "restaurant"
        default_title = "Đặt bàn ẩm thực (Từ hóa đơn)"
    elif any(k in norm for k in ("ve", "ticket", "ba na", "dai noi", "bao tang")):
        booking_type = "ticket"
        default_title = "Vé tham quan (Từ xác nhận)"

    time_match = re.search(r"\b([01]?\d|2[0-3]):([0-5]\d)\b", raw)
    date_match = re.search(r"\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b", raw)
    cost_match = re.search(r"(\d{1,3}(?:[.,]\d{3})+|\d{5,8})\s*(?:vnd|đ|d\b)", norm)
    cost_val: int | None = None
    if cost_match:
        digits = re.sub(r"[^\d]", "", cost_match.group(1))
        if digits.isdigit():
            cost_val = int(digits)

    return {
        "booking_type": booking_type,
        "title": default_title,
        "date_str": date_match.group(1) if date_match else None,
        "time_str": f"{int(time_match.group(1)):02d}:{time_match.group(2)}" if time_match else ("14:00" if booking_type == "hotel" else "09:00"),
        "city": "Huế" if detected_city == "Huế" else "Đà Nẵng",
        "estimated_cost_vnd": cost_val,
    }


def _query_matching_pois(
    connection: Connection,
    keywords: list[str],
    target_city: str,
    constraints: list[str],
    limit: int = 3,
) -> list[CopilotSuggestedPoiItem]:
    """Query PostgreSQL/SQLite for real Da Nang / Hue POIs matching extracted keywords."""
    cities = ["Đà Nẵng", "Huế"]
    if target_city == "Đà Nẵng":
        cities = ["Đà Nẵng"]
    elif target_city == "Huế":
        cities = ["Huế"]

    rows: list[tuple[Any, ...]] = []
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    p.poi_id,
                    p.name,
                    c.name AS category,
                    p.sub_category,
                    ci.name AS city,
                    COALESCE(p.address, '') AS address,
                    COALESCE(p.description, '') AS description,
                    p.estimated_cost,
                    p.green_score,
                    p.satisfaction_score,
                    p.latitude,
                    p.longitude,
                    p.image_url
                FROM public.pois p
                JOIN public.poi_categories c ON p.category_id = c.category_id
                JOIN public.cities ci ON p.city_id = ci.city_id
                WHERE ci.name = ANY(%s)
                ORDER BY p.green_score DESC NULLS LAST, p.satisfaction_score DESC NULLS LAST
                LIMIT 120
                """,
                (cities,),
            )
            rows = cursor.fetchall()
    except Exception as exc:
        logger.warning("POI query for attachment grounding fell back cleanly: %s", exc)
        return []

    if not rows:
        return []

    norm_keywords = [strip_vietnamese_accents(k).lower().strip() for k in keywords if k and k.strip()]

    scored: list[tuple[float, tuple[Any, ...]]] = []
    for row in rows:
        _, name, cat, sub_cat, city, addr, desc, _, green_score, rating, _, _, _ = row
        haystack = strip_vietnamese_accents(f"{name} {cat} {sub_cat or ''} {addr} {desc}").lower()
        name_norm = strip_vietnamese_accents(str(name)).lower()
        score = float(green_score or 75) * 0.1 + float(rating or 4.5) * 2.0
        matched_any = False
        for kw in norm_keywords:
            if kw in name_norm:
                score += 60.0
                matched_any = True
            elif kw in haystack:
                score += 25.0
                matched_any = True
        if matched_any or not norm_keywords:
            scored.append((score, row))

    if not scored:
        scored = [(float(r[8] or 75), r) for r in rows]

    scored.sort(key=lambda item: item[0], reverse=True)
    results: list[CopilotSuggestedPoiItem] = []
    for idx, (_, row) in enumerate(scored[:limit]):
        poi_id, name, cat, sub_cat, city, addr, desc, est_cost, green_score, rating, lat, lng, image_url = row
        r_lat, r_lng = resolve_poi_coordinates(str(name), str(city), lat, lng, idx)
        kg_reason, eco_practices = build_kg_explanation_for_poi(
            poi_name=str(name),
            category=str(cat),
            sub_category=str(sub_cat) if sub_cat else None,
            city=str(city),
            constraints=constraints,
        )
        g_int = format_green_score(green_score)
        results.append(
            CopilotSuggestedPoiItem(
                id=str(poi_id),
                name=str(name),
                category=str(cat),
                sub_category=str(sub_cat) if sub_cat else None,
                city=str(city),
                lat=r_lat,
                lng=r_lng,
                image_url=str(image_url or "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80"),
                green_score=g_int,
                rating=round(float(rating or 4.7), 1),
                address=str(addr or city),
                swap_reason=kg_reason,
                kg_explanation=kg_reason,
                eco_practices=eco_practices,
                estimated_cost=float(est_cost) if est_cost is not None else None,
            )
        )
    return results


def process_copilot_attachment(
    request: CopilotChatRequest,
    connection: Connection,
) -> CopilotChatResponse:
    """Handle Mindtrip-style '+' attachments: Upload a file, Add a link, or Add a receipt."""
    attachment = request.attachment
    assert attachment is not None

    ctx = request.trip_context
    constraints = extract_persistent_constraints(request.message or "", ctx)

    link_meta: dict[str, str] | None = None
    if attachment.type == "link" and attachment.url:
        link_meta = fetch_link_metadata(attachment.url)

    gemini_result = _analyze_attachment_with_gemini(
        attachment=attachment,
        user_message=request.message or "",
        trip_context=ctx,
        link_meta=link_meta,
    )

    combined_signal_text = " ".join(
        filter(
            None,
            [
                request.message,
                attachment.file_name,
                attachment.extracted_text,
                link_meta.get("title") if link_meta else None,
                link_meta.get("description") if link_meta else None,
                link_meta.get("snippet") if link_meta else None,
                str(gemini_result.get("summary") or "") if gemini_result else None,
                " ".join(gemini_result.get("place_keywords") or []) if gemini_result else None,
            ],
        )
    )

    detected_city = (
        str(gemini_result.get("detected_city"))
        if gemini_result and gemini_result.get("detected_city") in ("Đà Nẵng", "Huế", "Đà Nẵng & Huế")
        else _detect_city_from_text(combined_signal_text, ctx.destination)
    )
    keywords: list[str] = []
    if gemini_result and isinstance(gemini_result.get("place_keywords"), list):
        keywords = [str(k).strip() for k in gemini_result["place_keywords"] if str(k).strip()][:6]
    if not keywords:
        keywords = _extract_fallback_keywords(combined_signal_text)

    effective_ctx = ctx.model_copy(update={"destination": detected_city})
    suggested_pois = _query_matching_pois(
        connection=connection,
        keywords=keywords,
        target_city=detected_city,
        constraints=constraints,
        limit=3,
    )

    updated_outline: list[dict[str, Any]] | None = None
    mutation_summary: list[str] = []
    action_type = "add_stop" if suggested_pois else "none"
    intent_category: Any = "POI_RECOMMENDATION"
    intent = f"attachment_{attachment.type}"

    if attachment.type == "link":
        platform = link_meta["platform"] if link_meta else detect_link_platform(attachment.url or "")
        title_display = (link_meta.get("title") if link_meta else "") or (attachment.url or "")
        summary_line = (
            str(gemini_result["summary"])
            if gemini_result and gemini_result.get("summary")
            else f"Mình đã đọc xong đường dẫn từ **{platform}** (*{title_display[:90]}*) và đối chiếu với Đồ thị Tri thức du lịch xanh **{detected_city}**."
        )
        bullets = "\n".join(format_three_layer_poi_bullet(p) for p in suggested_pois)
        reply_text = (
            f"{summary_line}\n\n"
            f"**Các điểm đến xanh khớp nhất từ đường dẫn của bạn:**\n"
            f"{bullets if bullets else f'- Gợi ý cụm trải nghiệm bản địa tại **{detected_city}** ít đông đúc và dễ ghép tuyến.'}\n\n"
            f"Bạn muốn mình **A — Gom ngay các điểm này vào một lịch trình mới theo cụm gần nhau**, hay **B — Chỉ lưu vào kho Ý tưởng để bạn tự chọn ngày**?"
        )
        next_prompts = [
            f"Xếp các điểm từ link này thành lịch trình {ctx.days_count} ngày",
            f"Gợi ý thêm quán ăn bản địa gần các điểm này ở {detected_city}",
            "Ước tính chi phí và phương tiện di chuyển xanh cho tuyến này",
        ]
        reasoning_trace = (
            f"1. Đính kèm Link ({platform}): Đã trích xuất metadata an toàn (SSRF-guarded) từ URL.\n"
            f"2. Từ khóa nhận diện: {keywords or ['du lịch xanh miền Trung']} -> Thành phố: {detected_city}.\n"
            f"3. Đối chiếu PostgreSQL & Knowledge Graph: Tìm thấy {len(suggested_pois)} địa điểm xanh thực tế."
        )

    elif attachment.type == "receipt":
        receipt_info = (
            gemini_result.get("receipt_info")
            if gemini_result and isinstance(gemini_result.get("receipt_info"), dict)
            else _extract_fallback_receipt_info(combined_signal_text, attachment.file_name, detected_city)
        )
        r_title = str(receipt_info.get("title") or "Xác nhận đặt chỗ (Từ hóa đơn)")
        r_time = str(receipt_info.get("time_str") or "14:00")
        r_date = receipt_info.get("date_str")
        r_city = str(receipt_info.get("city") or ("Huế" if detected_city == "Huế" else "Đà Nẵng"))
        r_cost = receipt_info.get("estimated_cost_vnd")

        # Sync booking into current itinerary if user is inside a trip
        if ctx.mode == "trip" or ctx.current_itinerary_state:
            updated_outline, mutation_summary = _insert_landmark_into_day(
                trip_context=effective_ctx,
                day_number=ctx.current_day or 1,
                landmark_name=f"{r_title} ({r_time})",
                real_city=r_city,
                constraints=constraints,
            )
            action_type = "mutate_itinerary"
            intent_category = "ITINERARY_MUTATION"

        cost_line = f" · Chi phí ghi nhận: **{int(r_cost):,} ₫**".replace(",", ".") if isinstance(r_cost, (int, float)) and r_cost > 0 else ""
        date_line = f" · Ngày: **{r_date}**" if r_date else ""
        bullets = "\n".join(format_three_layer_poi_bullet(p) for p in suggested_pois[:2])

        reply_text = (
            f"Mình đã đọc xong hóa đơn / xác nhận **{attachment.file_name or 'đặt chỗ'}** của bạn!\n\n"
            f"**Thông tin đặt chỗ đã trích xuất:**\n"
            f"- **Mục đặt chỗ**: {r_title}\n"
            f"- **Khu vực & Thời gian**: {r_city} · Khung giờ **{r_time}**{date_line}{cost_line}\n"
            + (
                f"\n✅ Đã đồng bộ mốc này vào **Ngày {ctx.current_day or 1}** trong Kế hoạch chi tiết.\n"
                if updated_outline
                else "\n"
            )
            + (f"\n**Gợi ý điểm ăn uống / tham quan xanh gần nơi bạn đặt chỗ:**\n{bullets}\n\n" if bullets else "\n")
            + "Bạn muốn mình **A — Xếp thêm quán ăn bản địa ngay gần điểm check-in này**, hay **B — Gợi ý phương tiện di chuyển xanh (buýt/taxi điện) từ ga/sân bay tới đây**?"
        )
        next_prompts = [
            f"Gợi ý quán ăn ngon gần {r_city} ngay sau khi check-in",
            f"Cách di chuyển xanh từ sân bay/ga đến điểm đặt chỗ tại {r_city}",
            "Cập nhật lại ngân sách còn lại sau khoản đặt chỗ này",
        ]
        reasoning_trace = (
            f"1. Đính kèm Hóa đơn / Vé đặt chỗ ({attachment.file_name or 'upload'}): Trích xuất mốc '{r_title}' lúc {r_time} tại {r_city}.\n"
            f"2. Đồng bộ lịch trình: {'Đã chèn vào Ngày ' + str(ctx.current_day or 1) if updated_outline else 'Sẵn sàng tạo chuyến đi mới'}.\n"
            f"3. Gợi ý lân cận từ DB: {len(suggested_pois)} địa điểm xanh."
        )

    else:  # attachment.type == "file" (photo, screenshot, PDF)
        summary_line = (
            str(gemini_result["summary"])
            if gemini_result and gemini_result.get("summary")
            else f"Mình đã xem tệp **{attachment.file_name or 'ảnh đính kèm'}** và nhận diện các điểm đến xanh nổi bật tại **{detected_city}** khớp với phong cách trong hình."
        )
        bullets = "\n".join(format_three_layer_poi_bullet(p) for p in suggested_pois)
        reply_text = (
            f"{summary_line}\n\n"
            f"**Các địa điểm thực tế tại {detected_city} khớp với tệp của bạn:**\n"
            f"{bullets if bullets else f'- Các điểm trải nghiệm xanh tiêu biểu tại **{detected_city}**.'}\n\n"
            f"Bạn muốn mình **A — Ghép ngay các điểm này vào lịch trình {ctx.days_count} ngày**, hay **B — Tìm thêm các góc chụp / quán bản địa cùng phong cách nhưng ít đông hơn**?"
        )
        next_prompts = [
            f"Ghép các điểm từ ảnh này vào lịch trình {detected_city}",
            f"Tìm thêm điểm cùng phong cách ở {detected_city} ít đông khách",
            "Nên đi các điểm này vào khung giờ nào đẹp nhất?",
        ]
        reasoning_trace = (
            f"1. Đính kèm Tệp / Ảnh chụp màn hình ({attachment.file_name or 'image'}, {attachment.mime_type or 'unknown'}).\n"
            f"2. Tín hiệu nhận diện: {keywords or ['phong cảnh & trải nghiệm xanh']} -> Thành phố: {detected_city}.\n"
            f"3. Khớp thực thể trong DB: Trả về {len(suggested_pois)} thẻ POI thật kèm tọa độ bản đồ."
        )

    raw_resp = CopilotChatResponse(
        reply_text=reply_text,
        intent=intent,
        intent_category=intent_category,
        reasoning_trace=reasoning_trace,
        recommended_poi_ids=[p.id for p in suggested_pois],
        detected_constraints=constraints,
        suggested_pois=suggested_pois,
        action_type=action_type,
        next_suggested_prompts=next_prompts,
        green_impact_summary=f"Đã lọc ưu tiên các điểm xanh & doanh nghiệp bản địa tại {detected_city}.",
        updated_itinerary_state=updated_outline,
        mutation_summary=mutation_summary,
    )
    return finalize_copilot_response(
        raw_resp,
        effective_ctx,
        constraints,
        connection=connection,
    )
