"""FreshLab edge API — a thin hardware gateway on the Raspberry Pi.

Rules for this service (see CLAUDE.md):
  * expose physical I/O only: read sensors, switch relays
  * no schedules, thresholds, users, payments or any business decisions
  * the cloud decides *when*; the edge only does *what it is told*
"""
from __future__ import annotations

import logging
import secrets
import threading
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .config import Settings, get_settings
from .nano import NanoError, NanoLink

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("freshlab.edge")

VERSION = "0.1.0"


class RelayCommand(BaseModel):
    on: bool
    # Auto-off after N seconds. The Nano also enforces its own hard cap.
    max_seconds: int | None = Field(default=None, ge=1, le=3600)


def _poller(link: NanoLink, interval: float, stop: threading.Event):
    while not stop.is_set():
        try:
            if link.firmware is None:
                link.ping()
            link.read()
        except NanoError as exc:
            log.warning("poll failed: %s", exc)
        stop.wait(interval)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    link = NanoLink(settings.serial_port, settings.baud, settings.command_timeout_s)
    stop = threading.Event()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        t = threading.Thread(target=_poller, args=(link, settings.poll_interval_s, stop), daemon=True)
        t.start()
        yield
        stop.set()
        try:
            link.all_off()
        except NanoError:
            pass

    app = FastAPI(title="FreshLab Edge", version=VERSION, lifespan=lifespan)
    app.state.link = link
    app.state.settings = settings

    def auth(authorization: str = Header(default="")):
        if not settings.api_token:
            return
        expected = f"Bearer {settings.api_token}"
        if not secrets.compare_digest(authorization, expected):
            raise HTTPException(401, "invalid token")

    def channel_of(name: str) -> int:
        if name not in settings.relays:
            raise HTTPException(404, f"unknown relay '{name}'")
        return settings.relays[name]

    def relay_view(bits: list[bool]):
        return [
            {"name": n, "channel": ch, "on": bits[ch] if ch < len(bits) else None}
            for n, ch in settings.relays.items()
        ]

    def hw(fn, *args):
        try:
            return fn(*args)
        except NanoError as exc:
            raise HTTPException(503, f"nano unavailable: {exc}") from exc

    @app.get("/health")
    def health():
        r = link.last_reading
        return {
            "ok": True,
            "version": VERSION,
            "nano_connected": link.connected,
            "firmware": link.firmware,
            "last_read_at": r.read_at if r else None,
            "last_error": link.last_error,
        }

    @app.get("/v1/sensors", dependencies=[Depends(auth)])
    def sensors(fresh: bool = False):
        """Latest raw sensor values. `fresh=true` forces a read from the Nano."""
        r = hw(link.read) if fresh or link.last_reading is None else link.last_reading
        return {
            "temperature_c": r.temperature_c,
            "humidity_pct": r.humidity_pct,
            "soil_raw": r.soil_raw,  # 0..1023, calibration is done in the cloud
            "read_at": r.read_at,
        }

    @app.get("/v1/relays", dependencies=[Depends(auth)])
    def relays():
        return {"relays": relay_view(hw(link.state))}

    @app.post("/v1/relays/all-off", dependencies=[Depends(auth)])
    def all_off():
        hw(link.all_off)
        return {"relays": relay_view(hw(link.state))}

    @app.post("/v1/relays/{name}", dependencies=[Depends(auth)])
    def set_relay(name: str, body: RelayCommand):
        ch = channel_of(name)
        reply = hw(link.set_relay, ch, body.on, body.max_seconds)
        log.info("relay %s(ch%d) -> %s (%s)", name, ch, body.on, reply)
        return {"name": name, "channel": ch, "on": body.on, "nano": reply}

    return app


app = create_app()
