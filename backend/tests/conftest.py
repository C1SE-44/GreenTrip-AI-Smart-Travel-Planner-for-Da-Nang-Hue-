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
