import io
import os
import re
import unicodedata
import urllib.parse
from datetime import datetime
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.trips.schemas import TripItineraryResponse

# Font candidates supporting Vietnamese Unicode diacritics
FONT_CANDIDATES = [
    # Linux standard paths (Render / Ubuntu / Debian / Alpine)
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
    ("/usr/share/fonts/truetype/freefont/FreeSans.ttf", "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"),
    ("/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf", "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf"),
    ("/usr/share/fonts/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"),
    ("/usr/share/fonts/liberation-sans/LiberationSans-Regular.ttf", "/usr/share/fonts/liberation-sans/LiberationSans-Bold.ttf"),
    ("/usr/local/share/fonts/dejavu/DejaVuSans.ttf", "/usr/local/share/fonts/dejavu/DejaVuSans-Bold.ttf"),
    # Windows standard paths
    ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"),
    ("C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/segoeuib.ttf"),
    ("C:/Windows/Fonts/times.ttf", "C:/Windows/Fonts/timesbd.ttf"),
    # macOS standard paths
    ("/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
    ("/Library/Fonts/Arial.ttf", "/Library/Fonts/Arial Bold.ttf"),
]

_UNICODE_FONT_REGISTERED = False
_REGULAR_FONT_NAME = "Helvetica"
_BOLD_FONT_NAME = "Helvetica-Bold"


def _clean_for_pdf(text: Any) -> str:
    """Format string for PDF display. Preserves full Vietnamese Unicode when TTF is active; gracefully transliterates only if fallback font is active."""
    if text is None:
        return ""
    val = str(text)
    if _UNICODE_FONT_REGISTERED:
        return val
    # Fallback only when running on bare OS without any Unicode TTF fonts
    nfkd = unicodedata.normalize("NFKD", val)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).replace("đ", "d").replace("Đ", "D")


def _ensure_unicode_fonts() -> tuple[str, str]:
    """Register and return TTF fonts with full Vietnamese Unicode support."""
    global _UNICODE_FONT_REGISTERED, _REGULAR_FONT_NAME, _BOLD_FONT_NAME

    if _UNICODE_FONT_REGISTERED:
        return _REGULAR_FONT_NAME, _BOLD_FONT_NAME

    for reg_path, bold_path in FONT_CANDIDATES:
        if os.path.exists(reg_path):
            try:
                pdfmetrics.registerFont(TTFont("GT-Unicode", reg_path))
                if os.path.exists(bold_path):
                    pdfmetrics.registerFont(TTFont("GT-Unicode-Bold", bold_path))
                    _BOLD_FONT_NAME = "GT-Unicode-Bold"
                else:
                    _BOLD_FONT_NAME = "GT-Unicode"
                _REGULAR_FONT_NAME = "GT-Unicode"
                _UNICODE_FONT_REGISTERED = True
                break
            except Exception:
                continue

    return _REGULAR_FONT_NAME, _BOLD_FONT_NAME


class NumberedCanvas(canvas.Canvas):
    """Two-pass canvas to dynamically compute and print 'Trang X / Y' and GreenTrip footer."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._saved_page_states: list[dict[str, Any]] = []

    def showPage(self) -> None:
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self) -> None:
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count: int) -> None:
        reg_font, _ = _ensure_unicode_fonts()
        self.saveState()
        self.setFont(reg_font, 8)
        self.setFillColor(colors.HexColor("#6B7280"))

        # Footer divider line
        self.setStrokeColor(colors.HexColor("#E5E7EB"))
        self.setLineWidth(0.75)
        self.line(36, 32, 559, 32)

        # Footer metadata
        footer_text = "GreenTrip AI — Nền tảng thiết kế hành trình du lịch xanh tại Đà Nẵng–Huế"
        page_text = f"Trang {self._pageNumber} / {page_count}"
        self.drawString(36, 20, footer_text)
        self.drawRightString(559, 20, page_text)
        self.restoreState()


def sanitize_pdf_filename(title: str) -> tuple[str, str]:
    """
    Generate (ascii_filename, content_disposition_header_value).
    Protects Starlette / Uvicorn from latin-1 header encoding errors while preserving full Vietnamese filename.
    """
    # 1. ASCII fallback for standard filename
    nfkd = unicodedata.normalize("NFKD", title)
    ascii_clean = nfkd.encode("ASCII", "ignore").decode("ASCII")
    ascii_clean = re.sub(r"[^\w\s-]", "", ascii_clean)
    ascii_clean = re.sub(r"[\s_]+", "_", ascii_clean).strip("_")
    ascii_filename = f"GreenTrip_{ascii_clean or 'Itinerary'}.pdf"

    # 2. UTF-8 encoded filename for modern browsers (RFC 5987)
    utf8_clean = re.sub(r"[^\w\s-]", "", title, flags=re.UNICODE).strip()
    utf8_clean = re.sub(r"[\s_]+", "_", utf8_clean)
    utf8_filename = f"GreenTrip_{utf8_clean or 'Itinerary'}.pdf"
    encoded_utf8 = urllib.parse.quote(utf8_filename)

    header_val = f'attachment; filename="{ascii_filename}"; filename*=UTF-8\'\'{encoded_utf8}'
    return ascii_filename, header_val


def format_category_name(cat: str | None) -> str:
    if not cat:
        return "Điểm đến"
    c = cat.lower()
    if "quan" in c or "an" in c or "ẩm thực" in c or "food" in c:
        return "Quán ăn"
    if "di tích" in c or "lăng" in c or "đại nội" in c:
        return "Di tích"
    if "chùa" in c or "chua" in c:
        return "Chùa"
    if "biển" in c or "cảnh quan" in c:
        return "Cảnh quan"
    return cat.capitalize()


def generate_itinerary_pdf(itinerary: TripItineraryResponse) -> bytes:
    """Generate professional, publication-quality A4 PDF of trip itinerary."""
    reg_font, bold_font = _ensure_unicode_fonts()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=45,
    )

    styles = getSampleStyleSheet()

    # Typography styles
    brand_style = ParagraphStyle(
        "BrandHeader",
        fontName=bold_font,
        fontSize=10,
        textColor=colors.HexColor("#065F46"),
        leading=12,
        spaceAfter=4,
    )
    title_style = ParagraphStyle(
        "TripTitle",
        fontName=bold_font,
        fontSize=20,
        textColor=colors.HexColor("#111827"),
        leading=24,
        spaceAfter=6,
    )
    subtitle_style = ParagraphStyle(
        "TripSubtitle",
        fontName=reg_font,
        fontSize=10,
        textColor=colors.HexColor("#4B5563"),
        leading=14,
        spaceAfter=12,
    )
    section_title_style = ParagraphStyle(
        "SectionTitle",
        fontName=bold_font,
        fontSize=12,
        textColor=colors.HexColor("#065F46"),
        leading=16,
        spaceAfter=6,
    )
    cell_bold_style = ParagraphStyle(
        "CellBold",
        fontName=bold_font,
        fontSize=9,
        textColor=colors.HexColor("#111827"),
        leading=12,
    )
    cell_regular_style = ParagraphStyle(
        "CellRegular",
        fontName=reg_font,
        fontSize=8.5,
        textColor=colors.HexColor("#374151"),
        leading=11,
    )
    cell_dim_style = ParagraphStyle(
        "CellDim",
        fontName=reg_font,
        fontSize=7.5,
        textColor=colors.HexColor("#6B7280"),
        leading=10,
    )
    badge_style = ParagraphStyle(
        "BadgeText",
        fontName=bold_font,
        fontSize=8,
        textColor=colors.HexColor("#047857"),
        leading=10,
    )

    story: list[Any] = []

    # 1. Header Banner
    story.append(Paragraph("GREENTRIP AI • SMART TRAVEL PLANNER", brand_style))
    story.append(Paragraph(itinerary.title or "Hành trình Du lịch Đà Nẵng & Huế", title_style))

    dest = itinerary.destination or "Đà Nẵng & Huế"
    start_d = itinerary.start_date or "Chưa định ngày"
    total_stops = sum(len(d.stops) for d in itinerary.days)
    story.append(
        Paragraph(
            f"Điểm đến: <b>{dest}</b> &nbsp;•&nbsp; Khởi hành: <b>{start_d}</b> &nbsp;•&nbsp; "
            f"Thời gian: <b>{itinerary.days_count} ngày</b> &nbsp;•&nbsp; Quy mô: <b>{total_stops} điểm dừng</b>",
            subtitle_style,
        )
    )

    # 2. Green Tourism Summary Box
    total_duration_minutes = sum(s.duration_minutes or 0 for d in itinerary.days for s in d.stops)
    hours_part = total_duration_minutes // 60
    mins_part = total_duration_minutes % 60
    duration_display = f"{hours_part}h {mins_part}p" if hours_part > 0 else (f"{mins_part} phút" if mins_part > 0 else "Linh hoạt")

    eco_summary_data = [
        [
            Paragraph("<b>Chỉ số Du lịch Xanh & Bền vững</b>", section_title_style),
            Paragraph(f"<b>Thời lượng dự kiến:</b> ~{duration_display}", badge_style),
        ],
        [
            Paragraph(
                "• Lộ trình ưu tiên giao thông phát thải thấp, xe điện và tuyến phố đi bộ ven sông.<br/>"
                "• Ưu tiên di sản văn hóa, ẩm thực bản địa và doanh nghiệp du lịch xanh miền Trung.",
                cell_regular_style,
            ),
            Paragraph(
                "• Giờ tham quan phân bổ khoa học, tránh khung giờ nắng gắt và điểm đông đúc.<br/>"
                "• Tuyến đường giữa các điểm dừng được tối ưu hóa theo khoảng cách di chuyển thực tế.",
                cell_regular_style,
            ),
        ],
    ]
    eco_table = Table(eco_summary_data, colWidths=[270, 253])
    eco_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F0FDF4")),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#BBF7D0")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(eco_table)
    story.append(Spacer(1, 14))

    # 3. Day-by-Day Itinerary Schedule
    for day in itinerary.days:
        day_date_str = f" ({day.date})" if day.date else ""
        day_title = day.title or f"Khám phá {dest}"
        day_banner_text = f"NGÀY {day.day_number}{day_date_str}: {day_title.upper()} — ({len(day.stops)} ĐIỂM DỪNG)"

        day_banner = Table(
            [[Paragraph(f"<b>{day_banner_text}</b>", ParagraphStyle("DB", fontName=bold_font, fontSize=9.5, textColor=colors.white))]],
            colWidths=[523],
        )
        day_banner.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#065F46")),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ]
            )
        )
        story.append(day_banner)

        if not day.stops:
            empty_table = Table(
                [[Paragraph("<i>Chưa có điểm dừng nào được xếp trong ngày này.</i>", cell_dim_style)]],
                colWidths=[523],
            )
            empty_table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F9FAFB")),
                        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
                        ("PADDING", (0, 0), (-1, -1), 8),
                    ]
                )
            )
            story.append(empty_table)
            story.append(Spacer(1, 10))
            continue

        table_rows = [
            [
                Paragraph("<b>#</b>", cell_bold_style),
                Paragraph("<b>Thời gian</b>", cell_bold_style),
                Paragraph("<b>Điểm đến & Địa chỉ</b>", cell_bold_style),
                Paragraph("<b>Phân loại</b>", cell_bold_style),
                Paragraph("<b>Ghi chú</b>", cell_bold_style),
            ]
        ]

        for idx, stop in enumerate(day.stops, start=1):
            time_display = ""
            if stop.start_time and stop.end_time:
                time_display = f"{stop.start_time} - {stop.end_time}"
            elif stop.duration_minutes:
                time_display = f"~{stop.duration_minutes} phút"
            else:
                time_display = "Tự do"

            poi_cell = [Paragraph(f"<b>{stop.title}</b>", cell_bold_style)]
            if stop.address:
                poi_cell.append(Paragraph(stop.address, cell_dim_style))
            elif stop.city:
                poi_cell.append(Paragraph(f"TP. {stop.city}", cell_dim_style))

            cat_display = format_category_name(stop.category)
            notes_display = stop.comment or "Ưu tiên tham quan sinh thái & bền vững"

            table_rows.append(
                [
                    Paragraph(str(idx), cell_bold_style),
                    Paragraph(time_display, cell_regular_style),
                    poi_cell,
                    Paragraph(cat_display, cell_regular_style),
                    Paragraph(notes_display, cell_dim_style),
                ]
            )

        stops_table = Table(
            table_rows,
            colWidths=[24, 75, 204, 70, 150],
            repeatRows=1,
        )
        stops_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F3F4F6")),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#D1D5DB")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("LEFTPADDING", (0, 0), (-1, -1), 4),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(stops_table)
        story.append(Spacer(1, 12))

    doc.build(story, canvasmaker=NumberedCanvas)
    return buffer.getvalue()
