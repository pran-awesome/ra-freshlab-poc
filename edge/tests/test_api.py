from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

TOKEN = "test-token"


def client():
    s = Settings(serial_port="mock", api_token=TOKEN, poll_interval_s=0.05)
    return TestClient(create_app(s), headers={"Authorization": f"Bearer {TOKEN}"})


def test_health_is_public():
    with client() as c:
        r = c.get("/health", headers={"Authorization": ""})
        assert r.status_code == 200 and r.json()["ok"]


def test_auth_required():
    with client() as c:
        assert c.get("/v1/sensors", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_sensors_fresh():
    with client() as c:
        body = c.get("/v1/sensors?fresh=true").json()
        assert 20 < body["temperature_c"] < 35
        assert isinstance(body["soil_raw"], int)


def test_relay_on_off():
    with client() as c:
        assert c.post("/v1/relays/pump", json={"on": True, "max_seconds": 30}).status_code == 200
        relays = {r["name"]: r["on"] for r in c.get("/v1/relays").json()["relays"]}
        assert relays["pump"] is True and relays["door"] is False
        c.post("/v1/relays/all-off")
        relays = {r["name"]: r["on"] for r in c.get("/v1/relays").json()["relays"]}
        assert not any(relays.values())


def test_unknown_relay():
    with client() as c:
        assert c.post("/v1/relays/nope", json={"on": True}).status_code == 404


def test_relay_env_parsing():
    s = Settings(relays="lock:0,pump:1")
    assert s.relays == {"lock": 0, "pump": 1}
