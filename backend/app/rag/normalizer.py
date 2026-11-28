"""Document loading and normalization pipeline for GreenTrip RAG."""

from __future__ import annotations

import csv
import json
import logging
import re
from pathlib import Path
from typing import Any

from app.rag.schemas import DocumentChunk

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_DATA_DIR = _PROJECT_ROOT / "data"

MAX_CHUNK_CHARS = 600
MIN_CHUNK_CHARS = 60


def _str_val(val: Any) -> str:
    """Safely convert string or list of strings/items to clean string."""
    if val is None:
        return ""
    if isinstance(val, str):
        return val.strip()
    if isinstance(val, (list, tuple)):
        parts: list[str] = []
        for x in val:
            if isinstance(x, str):
                parts.append(x.strip())
            elif isinstance(x, dict):
                sub_name = x.get("name", "")
                sub_desc = x.get("description", "")
                if sub_name and sub_desc:
                    parts.append(f"{sub_name}: {sub_desc}")
                elif sub_name:
                    parts.append(sub_name)
            else:
                parts.append(str(x))
        return ", ".join(parts)
    return str(val).strip()


def _split_into_chunks(text: str, max_chars: int = MAX_CHUNK_CHARS) -> list[str]:
    """Split long descriptive text into clean, sentence-aware chunks."""
    cleaned = re.sub(r"\s+", " ", text).strip()
    if not cleaned:
        return []
    if len(cleaned) <= max_chars:
        return [cleaned]

    sentences = re.split(r"(?<=[.!?])\s+", cleaned)
    chunks: list[str] = []
    current_chunk: list[str] = []
    current_len = 0

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        if current_len + len(sentence) > max_chars and current_chunk:
            chunks.append(" ".join(current_chunk))
            current_chunk = [sentence]
            current_len = len(sentence)
        else:
            current_chunk.append(sentence)
            current_len += len(sentence) + 1

    if current_chunk:
        chunks.append(" ".join(current_chunk))

    return chunks


def load_curated_travel_knowledge(data_dir: Path | None = None) -> list[DocumentChunk]:
    """Ingest and normalize verified Central Vietnam travel datasets into structured chunks."""
    base_dir = data_dir or _DATA_DIR
    chunks: list[DocumentChunk] = []

    # 1. Ingest NotebookLM POIs (Rich cultural and heritage descriptions)
    notebooklm_path = base_dir / "raw" / "notebooklm_pois.csv"
    if notebooklm_path.exists():
        try:
            with open(notebooklm_path, "r", encoding="utf-8") as f:
                reader = csv.reader(f)
                header = next(reader, None)
                for idx, row in enumerate(reader):
                    if len(row) < 5:
                        continue
                    name = row[0].strip()
                    city = row[1].strip()
                    category = row[2].strip()
                    address = row[3].strip()
                    desc = row[4].strip()
                    if not desc or len(desc) < MIN_CHUNK_CHARS:
                        continue

                    text_content = f"{name} ({city}) - {category}. Địa chỉ: {address}. Mô tả: {desc}"
                    sub_chunks = _split_into_chunks(text_content)
                    for c_idx, chunk_text in enumerate(sub_chunks):
                        chunks.append(
                            DocumentChunk(
                                chunk_id=f"notebooklm_{idx}_{c_idx}",
                                doc_id=f"notebooklm_{idx}",
                                title=name,
                                city=city,
                                category=category,
                                content=chunk_text,
                                source="data/raw/notebooklm_pois.csv",
                                metadata={"address": address, "original_category": category},
                            )
                        )
        except Exception as e:
            logger.warning("Failed to load notebooklm_pois.csv: %s", e)

    # 2. Ingest 60 Eco Places (Eco highlights, activities, transport tips)
    eco_60_path = base_dir / "raw" / "eco_places_danang_hue_60.json"
    if eco_60_path.exists():
        try:
            with open(eco_60_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    for idx, item in enumerate(data):
                        name = _str_val(item.get("name", ""))
                        city = _str_val(item.get("city", ""))
                        category = _str_val(item.get("db_category", item.get("category", "Sinh thái")))
                        desc = _str_val(item.get("description", ""))
                        eco_hl = item.get("eco_highlights", [])
                        eco_str = _str_val(eco_hl)
                        transport = _str_val(item.get("transport_tip", ""))
                        best_time = _str_val(item.get("best_time", ""))

                        composite_parts = [f"{name} ({city}) - {category}."]
                        if desc:
                            composite_parts.append(f"Mô tả: {desc}")
                        if eco_str:
                            composite_parts.append(f"Đặc điểm xanh: {eco_str}.")
                        if transport:
                            composite_parts.append(f"Phương tiện di chuyển xanh: {transport}.")
                        if best_time:
                            composite_parts.append(f"Thời điểm lý tưởng: {best_time}.")

                        full_text = " ".join(composite_parts)
                        sub_chunks = _split_into_chunks(full_text)
                        for c_idx, chunk_text in enumerate(sub_chunks):
                            chunks.append(
                                DocumentChunk(
                                    chunk_id=f"eco60_{idx}_{c_idx}",
                                    doc_id=item.get("id", f"eco_{idx}"),
                                    title=name,
                                    city=city,
                                    category=category,
                                    content=chunk_text,
                                    source="data/raw/eco_places_danang_hue_60.json",
                                    metadata={
                                        "eco_highlights": eco_hl,
                                        "transport_tip": transport,
                                        "best_time": best_time,
                                    },
                                )
                            )
        except Exception as e:
            logger.warning("Failed to load eco_places_danang_hue_60.json: %s", e)

    # 3. Ingest Food & Beverage Phase 1 (Vegetarian, specialties, culinary culture)
    fb_path = base_dir / "raw" / "food_beverage_danang_hue_phase1.json"
    if fb_path.exists():
        try:
            with open(fb_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    for idx, item in enumerate(data):
                        name = _str_val(item.get("name", ""))
                        city = _str_val(item.get("city", ""))
                        category = _str_val(item.get("sub_category", "Ẩm thực"))
                        menu_items = item.get("menu_items", [])
                        menu_str = _str_val(menu_items)
                        is_veg = bool(item.get("is_vegetarian_friendly", False))
                        is_zero = bool(item.get("is_zero_waste_friendly", False))
                        eco_hl = item.get("eco_highlights", [])
                        eco_str = _str_val(eco_hl)

                        composite_parts = [f"{name} ({city}) - {category}."]
                        if menu_str:
                            composite_parts.append(f"Món đặc trưng: {menu_str}.")
                        if is_veg:
                            composite_parts.append("Phục vụ món chay / thuần thực vật.")
                        if is_zero:
                            composite_parts.append("Hạn chế rác thải nhựa / ưu tiên nguyên liệu địa phương.")
                        if eco_str:
                            composite_parts.append(f"Điểm xanh: {eco_str}.")

                        full_text = " ".join(composite_parts)
                        sub_chunks = _split_into_chunks(full_text)
                        for c_idx, chunk_text in enumerate(sub_chunks):
                            chunks.append(
                                DocumentChunk(
                                    chunk_id=f"fb_{idx}_{c_idx}",
                                    doc_id=item.get("id", f"fb_{idx}"),
                                    title=name,
                                    city=city,
                                    category="Ẩm thực",
                                    content=chunk_text,
                                    source="data/raw/food_beverage_danang_hue_phase1.json",
                                    metadata={
                                        "is_vegetarian": is_veg,
                                        "menu_items": menu_items,
                                    },
                                )
                            )
        except Exception as e:
            logger.warning("Failed to load food_beverage_danang_hue_phase1.json: %s", e)

    # 4. Ingest Nature & Heritage Phase 2
    nh_path = base_dir / "raw" / "nature_heritage_danang_hue_phase2.json"
    if nh_path.exists():
        try:
            with open(nh_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    for idx, item in enumerate(data):
                        name = _str_val(item.get("name", ""))
                        city = _str_val(item.get("city", ""))
                        category = _str_val(item.get("db_category", item.get("category", "Di sản")))
                        seasonal = _str_val(item.get("seasonal_note", ""))
                        transport = _str_val(item.get("transport_tip", ""))
                        eco_str = _str_val(item.get("eco_highlights", []))

                        composite_parts = [f"{name} ({city}) - {category}."]
                        if seasonal:
                            composite_parts.append(f"Lưu ý thời tiết / mùa: {seasonal}.")
                        if transport:
                            composite_parts.append(f"Di chuyển: {transport}.")
                        if eco_str:
                            composite_parts.append(f"Điểm nổi bật: {eco_str}.")

                        full_text = " ".join(composite_parts)
                        sub_chunks = _split_into_chunks(full_text)
                        for c_idx, chunk_text in enumerate(sub_chunks):
                            chunks.append(
                                DocumentChunk(
                                    chunk_id=f"nh_{idx}_{c_idx}",
                                    doc_id=item.get("id", f"nh_{idx}"),
                                    title=name,
                                    city=city,
                                    category=category,
                                    content=chunk_text,
                                    source="data/raw/nature_heritage_danang_hue_phase2.json",
                                    metadata={"seasonal_note": seasonal, "transport_tip": transport},
                                )
                            )
        except Exception as e:
            logger.warning("Failed to load nature_heritage_danang_hue_phase2.json: %s", e)

    # 5. Ingest Curated Eco Stays 160
    stays_path = base_dir / "processed" / "curated_stays_160.csv"
    if stays_path.exists():
        try:
            with open(stays_path, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for idx, row in enumerate(reader):
                    name = _str_val(row.get("name", ""))
                    city = _str_val(row.get("city", ""))
                    address = _str_val(row.get("address", ""))
                    label = _str_val(row.get("eco_label", "Cơ sở lưu trú xanh"))
                    desc = _str_val(row.get("description", ""))
                    if not name:
                        continue
                    content = f"{name} ({city}) - {label}. Địa chỉ: {address}. {desc}"
                    sub_chunks = _split_into_chunks(content)
                    for c_idx, chunk_text in enumerate(sub_chunks):
                        chunks.append(
                            DocumentChunk(
                                chunk_id=f"stay_{idx}_{c_idx}",
                                doc_id=row.get("stay_id", f"stay_{idx}"),
                                title=name,
                                city=city,
                                category="Lưu trú",
                                content=chunk_text,
                                source="data/processed/curated_stays_160.csv",
                                metadata={"eco_label": label, "address": address},
                            )
                        )
        except Exception as e:
            logger.warning("Failed to load curated_stays_160.csv: %s", e)

    logger.info("Loaded and normalized %d RAG chunks from curated datasets.", len(chunks))
    return chunks
