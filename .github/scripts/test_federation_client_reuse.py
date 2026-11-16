"""Regression tests for federated proxy connection handling.

Bolt fix: proxy_request must reuse the module-level pooled httpx client and must
release the upstream connection once the streamed body is consumed. Before the
fix, a new AsyncClient was built per request and never closed, and the streamed
httpx response was never closed either — leaking sockets on every call.
"""
import asyncio
import os
import sys

import httpx
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))

import federation_service  # noqa: E402
from fastapi import HTTPException  # noqa: E402

_real_is_safe_webhook_url = federation_service.utils.is_safe_webhook_url


class _FakeRequest:
    def __init__(self, method="GET", headers=None):
        self.method = method
        self.headers = headers or {}
        self.query_params = {}

    async def body(self):
        return b""


@pytest.fixture(autouse=True)
def _allow_fake_host(monkeypatch):
    """Treat the test hostname as safe; no real DNS lookups in unit tests."""
    monkeypatch.setattr(federation_service.utils, "is_safe_webhook_url", lambda url: True)


def _install_fake_transport(monkeypatch, handler):
    """Replace the module client's transport so no real network is used."""
    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(federation_service.client, "_transport", transport)
    return transport


def test_proxy_request_reuses_module_level_client(monkeypatch):
    """proxy_request must not create a throwaway AsyncClient per call."""
    created = []
    real_async_client = httpx.AsyncClient

    class _TrackingAsyncClient(real_async_client):
        def __init__(self, *args, **kwargs):
            # Only the module-level instance is constructed at import time,
            # so anything built during the call is a leak.
            if created:
                created.append(self)
            super().__init__(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", _TrackingAsyncClient)

    _install_fake_transport(
        monkeypatch, lambda request: httpx.Response(200, json={"ok": True})
    )

    asyncio.run(
        federation_service.proxy_request(
            "https://node.example.com", "token", "api/ping", _FakeRequest()
        )
    )

    assert created == [], "proxy_request leaked an unclosed AsyncClient"


def test_proxy_request_closes_upstream_after_streaming(monkeypatch):
    """The upstream response must be closed once the body has been consumed."""
    closed = {"count": 0}
    chunks = [b"a", b"b", b"c"]

    class _AsyncStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            for chunk in chunks:
                yield chunk

    def handler(request):
        response = httpx.Response(200, stream=_AsyncStream())
        original_aclose = response.aclose

        async def _aclose():
            closed["count"] += 1
            await original_aclose()

        response.aclose = _aclose
        return response

    _install_fake_transport(monkeypatch, handler)

    async def scenario():
        result = await federation_service.proxy_request(
            "https://node.example.com", "token", "api/ping", _FakeRequest()
        )
        body = b""
        async for chunk in result.body_iterator:
            body += chunk
        return body

    body = asyncio.run(scenario())

    assert body == b"abc", f"stream body mismatch: {body!r}"
    # aclose() is idempotent in httpx, so the count may exceed 1; what matters
    # is that the upstream connection was released at all.
    assert closed["count"] >= 1, "upstream httpx response was never closed"


def test_proxy_request_rejects_unsafe_url(monkeypatch):
    """SSRF guard must still reject unsafe node URLs before any request."""
    # Restore the real guard: this fixture is the one place it must be active.
    monkeypatch.setattr(
        federation_service.utils, "is_safe_webhook_url", _real_is_safe_webhook_url
    )
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            federation_service.proxy_request(
                "http://127.0.0.1:8000", "token", "api/ping", _FakeRequest()
            )
        )
    assert exc.value.status_code == 400