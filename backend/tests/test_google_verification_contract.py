from types import SimpleNamespace
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import pytest
from google.auth.exceptions import TransportError
from google.oauth2 import id_token
from google.auth.transport import requests as transport
from app.auth import service


def test_google_verifier_bounds_clock_skew_and_certificate_timeout(monkeypatch):
    monkeypatch.setattr(service,'get_settings',lambda:SimpleNamespace(GOOGLE_CLIENT_ID='configured-client'))
    calls=[]
    monkeypatch.setattr(transport,'Request',lambda:lambda *a,**kw:calls.append(kw))
    def verify(token,request,**kwargs):
        assert kwargs=={'audience':'configured-client','clock_skew_in_seconds':30}
        request('https://certificates.test',method='GET')
        return {'iss':'https://accounts.google.com','email':'qa@example.test','sub':'qa'}
    monkeypatch.setattr(id_token,'verify_oauth2_token',verify)
    assert service.verify_google_token('test-only')['google_id']=='qa'
    assert calls[0]['timeout']==8


def test_certificate_network_error_is_not_reported_as_invalid_token(monkeypatch):
    monkeypatch.setattr(service,'get_settings',lambda:SimpleNamespace(GOOGLE_CLIENT_ID='configured-client'))
    def failed(*args,**kwargs):raise TransportError('offline')
    monkeypatch.setattr(id_token,'verify_oauth2_token',failed)
    with pytest.raises(service.AuthServiceUnavailable):service.verify_google_token('test-only')


def test_expired_or_wrong_audience_token_is_still_rejected(monkeypatch):
    monkeypatch.setattr(service,'get_settings',lambda:SimpleNamespace(GOOGLE_CLIENT_ID='configured-client'))
    def failed(*args,**kwargs):raise ValueError('Wrong recipient')
    monkeypatch.setattr(id_token,'verify_oauth2_token',failed)
    assert service.verify_google_token('test-only') is None
