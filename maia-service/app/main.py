"""HTTP layer. Run with: uvicorn --factory app.main:create_app"""

from __future__ import annotations

import hmac
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Callable

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from .policy import MoveScorer, policy
from .request import INVALID_FEN, MAX_BODY_BYTES, parse_policy_request

log = logging.getLogger("maia-service")

_FROM_ENV = object()


def _default_scorer() -> MoveScorer:
    from .maia2_scorer import Maia2Scorer

    allow = os.environ.get("MAIA_ALLOW_DOWNLOAD") == "1"
    return Maia2Scorer(allow_download=allow)


def _read_token(token: object) -> str | None:
    if token is _FROM_ENV:
        token = os.environ.get("MAIA_TOKEN")
    if token is None:
        return None
    if not isinstance(token, str) or not token.strip():
        # Set but blank is a mistake, not "auth off". Refuse to start.
        raise RuntimeError("MAIA_TOKEN is set but blank; unset it or give it a value")
    return token


def _error(code: str, status: int, headers: dict[str, str] | None = None):
    return JSONResponse({"error": code}, status_code=status, headers=headers)


def create_app(
    scorer_factory: Callable[[], MoveScorer] | None = None,
    token: object = _FROM_ENV,
) -> FastAPI:
    expected = _read_token(token)
    expected_bytes = expected.encode() if expected else None
    factory = scorer_factory or _default_scorer

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        started = time.perf_counter()
        # Loaded once, here. A failure stops the process before it serves.
        app.state.scorer = factory()
        log.warning(
            "model %s loaded in %.1f s; auth %s",
            app.state.scorer.model_name,
            time.perf_counter() - started,
            "on" if expected else "off",
        )
        yield

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    def authorized(request: Request) -> bool:
        if expected_bytes is None:
            return True
        # The scheme is case-insensitive (RFC 7235); the token is not.
        scheme, _, got = request.headers.get("authorization", "").partition(" ")
        if scheme.lower() != "bearer":
            return False
        return hmac.compare_digest(got.encode(), expected_bytes)

    async def read_capped(request: Request) -> bytes | None:
        chunks: list[bytes] = []
        size = 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > MAX_BODY_BYTES:
                return None
            chunks.append(chunk)
        return b"".join(chunks)

    @app.get("/health")
    async def health():
        return {"ok": True, "model": app.state.scorer.model_name}

    @app.post("/v1/policy")
    async def policy_route(request: Request):
        started = time.perf_counter()
        if not authorized(request):
            return _error("unauthorized", 401, {"WWW-Authenticate": "Bearer"})
        raw = await read_capped(request)
        if raw is None:
            return _error(INVALID_FEN, 400)
        parsed = parse_policy_request(raw)
        if isinstance(parsed, str):
            return _error(parsed, 400)
        scorer: MoveScorer = app.state.scorer
        moves = await run_in_threadpool(
            policy, scorer, parsed.board, parsed.elo_self, parsed.elo_oppo
        )
        return {
            "moves": [{"uci": m.uci, "p": m.p} for m in moves],
            "model": scorer.model_name,
            "ms": round((time.perf_counter() - started) * 1000),
        }

    @app.exception_handler(Exception)
    async def internal(request: Request, exc: Exception):
        log.exception("unhandled error on %s", request.url.path)
        return _error("internal", 500)

    return app
