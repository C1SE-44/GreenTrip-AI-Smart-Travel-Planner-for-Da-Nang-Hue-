import io
from pathlib import Path
import sys

from PIL import Image

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from scripts.audit_and_migrate_poi_images import (  # noqa: E402
    build_public_storage_url,
    build_storage_headers,
    clean_poi_media,
    optimize_image_to_webp,
    select_replacement_url,
)


def test_optimize_image_to_webp_resizes_large_image() -> None:
    buf = io.BytesIO()
    Image.new("RGB", (2400, 1600), color=(34, 139, 34)).save(buf, format="JPEG")

    webp_bytes = optimize_image_to_webp(buf.getvalue(), max_width=1200, quality=80)
    with Image.open(io.BytesIO(webp_bytes)) as converted:
        assert converted.format == "WEBP"
        assert converted.size == (1200, 800)


def test_build_public_storage_url_and_headers() -> None:
    url = build_public_storage_url("https://demo.supabase.co/", "poi-images", "/abc.webp")
    assert url == "https://demo.supabase.co/storage/v1/object/public/poi-images/abc.webp"

    new_key_headers = build_storage_headers("sb_secret_test_key")
    assert new_key_headers == {"apikey": "sb_secret_test_key"}

    legacy_headers = build_storage_headers("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9")
    assert legacy_headers["Authorization"].startswith("Bearer eyJ")


def test_clean_poi_media_promotes_alive_gallery_and_falls_back_when_all_dead() -> None:
    fallback = select_replacement_url("Hồ Xanh Sơn Trà", "Cảnh quan và thiên nhiên")

    promoted_img, promoted_gal, changed = clean_poi_media(
        poi_name="Chợ Đông Ba",
        image_url="https://dead.example/1.jpg",
        gallery_urls=["https://dead.example/2.jpg", "https://alive.example/3.jpg"],
        url_status={
            "https://dead.example/1.jpg": False,
            "https://dead.example/2.jpg": False,
            "https://alive.example/3.jpg": True,
        },
        fallback_url=fallback,
    )
    assert changed is True
    assert promoted_img == "https://alive.example/3.jpg"
    assert promoted_gal == ["https://alive.example/3.jpg"]

    repaired_img, repaired_gal, changed2 = clean_poi_media(
        poi_name="Hồ Xanh Sơn Trà",
        image_url="https://dead.example/a.jpg",
        gallery_urls=["https://dead.example/a.jpg"],
        url_status={"https://dead.example/a.jpg": False},
        fallback_url=fallback,
    )
    assert changed2 is True
    assert repaired_img == fallback
    assert repaired_gal == [fallback]

    # Filters unrelated Thien Mu Pagoda image when POI is Chợ Bến Ngự
    market_img, market_gal, changed3 = clean_poi_media(
        poi_name="Chợ Bến Ngự",
        image_url="https://upload.wikimedia.org/wikipedia/commons/e/ec/Hue_Market_Produce.jpg",
        gallery_urls=["https://upload.wikimedia.org/wikipedia/commons/8/88/ThienMuPagoda.jpg"],
        url_status={
            "https://upload.wikimedia.org/wikipedia/commons/e/ec/Hue_Market_Produce.jpg": False,
            "https://upload.wikimedia.org/wikipedia/commons/8/88/ThienMuPagoda.jpg": True,
        },
        fallback_url="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1000&q=80",
    )
    assert changed3 is True
    assert "ThienMuPagoda" not in market_img
    assert market_gal == [market_img]
