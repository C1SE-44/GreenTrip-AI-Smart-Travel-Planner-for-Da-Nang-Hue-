from pathlib import Path
import sys
from unittest.mock import MagicMock, patch

import pytest

BACKEND_DIR = str(Path(__file__).resolve().parents[1])
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.cache import poi_cache
from app.rate_limit import rate_limiter


@pytest.fixture(autouse=True)
def reset_rate_limiter_state():
    """Keep sliding-window rate limits and POI caches isolated across test cases."""
    rate_limiter.reset()
    poi_cache.reset()
    yield
    rate_limiter.reset()
    poi_cache.reset()


@pytest.fixture(autouse=True)
def prevent_real_smtp_connections():
    """
    Global safety guard for all test suites:
    Prevents tests from opening real network connections to SMTP servers (e.g. Gmail)
    or dispatching real emails to actual user inboxes.
    """
    with patch("smtplib.SMTP") as mock_smtp:
        mock_instance = MagicMock()
        mock_smtp.return_value.__enter__.return_value = mock_instance
        yield mock_smtp


@pytest.fixture(autouse=True)
def prevent_real_neo4j_connections():
    """
    Global safety guard for all test suites:
    Prevents tests from blocking on external Neo4j Aura network connections.
    """
    with patch("app.db.neo4j.get_driver", return_value=None):
        yield
