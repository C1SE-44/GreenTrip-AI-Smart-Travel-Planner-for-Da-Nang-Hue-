import pytest
from unittest.mock import MagicMock, patch


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
