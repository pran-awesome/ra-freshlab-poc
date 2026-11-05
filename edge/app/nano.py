"""Serial link to the Arduino Nano. Speaks docs/protocol.md, nothing more."""
from __future__ import annotations

import logging
import random
import threading
import time
from dataclasses import dataclass, field

log = logging.getLogger("freshlab.edge.nano")


class NanoError(RuntimeError):
    pass


@dataclass
class Reading:
    temperature_c: float | None
    humidity_pct: float | None
    soil_raw: int | None
    relays: list[bool]
    read_at: float = field(default_factory=time.time)


def _num(v: str) -> float | None:
    return None if v.lower() == "nan" else float(v)


def parse_kv(payload: str) -> dict[str, str]:
    return dict(p.split("=", 1) for p in payload.split() if "=" in p)


def parse_relay_bits(bits: str) -> list[bool]:
    return [b == "1" for b in bits]


class FakeSerial:
    """In-memory Nano simulator implementing the same line protocol."""

    def __init__(self, relays: int = 4):
        self.state = [False] * relays
        self._out: list[bytes] = [b"EVT BOOT fw=mock\n"]
        self.is_open = True

    def write(self, data: bytes) -> int:
        for line in data.decode().strip().splitlines():
            self._out.append((self._handle(line.split()) + "\n").encode())
        return len(data)

    def _handle(self, parts: list[str]) -> str:
        cmd = parts[0] if parts else ""
        bits = "".join("1" if s else "0" for s in self.state)
        if cmd == "PING":
            return f"OK PONG fw=mock relays={len(self.state)}"
        if cmd == "READ":
            t = 27.0 + random.uniform(-0.5, 0.5)
            h = 65.0 + random.uniform(-2, 2)
            soil = 600 + random.randint(-20, 20)
            return f"OK T={t:.1f} H={h:.1f} SOIL={soil} R={bits}"
        if cmd == "STATE":
            return f"OK R={bits}"
        if cmd == "RELAY" and len(parts) >= 3:
            ch = int(parts[1])
            if not 0 <= ch < len(self.state):
                return "ERR bad_channel"
            self.state[ch] = parts[2] == "1"
            return f"OK RELAY {ch} {parts[2]}" + (" max_s=0" if self.state[ch] else "")
        if cmd == "ALLOFF":
            self.state = [False] * len(self.state)
            return "OK ALLOFF"
        return "ERR unknown_command"

    def readline(self) -> bytes:
        return self._out.pop(0) if self._out else b""

    def reset_input_buffer(self):
        self._out.clear()

    def close(self):
        self.is_open = False


class NanoLink:
    """Thread-safe request/response over serial, with lazy (re)connect."""

    def __init__(self, port: str, baud: int = 115200, timeout_s: float = 2.0):
        self.port, self.baud, self.timeout_s = port, baud, timeout_s
        self._ser = None
        self._lock = threading.Lock()
        self.firmware: str | None = None
        self.last_reading: Reading | None = None
        self.last_error: str | None = None

    # -- connection ---------------------------------------------------------
    def _open(self):
        if self.port == "mock":
            self._ser = FakeSerial()
        else:
            import serial  # pyserial

            self._ser = serial.Serial(self.port, self.baud, timeout=self.timeout_s)
            # Opening the port toggles DTR which resets the Nano; give the
            # bootloader time to hand over before we talk to it.
            time.sleep(2.0)
        self._ser.reset_input_buffer()
        log.info("serial open on %s", self.port)

    def _close(self):
        try:
            if self._ser:
                self._ser.close()
        finally:
            self._ser = None

    @property
    def connected(self) -> bool:
        return self._ser is not None

    # -- protocol -----------------------------------------------------------
    def command(self, line: str) -> str:
        """Send one command; return payload after 'OK '. Raises NanoError."""
        with self._lock:
            try:
                if self._ser is None:
                    self._open()
                self._ser.write((line + "\n").encode())
                deadline = time.monotonic() + self.timeout_s
                while time.monotonic() < deadline:
                    raw = self._ser.readline().decode(errors="replace").strip()
                    if not raw:
                        continue
                    if raw.startswith("EVT"):
                        log.warning("nano event: %s", raw)
                        continue
                    if raw.startswith("OK"):
                        self.last_error = None
                        return raw[2:].strip()
                    if raw.startswith("ERR"):
                        raise NanoError(raw[3:].strip() or "error")
                    log.debug("ignoring line: %s", raw)
                raise TimeoutError(f"no reply to {line!r}")
            except NanoError:
                raise
            except Exception as exc:  # serial gone, timeout, ...
                self.last_error = str(exc)
                self._close()
                raise NanoError(f"serial: {exc}") from exc

    def ping(self) -> str:
        payload = self.command("PING")
        self.firmware = parse_kv(payload).get("fw")
        return payload

    def read(self) -> Reading:
        kv = parse_kv(self.command("READ"))
        r = Reading(
            temperature_c=_num(kv.get("T", "nan")),
            humidity_pct=_num(kv.get("H", "nan")),
            soil_raw=int(kv["SOIL"]) if "SOIL" in kv else None,
            relays=parse_relay_bits(kv.get("R", "")),
        )
        self.last_reading = r
        return r

    def state(self) -> list[bool]:
        return parse_relay_bits(parse_kv(self.command("STATE")).get("R", ""))

    def set_relay(self, channel: int, on: bool, max_seconds: int | None = None) -> str:
        cmd = f"RELAY {channel} {1 if on else 0}"
        if on and max_seconds:
            cmd += f" {int(max_seconds)}"
        return self.command(cmd)

    def all_off(self) -> str:
        return self.command("ALLOFF")
