"""Multimodal attachment analyzer for GreenTrip Copilot ('+' Upload file / Add link / Add receipt).

Implements Mindtrip-grade 4-step processing for YouTube/social links, photos, and receipts:
1. Metadata extraction (oEmbed + YouTube watch shortDescription/chapters + optional captions)
2. LLM Named Entity Recognition (NER) distinguishing named venues vs generic mentions
3. PostGIS Entity Linking + Central Vietnam Geocoding anchors
4. Interactive response synthesis with map pins and multi-turn source memory
"""
from __future__ import annotations

import base64
import html
import ipaddress
import json
import logging
import re
import socket
import time
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

import httpx
from psycopg import Connection

from app.config import get_settings
from app.trips.copilot_consultant import finalize_copilot_response
from app.trips.copilot_enrichment import (
    DEFAULT_POI_COORDS_KB,
    build_kg_explanation_for_poi,
    ensure_closing_ab_hook,
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
_TIMESTAMP_LINE_RE = re.compile(r"^\s*(?:[-•*]\s*)?(?:\d{1,2}:)?\d{1,2}:\d{2}\s*[-–—:|•]?\s*\S+")
_YT_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
_ALLOWED_IMAGE_MIMES = frozenset({"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "application/pdf"})

_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
}

# Verified Central Vietnam geo-anchors for iconic places often featured in Da Nang / Hue / Hoi An
# videos even when a venue is in Quang Nam or not yet seeded in public.pois.
_CENTRAL_VIETNAM_GEO_ANCHORS: list[dict[str, Any]] = [
    {
        "keys": ("nui than tai", "cong vien suoi khoang nong nui than tai"),
        "id": "ext-nui-than-tai",
        "name": "KDL Suối Khoáng Nóng Núi Thần Tài",
        "category": "Cảnh quan và thiên nhiên",
        "city": "Đà Nẵng",
        "lat": 15.9707,
        "lng": 108.0191,
        "address": "QL14G, Hòa Phú, Hòa Vang, Đà Nẵng",
        "image_url": "https://images.unsplash.com/photo-1540541338287-41700207dee6?w=800&auto=format&fit=crop&q=80",
        "green_score": 82,
        "rating": 4.5,
        "estimated_cost": 450000.0,
    },
    {
        "keys": ("muoi bien", "nha hang muoi bien", "muoi bien seafood"),
        "id": "ext-muoi-bien-seafood",
        "name": "Nhà Hàng Muối Biển Seafood",
        "category": "Ẩm thực và quán ăn",
        "city": "Đà Nẵng",
        "lat": 16.0585,
        "lng": 108.2465,
        "address": "51 Võ Nguyên Giáp, Mỹ An, Ngũ Hành Sơn, Đà Nẵng",
        "image_url": "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&auto=format&fit=crop&q=80",
        "green_score": 80,
        "rating": 4.7,
        "estimated_cost": 300000.0,
    },
    {
        "keys": ("pho co hoi an", "hoi an", "chua cau"),
        "id": "ext-pho-co-hoi-an",
        "name": "Phố Cổ Hội An (Chùa Cầu)",
        "category": "Di tích lịch sử và văn hóa",
        "city": "Hội An",
        "lat": 15.8771,
        "lng": 108.3261,
        "address": "Phường Minh An, TP. Hội An, Quảng Nam",
        "image_url": "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80",
        "green_score": 91,
        "rating": 4.8,
        "estimated_cost": 120000.0,
    },
    {
        "keys": ("vinpearl nam hoi an", "vinwonders nam hoi an"),
        "id": "ext-vinpearl-nam-hoi-an",
        "name": "VinWonders / Vinpearl Nam Hội An",
        "category": "Giải trí & trải nghiệm",
        "city": "Hội An",
        "lat": 15.7785,
        "lng": 108.4209,
        "address": "Đường Võ Chí Công, Bình Minh, Thăng Bình, Quảng Nam",
        "image_url": "https://images.unsplash.com/photo-1519046904884-53103b34b206?w=800&auto=format&fit=crop&q=80",
        "green_score": 78,
        "rating": 4.6,
        "estimated_cost": 600000.0,
    },
    {
        "keys": ("ba na hills", "sun world ba na", "cau vang"),
        "id": "ext-ba-na-hills",
        "name": "Bà Nà Hills & Cầu Vàng",
        "category": "Cảnh quan và thiên nhiên",
        "city": "Đà Nẵng",
        "lat": 15.9951,
        "lng": 107.9962,
        "address": "Thôn An Sơn, xã Hòa Ninh, huyện Hòa Vang, Đà Nẵng",
        "image_url": "https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=800&auto=format&fit=crop&q=80",
        "green_score": 81,
        "rating": 4.7,
        "estimated_cost": 900000.0,
    },
    {
        "keys": ("rung dua bay mau", "cam thanh"),
        "id": "ext-rung-dua-bay-mau",
        "name": "Rừng Dừa Bảy Mẫu Cẩm Thanh",
        "category": "Cảnh quan và thiên nhiên",
        "city": "Hội An",
        "lat": 15.8752,
        "lng": 108.3885,
        "address": "Xã Cẩm Thanh, TP. Hội An, Quảng Nam",
        "image_url": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80",
        "green_score": 89,
        "rating": 4.6,
        "estimated_cost": 150000.0,
    },
    {
        "keys": ("cu lao cham",),
        "id": "ext-cu-lao-cham",
        "name": "Cù Lao Chàm",
        "category": "Cảnh quan và thiên nhiên",
        "city": "Hội An",
        "lat": 15.9565,
        "lng": 108.5082,
        "address": "Xã Tân Hiệp, TP. Hội An, Quảng Nam",
        "image_url": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80",
        "green_score": 94,
        "rating": 4.8,
        "estimated_cost": 500000.0,
    },
]

_FOLLOWUP_SOURCE_MARKERS = (
    "video",
    "viudeo",
    "youtube",
    "clip",
    "link",
    "duong dan",
    "dinh kem",
    "tep",
    "anh vua",
    "vua gui",
    "trong bai",
    "liet ke",
)


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


def extract_youtube_video_id(url: str) -> str | None:
    """Extract the 11-character YouTube video ID from watch, youtu.be, shorts, or embed URLs."""
    try:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        if "youtu.be" in host:
            candidate = parsed.path.strip("/").split("/")[0]
            return candidate if _YT_VIDEO_ID_RE.match(candidate) else None
        if "youtube.com" in host:
            if parsed.path == "/watch":
                vid = (parse_qs(parsed.query).get("v") or [""])[0]
                return vid if _YT_VIDEO_ID_RE.match(vid) else None
            parts = [p for p in parsed.path.split("/") if p]
            if len(parts) >= 2 and parts[0] in ("shorts", "embed", "live", "v"):
                return parts[1] if _YT_VIDEO_ID_RE.match(parts[1]) else None
    except Exception:
        return None
    return None


def is_safe_public_url(url: str) -> bool:
    """Block SSRF against loopback, private RFC1918, link-local, or non-HTTP(S) endpoints."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        hostname = (parsed.hostname or "").strip().lower()
        if not hostname or hostname in ("localhost", "localhost.localdomain") or hostname.endswith(".local"):
            return False

        try:
            ip = ipaddress.ip_address(hostname)
            return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast)
        except ValueError:
            pass

        addr_infos = socket.getaddrinfo(
            hostname,
            parsed.port or (443 if parsed.scheme == "https" else 80),
            type=socket.SOCK_STREAM,
        )
        if not addr_infos:
            return False
        for info in addr_infos:
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return False
        return True
    except Exception:
        return False


def _extract_json_string_field(raw_text: str, field_name: str) -> str:
    """Safely extract and JSON-unescape a string property like "shortDescription":"..." from HTML."""
    marker = f'"{field_name}":"'
    start = raw_text.find(marker)
    if start == -1:
        return ""
    idx = start + len(marker)
    buf: list[str] = []
    escaped = False
    max_end = min(len(raw_text), idx + 25_000)
    while idx < max_end:
        ch = raw_text[idx]
        if escaped:
            buf.append(ch)
            escaped = False
        elif ch == "\\":
            buf.append(ch)
            escaped = True
        elif ch == '"':
            break
        else:
            buf.append(ch)
        idx += 1
    try:
        return str(json.loads(f'"{"".join(buf)}"'))
    except Exception:
        return "".join(buf).replace("\\n", "\n")


def _extract_chapter_lines(description: str) -> list[str]:
    """Extract timestamped chapter lines (e.g. '1:30 KDL Núi Thần Tài', '11:03 Nhà Hàng Muối Biển')."""
    chapters: list[str] = []
    for raw_line in (description or "").splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if line and _TIMESTAMP_LINE_RE.match(line):
            chapters.append(line[:180])
    return chapters[:40]


def _extract_youtube_caption_snippet(watch_html: str) -> str:
    """Best-effort fetch of public YouTube captions (vi/en) if embedded in watch page player JSON."""
    idx = watch_html.find('"captionTracks":[')
    if idx == -1:
        return ""
    end = watch_html.find("]", idx)
    if end == -1 or end - idx > 20_000:
        return ""
    try:
        tracks = json.loads(watch_html[idx + len('"captionTracks":') : end + 1])
    except Exception:
        return ""
    if not isinstance(tracks, list) or not tracks:
        return ""

    chosen_url = ""
    for lang in ("vi", "en"):
        for track in tracks:
            if isinstance(track, dict) and str(track.get("languageCode", "")).lower().startswith(lang):
                chosen_url = str(track.get("baseUrl") or "")
                if chosen_url:
                    break
        if chosen_url:
            break
    if not chosen_url and isinstance(tracks[0], dict):
        chosen_url = str(tracks[0].get("baseUrl") or "")
    if not chosen_url or not is_safe_public_url(chosen_url):
        return ""

    try:
        resp = httpx.get(chosen_url, headers=_BROWSER_HEADERS, timeout=2.5)
        if resp.status_code != 200 or not resp.text:
            return ""
        plain = _HTML_TAG_RE.sub(" ", html.unescape(resp.text))
        plain = re.sub(r"\s+", " ", plain).strip()
        return plain[:2200]
    except Exception:
        return ""


def _extract_youtube_watch_details(video_id: str) -> dict[str, str]:
    """Fetch YouTube watch HTML to extract full shortDescription, chapter timestamps, and optional captions."""
    watch_url = f"https://www.youtube.com/watch?v={video_id}"
    details = {
        "title": "",
        "description": "",
        "chapters": "",
        "transcript": "",
        "thumbnail_url": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
        "metadata_source": "title_only",
    }
    try:
        resp = httpx.get(watch_url, headers=_BROWSER_HEADERS, timeout=5.0, follow_redirects=True)
        if resp.status_code != 200 or not resp.text:
            return details
        body = resp.text
        short_desc = _extract_json_string_field(body, "shortDescription").strip()
        watch_title = _extract_json_string_field(body, "title").strip()
        if watch_title:
            details["title"] = watch_title[:240]
        if short_desc:
            details["description"] = short_desc[:3500]
            chapters = _extract_chapter_lines(short_desc)
            if chapters:
                details["chapters"] = "\n".join(chapters)
            details["metadata_source"] = "description_and_chapters" if chapters else "description_only"

        # Best-effort public captions fetch (fast timeout, never blocks response)
        captions = _extract_youtube_caption_snippet(body)
        if captions:
            details["transcript"] = captions
            details["metadata_source"] = (
                "captions_and_description" if short_desc else "captions_only"
            )
    except Exception as exc:
        logger.debug("YouTube watch detail extraction skipped for %s: %s", video_id, exc)
    return details


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
            meta["description"] = content[:600]

    cleaned = _SCRIPT_STYLE_RE.sub(" ", raw_html[:120_000])
    cleaned = _HTML_TAG_RE.sub(" ", cleaned)
    cleaned = html.unescape(re.sub(r"\s+", " ", cleaned)).strip()
    meta["snippet"] = cleaned[:1400]
    return meta


def fetch_link_metadata(url: str) -> dict[str, str]:
    """Step 1: Fetch public page metadata, YouTube shortDescription + chapters safely with SSRF guards."""
    platform = detect_link_platform(url)
    parsed = urlparse(url)
    slug_hint = unquote(f"{parsed.path} {parsed.query}").replace("-", " ").replace("_", " ").replace("/", " ").strip()
    result = {
        "platform": platform,
        "url": url,
        "title": "",
        "author": "",
        "description": "",
        "chapters": "",
        "transcript": "",
        "snippet": slug_hint[:400],
        "thumbnail_url": "",
        "metadata_source": "url_only",
    }

    if not is_safe_public_url(url):
        return result

    # YouTube: combine oEmbed (fast title/author/thumbnail) + watch page (full shortDescription & chapters)
    if platform == "YouTube":
        video_id = extract_youtube_video_id(url)
        try:
            oe = httpx.get(
                "https://www.youtube.com/oembed",
                params={"url": url, "format": "json"},
                headers=_BROWSER_HEADERS,
                timeout=3.5,
            )
            if oe.status_code == 200:
                oe_json = oe.json()
                result["title"] = str(oe_json.get("title") or "")[:240]
                result["author"] = str(oe_json.get("author_name") or "")[:120]
                result["thumbnail_url"] = str(oe_json.get("thumbnail_url") or "")
                result["metadata_source"] = "title_only"
        except Exception as exc:
            logger.debug("YouTube oEmbed lookup skipped: %s", exc)

        if video_id:
            watch_details = _extract_youtube_watch_details(video_id)
            if not result["title"] and watch_details["title"]:
                result["title"] = watch_details["title"]
            if watch_details["description"]:
                result["description"] = watch_details["description"]
            if watch_details["chapters"]:
                result["chapters"] = watch_details["chapters"]
            if watch_details["transcript"]:
                result["transcript"] = watch_details["transcript"]
            if not result["thumbnail_url"] and watch_details["thumbnail_url"]:
                result["thumbnail_url"] = watch_details["thumbnail_url"]
            if watch_details["metadata_source"] != "title_only" or result["metadata_source"] == "url_only":
                result["metadata_source"] = watch_details["metadata_source"]

        if not result["description"] and result["author"]:
            result["description"] = f"Video YouTube bởi {result['author']}"
        if result["title"] or result["description"]:
            return result

    # TikTok oEmbed
    if platform == "TikTok":
        try:
            oe = httpx.get(
                "https://www.tiktok.com/oembed",
                params={"url": url},
                headers=_BROWSER_HEADERS,
                timeout=3.5,
            )
            if oe.status_code == 200:
                oe_json = oe.json()
                result["title"] = str(oe_json.get("title") or "")[:240]
                result["author"] = str(oe_json.get("author_name") or "")[:120]
                result["thumbnail_url"] = str(oe_json.get("thumbnail_url") or "")
                result["description"] = f"Video TikTok bởi {result['author']}".strip()
                result["metadata_source"] = "title_only"
                if result["title"]:
                    return result
        except Exception as exc:
            logger.debug("TikTok oEmbed lookup skipped: %s", exc)

    # Generic HTML pages / blogs / articles with manual SSRF-safe redirect checks
    current_url = url
    try:
        for _ in range(3):
            resp = httpx.get(current_url, headers=_BROWSER_HEADERS, timeout=4.0, follow_redirects=False)
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
                result["metadata_source"] = "html_page"
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
    """Step 2: Gemini 2.5 Flash NER + direct user-intent answer synthesis."""
    settings = get_settings()
    if not settings.gemini_configured:
        return None

    system_prompt = """Bạn là **GreenTrip AI** — trợ lý du lịch đa phương thức chuẩn Mindtrip AI chuyên sâu khu vực Đà Nẵng, Huế và Hội An.
Nhiệm vụ của bạn gồm 2 việc đồng thời:
(1) Nhận diện thực thể địa điểm (NER) từ metadata video YouTube / bài viết / ảnh / hóa đơn, phân biệt rõ:
    - Địa điểm CỤ THỂ có tên riêng (VD: KDL Núi Thần Tài, Nhà Hàng Muối Biển, Cầu Rồng, Phố Cổ Hội An, Vinpearl Nam Hội An).
    - Cụm từ CHUNG CHUNG chưa rõ tên cụ thể (VD: "Khách Sạn Đà Nẵng" — ghi chú rõ là mô tả không nêu tên khách sạn cụ thể).
(2) Viết `direct_answer_markdown` bằng tiếng Việt trả lời THẲNG và CHÍNH XÁC yêu cầu thật của người dùng (`USER_QUESTION`):
    - Nếu nguồn là video YouTube và `METADATA_SOURCE` là `description_and_chapters` hoặc `description_only`: mở đầu thẳng thắn, trung thực giống Mindtrip AI (VD: "Mình có thể giúp bạn liệt kê các địa điểm xuất hiện trong video. Tuy nhiên, hiện mình chỉ xem được phần mô tả + các mốc thời gian (chưa có phụ đề chi tiết từng câu), nên danh sách dưới đây là toàn bộ địa điểm được nêu rõ trong mô tả video:").
    - Nếu `METADATA_SOURCE` là `title_only`: nói rõ chỉ đọc được tiêu đề video nên mới thấy các địa điểm trên tiêu đề.
    - Trình bày danh sách đánh số `1.`, `2.`, `3.` kèm icon loại địa điểm (`📍` khu vực, `⭐` khu du lịch/tham quan, `🏨` khách sạn, `🍴` nhà hàng/quán ăn, `🌉` cầu/cảnh quan, `🏛️` di tích/phố cổ, `🏖️` biển/resort) và **IN ĐẬM `**Tên địa điểm**`** cho mỗi tên riêng để giao diện gắn liên kết trực tiếp lên bản đồ.
    - TUYỆT ĐỐI KHÔNG tự bịa thêm địa điểm không có trong dữ liệu nguồn, và KHÔNG tự bịa ràng buộc không có thật (như "đi xe máy một mình" hay "không phù hợp đi độc hành").
    - Kết thúc bằng 1 câu hỏi chốt mở A/B ngắn gọn, hữu ích theo đúng ngữ cảnh người dùng hỏi.

Trả về DUY NHẤT 1 JSON hợp lệ theo schema:
{
  "direct_answer_markdown": "Câu trả lời đầy đủ bằng tiếng Việt (markdown, có danh sách đánh số và câu hỏi chốt A/B)",
  "summary": "Tóm tắt 1-2 câu về nguồn đính kèm",
  "detected_city": "Đà Nẵng" | "Huế" | "Đà Nẵng & Huế" | null,
  "extracted_places": [
    {
      "name": "Tên địa điểm chuẩn",
      "category": "attraction" | "restaurant" | "hotel" | "area" | "heritage" | "beach",
      "city": "Đà Nẵng" | "Huế" | "Hội An",
      "is_specific": true | false,
      "timestamp": "11:03 hoặc null",
      "note": "Ghi chú ngắn (nếu chung chung thì nêu rõ mô tả không ghi tên cụ thể)"
    }
  ],
  "place_keywords": ["tối đa 10 tên địa điểm cụ thể để khớp DB và bản đồ"],
  "receipt_info": {
    "booking_type": "hotel" | "train" | "flight" | "restaurant" | "ticket" | null,
    "title": "Tên khách sạn / chuyến tàu / nhà hàng / vé tham quan",
    "date_str": "YYYY-MM-DD hoặc chuỗi ngày ngắn gọn nếu thấy trên vé",
    "time_str": "HH:MM nếu thấy trên vé",
    "city": "Đà Nẵng" | "Huế" | null,
    "estimated_cost_vnd": integer hoặc null
  }
}
Nếu không phải hóa đơn/vé đặt chỗ, đặt `receipt_info = null`. Chỉ trả JSON thuần."""

    parts: list[dict[str, Any]] = []
    text_context_lines = [
        f"ATTACHMENT_TYPE: {attachment.type}",
        f"TRIP_DESTINATION: {trip_context.destination}, DAYS: {trip_context.days_count}",
        f"USER_QUESTION: {user_message.strip() or 'Phân tích nội dung đính kèm và liệt kê các địa điểm nổi bật'}",
    ]
    if attachment.file_name:
        text_context_lines.append(f"FILE_NAME: {attachment.file_name}")
    if link_meta:
        text_context_lines.append(f"PLATFORM: {link_meta.get('platform')}")
        text_context_lines.append(f"URL: {link_meta.get('url')}")
        text_context_lines.append(f"METADATA_SOURCE: {link_meta.get('metadata_source', 'title_only')}")
        if link_meta.get("title"):
            text_context_lines.append(f"PAGE_TITLE: {link_meta['title']}")
        if link_meta.get("author"):
            text_context_lines.append(f"AUTHOR: {link_meta['author']}")
        if link_meta.get("chapters"):
            text_context_lines.append(f"VIDEO_CHAPTERS:\n{link_meta['chapters']}")
        if link_meta.get("description"):
            text_context_lines.append(f"PAGE_DESCRIPTION:\n{link_meta['description'][:3200]}")
        if link_meta.get("transcript"):
            text_context_lines.append(f"VIDEO_CAPTIONS_SNIPPET:\n{link_meta['transcript'][:2000]}")
        elif link_meta.get("snippet") and not link_meta.get("description"):
            text_context_lines.append(f"PAGE_SNIPPET:\n{link_meta['snippet'][:1000]}")
    if attachment.extracted_text:
        text_context_lines.append(f"EXTRACTED_TEXT:\n{attachment.extracted_text[:2500]}")

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
        req_payload = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {
                "temperature": 0.15,
                "maxOutputTokens": 1400,
                "responseMimeType": "application/json",
            },
        }
        resp = httpx.post(url, json=req_payload, timeout=14.0)
        if resp.status_code in (429, 503):
            time.sleep(0.6)
            resp = httpx.post(url, json=req_payload, timeout=14.0)
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
    has_dn = any(
        k in norm
        for k in (
            "da nang", "danang", "my khe", "son tra", "cau rong", "ba na",
            "ngu hanh son", "hai chau", "han river", "nui than tai", "muoi bien", "hoi an",
        )
    )
    has_hue = any(
        k in norm
        for k in (
            "hue", "dai noi", "thien mu", "song huong", "khai dinh",
            "tu duc", "dong ba", "co do", "bun bo hue",
        )
    )
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
    for anchor in _CENTRAL_VIETNAM_GEO_ANCHORS:
        if any(k in norm for k in anchor["keys"]) and anchor["name"] not in found:
            found.append(anchor["name"])
    for key, _, _ in DEFAULT_POI_COORDS_KB:
        norm_key = strip_vietnamese_accents(key).lower()
        if norm_key in norm and key not in found:
            found.append(key)
    for extra in ("bún bò", "mì quảng", "bánh xèo", "cà phê", "chay", "biển", "chùa", "lăng", "hải sản"):
        if strip_vietnamese_accents(extra).lower() in norm and extra not in found:
            found.append(extra)
    return found[:10]


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


def _normalize_city_display(raw_city: str) -> str:
    low = strip_vietnamese_accents(raw_city or "").lower().strip()
    if low in ("da nang", "danang"):
        return "Đà Nẵng"
    if low == "hue":
        return "Huế"
    if low in ("hoi an", "quang nam"):
        return "Hội An"
    return raw_city or "Đà Nẵng"


def _row_to_suggested_poi(
    row: tuple[Any, ...],
    constraints: list[str],
    idx: int,
) -> CopilotSuggestedPoiItem:
    poi_id, name, cat, sub_cat, city, addr, _, est_cost, green_score, rating, lat, lng, image_url = row
    display_city = _normalize_city_display(str(city))
    r_lat, r_lng = resolve_poi_coordinates(str(name), display_city, lat, lng, idx)
    kg_reason, eco_practices = build_kg_explanation_for_poi(
        poi_name=str(name),
        category=str(cat),
        sub_category=str(sub_cat) if sub_cat else None,
        city=display_city,
        constraints=constraints,
    )
    return CopilotSuggestedPoiItem(
        id=str(poi_id),
        name=str(name),
        category=str(cat),
        sub_category=str(sub_cat) if sub_cat else None,
        city=display_city,
        lat=r_lat,
        lng=r_lng,
        image_url=str(image_url or "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80"),
        green_score=format_green_score(green_score),
        rating=round(float(rating or 4.7), 1),
        address=str(addr or display_city),
        swap_reason=kg_reason,
        kg_explanation=kg_reason,
        eco_practices=eco_practices,
        estimated_cost=float(est_cost) if est_cost is not None else None,
    )


def _anchor_to_suggested_poi(anchor: dict[str, Any], constraints: list[str]) -> CopilotSuggestedPoiItem:
    kg_reason, eco_practices = build_kg_explanation_for_poi(
        poi_name=anchor["name"],
        category=anchor["category"],
        sub_category=None,
        city=anchor["city"],
        constraints=constraints,
    )
    return CopilotSuggestedPoiItem(
        id=anchor["id"],
        name=anchor["name"],
        category=anchor["category"],
        sub_category=None,
        city=anchor["city"],
        lat=float(anchor["lat"]),
        lng=float(anchor["lng"]),
        image_url=anchor["image_url"],
        green_score=int(anchor["green_score"]),
        rating=float(anchor["rating"]),
        address=anchor["address"],
        swap_reason=kg_reason,
        kg_explanation=kg_reason,
        eco_practices=eco_practices,
        estimated_cost=float(anchor["estimated_cost"]),
    )


def _query_matching_pois(
    connection: Connection,
    keywords: list[str],
    target_city: str,
    constraints: list[str],
    limit: int = 5,
) -> list[CopilotSuggestedPoiItem]:
    """Step 3: 1-to-1 Entity Linking per extracted place (PostGIS public.pois first, then verified geo-anchors)."""
    city_codes = ["DANANG", "HUE"]
    if target_city == "Đà Nẵng":
        city_codes = ["DANANG"]
    elif target_city == "Huế":
        city_codes = ["HUE"]

    rows: list[tuple[Any, ...]] = []
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    p.poi_id::text,
                    p.name,
                    c.name AS category,
                    p.sub_category,
                    ci.name AS city,
                    COALESCE(p.address, '') AS address,
                    COALESCE(p.description, '') AS description,
                    p.estimated_cost,
                    p.green_score,
                    p.satisfaction_score,
                    ST_Y(p.geom::geometry) AS latitude,
                    ST_X(p.geom::geometry) AS longitude,
                    p.image_url
                FROM public.pois p
                JOIN public.poi_categories c ON p.category_id = c.category_id
                JOIN public.cities ci ON p.city_id = ci.city_id
                WHERE ci.code = ANY(%s)
                ORDER BY p.green_score DESC NULLS LAST, p.satisfaction_score DESC NULLS LAST
                LIMIT 350
                """,
                (city_codes,),
            )
            rows = cursor.fetchall()
    except Exception as exc:
        logger.warning("POI query for attachment grounding fell back cleanly: %s", exc)
        rows = []

    prepared_rows: list[tuple[str, str, tuple[Any, ...]]] = []
    for row in rows:
        name_norm = strip_vietnamese_accents(str(row[1])).lower().strip()
        haystack = strip_vietnamese_accents(f"{row[1]} {row[2]} {row[3] or ''} {row[5]} {row[6]}").lower()
        prepared_rows.append((name_norm, haystack, row))

    results: list[CopilotSuggestedPoiItem] = []
    used_ids: set[str] = set()
    used_names: set[str] = set()

    # Pass 1: Resolve 1 exact/strong entity per extracted keyword in video order
    for kw_raw in keywords:
        if len(results) >= limit:
            break
        kw = strip_vietnamese_accents(kw_raw or "").lower().strip()
        if len(kw) < 3:
            continue

        # 1a. Strong DB POI name match (prevents "Cầu Rồng" from matching "Sena homestay Cầu Rồng")
        best_db: tuple[float, str, tuple[Any, ...]] | None = None
        for name_norm, _, row in prepared_rows:
            poi_id = str(row[0])
            if poi_id in used_ids:
                continue
            if name_norm == kw:
                cand_score = 120.0
            elif (kw in name_norm or name_norm in kw) and min(len(kw), len(name_norm)) / max(len(kw), len(name_norm), 1) >= 0.45:
                cand_score = 95.0 - abs(len(name_norm) - len(kw)) * 0.5
            else:
                continue
            if best_db is None or cand_score > best_db[0]:
                best_db = (cand_score, name_norm, row)

        if best_db is not None:
            _, name_norm, row = best_db
            poi_item = _row_to_suggested_poi(row, constraints, len(results))
            results.append(poi_item)
            used_ids.add(poi_item.id)
            used_names.add(name_norm)
            continue

        # 1b. Verified Central Vietnam geo-anchor match (e.g. Núi Thần Tài, Nhà Hàng Muối Biển, Phố Cổ Hội An, Vinpearl)
        for anchor in _CENTRAL_VIETNAM_GEO_ANCHORS:
            if anchor["id"] in used_ids:
                continue
            anchor_norm = strip_vietnamese_accents(anchor["name"]).lower()
            if any(anchor_norm in ex or ex in anchor_norm for ex in used_names):
                continue
            if any(key in kw or kw in key for key in anchor["keys"]):
                poi_item = _anchor_to_suggested_poi(anchor, constraints)
                results.append(poi_item)
                used_ids.add(poi_item.id)
                used_names.add(anchor_norm)
                break

    # Pass 2: Broad DB haystack matches if slots remain
    if len(results) < min(3, limit) and prepared_rows:
        norm_keywords = [strip_vietnamese_accents(k).lower().strip() for k in keywords if k and len(k.strip()) >= 3]
        broad_scored: list[tuple[float, tuple[Any, ...]]] = []
        for name_norm, haystack, row in prepared_rows:
            if str(row[0]) in used_ids:
                continue
            g_val = float(row[8] or 0.75)
            score = g_val * (10.0 if g_val <= 1.0 else 0.1) + float(row[9] or 4.5) * 2.0
            matched_any = False
            for kw in norm_keywords:
                if kw in name_norm:
                    score += 50.0
                    matched_any = True
                elif kw in haystack:
                    score += 20.0
                    matched_any = True
            if matched_any or not norm_keywords:
                broad_scored.append((score, row))
        broad_scored.sort(key=lambda item: item[0], reverse=True)
        for _, row in broad_scored:
            if len(results) >= min(3, limit):
                break
            poi_item = _row_to_suggested_poi(row, constraints, len(results))
            results.append(poi_item)
            used_ids.add(poi_item.id)

    return results[:limit]


def _build_deterministic_video_reply(
    link_meta: dict[str, str] | None,
    detected_city: str,
    suggested_pois: list[CopilotSuggestedPoiItem],
) -> str:
    """Clean Mindtrip-style fallback reply when Gemini API is unavailable."""
    platform = link_meta["platform"] if link_meta else "Bài viết du lịch"
    title_display = (link_meta.get("title") if link_meta else "") or "đường dẫn bạn vừa gửi"
    chapters = [line.strip() for line in (link_meta.get("chapters") or "").splitlines() if line.strip()] if link_meta else []
    source_kind = link_meta.get("metadata_source", "title_only") if link_meta else "url_only"

    if platform == "YouTube" and chapters:
        chapter_lines = "\n".join(f"{idx}. 📍 **{line}**" for idx, line in enumerate(chapters[:12], start=1))
        poi_section = ""
        if suggested_pois:
            bullets = "\n".join(format_three_layer_poi_bullet(p) for p in suggested_pois)
            poi_section = f"\n\n**Các điểm đã khớp tọa độ lên bản đồ:**\n{bullets}"
        return (
            f"Mình đã đọc xong phần mô tả và các mốc thời gian của video **YouTube** (*{title_display[:110]}*). "
            f"Hiện mình đọc dựa trên mô tả + mốc thời gian (chưa có phụ đề chi tiết từng câu):\n\n"
            f"**Các mục / địa điểm có trong video:**\n{chapter_lines}"
            f"{poi_section}\n\n"
            f"Bạn muốn mình **A — Gom các điểm này thành lịch trình {detected_city} tối ưu theo tuyến gần nhau**, "
            f"hay **B — Gợi ý thêm quán ăn & trải nghiệm xanh gần từng điểm trên**?"
        )

    bullets = "\n".join(format_three_layer_poi_bullet(p) for p in suggested_pois)
    scope_note = (
        " *(lưu ý: video này không công khai mô tả chi tiết nên mình đối chiếu dựa trên tiêu đề video)*"
        if platform == "YouTube" and source_kind == "title_only"
        else ""
    )
    return (
        f"Mình đã đọc xong đường dẫn từ **{platform}** (*{title_display[:100]}*){scope_note} "
        f"và đối chiếu với bản đồ du lịch xanh **{detected_city}**.\n\n"
        f"**Các địa điểm khớp nhất đã ghim lên bản đồ:**\n"
        f"{bullets if bullets else f'- Gợi ý cụm trải nghiệm bản địa tại **{detected_city}** ít đông đúc và dễ ghép tuyến.'}\n\n"
        f"Bạn muốn mình **A — Gom ngay các điểm này vào lịch trình mới theo cụm gần nhau**, "
        f"hay **B — Chỉ lưu vào kho Ý tưởng để bạn tự chọn ngày**?"
    )


def _format_source_memory_payload(
    attachment: CopilotAttachmentPayload,
    link_meta: dict[str, str] | None,
    gemini_result: dict[str, Any] | None,
    suggested_pois: list[CopilotSuggestedPoiItem],
) -> str:
    """Serialize compact source context into trip_memory so follow-up turns never forget the video/file."""
    extracted = gemini_result.get("extracted_places") if isinstance(gemini_result, dict) else None
    places_compact: list[str] = []
    if isinstance(extracted, list):
        for item in extracted[:15]:
            if isinstance(item, dict) and item.get("name"):
                ts = f" ({item['timestamp']})" if item.get("timestamp") else ""
                note = f" — {item['note']}" if item.get("note") else ""
                places_compact.append(f"{item['name']}{ts}{note}")
    if not places_compact and link_meta and link_meta.get("chapters"):
        places_compact = [c.strip() for c in link_meta["chapters"].splitlines()[:12] if c.strip()]
    if not places_compact:
        places_compact = [p.name for p in suggested_pois]

    payload = {
        "type": attachment.type,
        "platform": link_meta.get("platform") if link_meta else (attachment.file_name or attachment.type),
        "title": (link_meta.get("title") if link_meta else "") or (attachment.file_name or ""),
        "url": attachment.url or "",
        "metadata_source": link_meta.get("metadata_source") if link_meta else attachment.type,
        "places": places_compact[:15],
    }
    return json.dumps(payload, ensure_ascii=False)[:1800]


def is_attached_source_followup(request: CopilotChatRequest) -> bool:
    """Detect when the user asks a follow-up question about a previously attached video/link/file."""
    if request.attachment is not None:
        return False
    source_mem = (request.trip_context.trip_memory or {}).get("attached_source")
    if not source_mem:
        return False
    folded = strip_vietnamese_accents(request.message or "").lower()
    return any(marker in folded for marker in _FOLLOWUP_SOURCE_MARKERS)


def answer_attached_source_followup(
    request: CopilotChatRequest,
    connection: Connection,
) -> CopilotChatResponse:
    """Answer follow-up turns about a previously attached link/video using saved trip_memory."""
    raw_mem = (request.trip_context.trip_memory or {}).get("attached_source", "")
    try:
        source_info = json.loads(raw_mem) if raw_mem.startswith("{") else {"title": raw_mem, "places": []}
    except Exception:
        source_info = {"title": raw_mem, "places": []}

    title = str(source_info.get("title") or "nội dung bạn vừa đính kèm")
    platform = str(source_info.get("platform") or "nguồn đính kèm")
    places = [str(p) for p in (source_info.get("places") or []) if str(p).strip()]
    source_kind = str(source_info.get("metadata_source") or "description_and_chapters")
    ctx = request.trip_context
    constraints = extract_persistent_constraints(request.message or "", ctx)

    keywords = [re.sub(r"\s*[—(].*$", "", p).strip() for p in places] or _extract_fallback_keywords(title)
    detected_city = _detect_city_from_text(f"{title} {' '.join(places)}", ctx.destination)
    suggested_pois = _query_matching_pois(
        connection=connection,
        keywords=keywords,
        target_city=detected_city,
        constraints=constraints,
        limit=5,
    )

    if places:
        numbered = "\n".join(f"{idx}. 📍 **{place}**" for idx, place in enumerate(places, start=1))
        scope_text = (
            "Dựa trên phần mô tả và các mốc thời gian đã trích xuất từ"
            if "description" in source_kind
            else "Dựa trên thông tin đã trích xuất từ"
        )
        reply_text = (
            f"{scope_text} **{platform}** (*{title[:100]}*), toàn bộ các địa điểm được nhắc tới gồm:\n\n"
            f"{numbered}\n\n"
            f"Bạn muốn mình **A — Sắp xếp các điểm này thành lịch trình {ctx.days_count} ngày theo cụm gần nhau**, "
            f"hay **B — Bổ sung thêm quán ăn bản địa & điểm xanh gần từng địa điểm trên**?"
        )
    else:
        reply_text = _build_deterministic_video_reply(
            {"platform": platform, "title": title, "metadata_source": source_kind, "chapters": ""},
            detected_city,
            suggested_pois,
        )

    raw_resp = CopilotChatResponse(
        reply_text=reply_text,
        intent="attachment_followup",
        intent_category="POI_RECOMMENDATION",
        reasoning_trace=(
            f"1. Truy hồi ngữ cảnh đính kèm từ trip_memory ({platform}: {title[:60]}).\n"
            f"2. Tổng hợp {len(places)} địa điểm đã nhận diện & khớp {len(suggested_pois)} thẻ bản đồ."
        ),
        recommended_poi_ids=[p.id for p in suggested_pois],
        detected_constraints=constraints,
        suggested_pois=suggested_pois,
        action_type="add_stop" if suggested_pois else "none",
        next_suggested_prompts=[
            f"Sắp xếp các địa điểm này thành lịch trình {ctx.days_count} ngày",
            "Gợi ý quán ăn ngon gần các địa điểm trong video",
            "Cách di chuyển xanh giữa các điểm này",
        ],
        green_impact_summary=f"Đã đồng bộ toàn bộ địa điểm từ {platform} lên bản đồ {detected_city}.",
    )
    finalized = finalize_copilot_response(raw_resp, ctx, constraints, connection=connection)
    finalized.trip_memory["attached_source"] = raw_mem
    return finalized


def process_copilot_attachment(
    request: CopilotChatRequest,
    connection: Connection,
) -> CopilotChatResponse:
    """Handle Mindtrip-style '+' attachments: Upload a file, Add a link, or Add a receipt."""
    attachment = request.attachment
    assert attachment is not None

    ctx = request.trip_context
    constraints = extract_persistent_constraints(request.message or "", ctx)

    # Step 1: Metadata Extraction (oEmbed + YouTube watch shortDescription/chapters + optional captions)
    link_meta: dict[str, str] | None = None
    if attachment.type == "link" and attachment.url:
        link_meta = fetch_link_metadata(attachment.url)

    # Step 2: LLM NER + User-Intent Direct Answer
    gemini_result = _analyze_attachment_with_gemini(
        attachment=attachment,
        user_message=request.message or "",
        trip_context=ctx,
        link_meta=link_meta,
    )

    extracted_names: list[str] = []
    if gemini_result and isinstance(gemini_result.get("extracted_places"), list):
        for place in gemini_result["extracted_places"]:
            if isinstance(place, dict) and place.get("name") and place.get("is_specific", True):
                extracted_names.append(str(place["name"]).strip())

    combined_signal_text = " ".join(
        filter(
            None,
            [
                request.message,
                attachment.file_name,
                attachment.extracted_text,
                link_meta.get("title") if link_meta else None,
                link_meta.get("chapters") if link_meta else None,
                link_meta.get("description") if link_meta else None,
                link_meta.get("snippet") if link_meta else None,
                str(gemini_result.get("summary") or "") if gemini_result else None,
                " ".join(gemini_result.get("place_keywords") or []) if gemini_result else None,
                " ".join(extracted_names),
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
        keywords.extend(str(k).strip() for k in gemini_result["place_keywords"] if str(k).strip())
    for name in extracted_names:
        if name not in keywords:
            keywords.append(name)
    for fb_kw in _extract_fallback_keywords(combined_signal_text):
        if fb_kw not in keywords:
            keywords.append(fb_kw)
    keywords = keywords[:12]

    # Step 3: PostGIS Entity Linking + Central Vietnam Geo-Anchors
    effective_ctx = ctx.model_copy(update={"destination": detected_city})
    suggested_pois = _query_matching_pois(
        connection=connection,
        keywords=keywords,
        target_city=detected_city,
        constraints=constraints,
        limit=5,
    )

    updated_outline: list[dict[str, Any]] | None = None
    mutation_summary: list[str] = []
    action_type = "add_stop" if suggested_pois else "none"
    intent_category: Any = "POI_RECOMMENDATION"
    intent = f"attachment_{attachment.type}"
    direct_md = (
        str(gemini_result.get("direct_answer_markdown") or "").strip()
        if isinstance(gemini_result, dict)
        else ""
    )

    # Step 4: Synthesize Interactive Response
    if attachment.type == "link":
        platform = link_meta["platform"] if link_meta else detect_link_platform(attachment.url or "")
        source_kind = link_meta.get("metadata_source", "title_only") if link_meta else "url_only"
        if direct_md and len(direct_md) >= 40:
            ab_fallback = (
                f"Bạn muốn mình **A — Gom các địa điểm này thành lịch trình {ctx.days_count} ngày theo cụm gần nhau**, "
                f"hay **B — Gợi ý thêm quán ăn bản địa & trải nghiệm xanh gần từng điểm**?"
            )
            reply_text = ensure_closing_ab_hook(direct_md, ab_fallback)
        else:
            reply_text = _build_deterministic_video_reply(link_meta, detected_city, suggested_pois)

        next_prompts = [
            f"Xếp các điểm từ {platform} này thành lịch trình {ctx.days_count} ngày",
            f"Gợi ý thêm quán ăn bản địa gần các điểm này ở {detected_city}",
            "Ước tính chi phí và phương tiện di chuyển xanh cho tuyến này",
        ]
        reasoning_trace = (
            f"1. Metadata ({platform}, source={source_kind}): Đã trích xuất tiêu đề, mô tả & mốc thời gian an toàn (SSRF-guarded).\n"
            f"2. NER địa điểm: {keywords[:8] or ['du lịch xanh miền Trung']} -> Khu vực: {detected_city}.\n"
            f"3. Entity Linking & PostGIS Map Pinning: Ghim thành công {len(suggested_pois)} địa điểm có tọa độ thật lên bản đồ."
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
        bullets = "\n".join(format_three_layer_poi_bullet(p) for p in suggested_pois[:3])

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
        if direct_md and len(direct_md) >= 40:
            ab_fallback = (
                f"Bạn muốn mình **A — Ghép ngay các điểm này vào lịch trình {ctx.days_count} ngày**, "
                f"hay **B — Tìm thêm góc chụp / quán bản địa cùng phong cách nhưng ít đông hơn**?"
            )
            reply_text = ensure_closing_ab_hook(direct_md, ab_fallback)
        else:
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
            f"2. NER địa điểm: {keywords[:8] or ['phong cảnh & trải nghiệm xanh']} -> Khu vực: {detected_city}.\n"
            f"3. Entity Linking & PostGIS Map Pinning: Ghim thành công {len(suggested_pois)} thẻ POI thật lên bản đồ."
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
        green_impact_summary=f"Đã đối chiếu & ghim {len(suggested_pois)} địa điểm lên bản đồ du lịch xanh {detected_city}.",
        updated_itinerary_state=updated_outline,
        mutation_summary=mutation_summary,
    )
    finalized = finalize_copilot_response(
        raw_resp,
        effective_ctx,
        constraints,
        connection=connection,
    )
    finalized.trip_memory["attached_source"] = _format_source_memory_payload(
        attachment=attachment,
        link_meta=link_meta,
        gemini_result=gemini_result,
        suggested_pois=suggested_pois,
    )
    if link_meta and link_meta.get("title"):
        finalized.trip_memory["attached_source_title"] = link_meta["title"][:160]
    return finalized
