"""Edge settings, all from environment variables (see .env.example)."""
from __future__ import annotations

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="EDGE_", extra="ignore")

    # Serial device of the Nano. "mock" = simulated Nano (dev / CI).
    serial_port: str = "/dev/ttyUSB0"
    baud: int = 115200
    command_timeout_s: float = 2.0
    # Background READ poll. Also acts as the heartbeat that keeps the Nano's
    # host watchdog (60 s) from tripping, so keep it well below 60.
    poll_interval_s: float = 5.0

    # Bearer token the cloud must send. Empty = auth disabled (dev only!).
    api_token: str = ""

    # name:channel pairs. Names are what the API exposes.
    relays: dict[str, int] = {"door": 0, "pump": 1, "light": 2, "fan": 3}

    @field_validator("relays", mode="before")
    @classmethod
    def _parse_relays(cls, v):
        # Accept "door:0,pump:1" in addition to JSON.
        if isinstance(v, str) and not v.strip().startswith("{"):
            out = {}
            for part in v.split(","):
                if part.strip():
                    name, ch = part.split(":")
                    out[name.strip()] = int(ch)
            return out
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
