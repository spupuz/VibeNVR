"""Security regression tests for the centralized COOKIE_SECURE policy.

The `Secure` flag on the HttpOnly `auth_token` / `media_token` cookies must be
derived from one place (``auth_service.resolve_cookie_secure``) so password
login, session bootstrap and SSO/OAuth login cannot drift apart. Behind the
bundled Nginx frontend the request reaches uvicorn over plain HTTP, so the
``X-Forwarded-Proto`` header is what tells us the client used HTTPS.
"""

import os
from types import SimpleNamespace

import pytest

import auth_service


def make_request(forwarded_proto=None, scheme="http"):
    headers = {}
    if forwarded_proto is not None:
        headers["x-forwarded-proto"] = forwarded_proto
    return SimpleNamespace(headers=headers, url=SimpleNamespace(scheme=scheme))


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    monkeypatch.delenv("COOKIE_SECURE", raising=False)


def test_auto_default_is_secure_when_proxy_terminated_https():
    """TLS terminated by the Nginx frontend: scheme is http, header says https."""
    request = make_request(forwarded_proto="https", scheme="http")
    assert auth_service.resolve_cookie_secure(request) is True


def test_auto_is_secure_when_served_over_tls_directly():
    request = make_request(forwarded_proto=None, scheme="https")
    assert auth_service.resolve_cookie_secure(request) is True


def test_auto_is_not_secure_on_plain_http():
    request = make_request(forwarded_proto="http", scheme="http")
    assert auth_service.resolve_cookie_secure(request) is False


def test_auto_is_not_secure_without_any_header():
    request = make_request(forwarded_proto=None, scheme="http")
    assert auth_service.resolve_cookie_secure(request) is False


@pytest.mark.parametrize("forwarded_proto", ["https, http", "HTTPS", " https "])
def test_auto_handles_multi_proxy_header_variants(forwarded_proto):
    request = make_request(forwarded_proto=forwarded_proto, scheme="http")
    assert auth_service.resolve_cookie_secure(request) is True


def test_auto_ignores_non_https_proto_values():
    request = make_request(forwarded_proto="ws", scheme="http")
    assert auth_service.resolve_cookie_secure(request) is False


@pytest.mark.parametrize("value", ["true", "1", "yes", "on", "TRUE"])
def test_explicit_enable_forces_secure_on_plain_http(monkeypatch, value):
    monkeypatch.setenv("COOKIE_SECURE", value)
    request = make_request(forwarded_proto="http", scheme="http")
    assert auth_service.resolve_cookie_secure(request) is True


@pytest.mark.parametrize("value", ["false", "0", "no", "off", "FALSE"])
def test_explicit_disable_forces_insecure_even_on_https(monkeypatch, value):
    monkeypatch.setenv("COOKIE_SECURE", value)
    request = make_request(forwarded_proto="https", scheme="https")
    assert auth_service.resolve_cookie_secure(request) is False


def test_cookie_setters_share_the_single_policy():
    """Guard against reintroducing per-route cookie security logic."""
    backend_dir = os.path.join(os.path.dirname(__file__), "..", "..", "backend")
    for relative in ("routers/auth.py", "routers/oauth.py"):
        with open(os.path.join(backend_dir, relative), "r", encoding="utf-8") as handle:
            source = handle.read()
        assert 'request.url.scheme == "https"' not in source, (
            f"{relative} must use auth_service.resolve_cookie_secure instead of "
            "reading the request scheme directly"
        )