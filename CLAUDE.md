# CLAUDE.md — rules for working in this repo

Read `HANDOFF.md` first for current status, then `docs/architecture.md`.

## The architectural rule (do not break)

- **Business logic lives only in `cloud/api/src/core/`.** Schedules, thresholds,
  soil % calibration, auth, cabinet flow, logging, anything that decides *when/why*.
- **`edge/` is a thin hardware gateway.** It maps relay names → channels, talks the
  serial protocol, polls sensors, checks a bearer token. Nothing else. Do not add
  schedules, thresholds, users or databases to it.
- **`firmware/` is dumb I/O + hardware safety** (max-on caps, watchdog, boot OFF).
- The Raspberry Pi never drives loads directly (no GPIO to relays). Only USB to the Nano.

If you are unsure where code goes: "would this change if the product changed?" → cloud.

## Cross-layer contracts (change together, in one commit)

| Contract | Files |
|---|---|
| Serial protocol | `firmware/nano/freshlab_nano/freshlab_nano.ino`, `edge/app/nano.py` (incl. `FakeSerial`), `docs/protocol.md` |
| Edge HTTP API | `edge/app/main.py`, `cloud/api/src/adapters/http-edge.ts`, `cloud/api/src/adapters/fake-edge.ts`, `cloud/api/src/core/ports.ts` |
| Pin map | firmware `#define`s / `RELAY_PINS`, `docs/hardware.md`, `EDGE_RELAYS` defaults |

## Cloud portability rules

- `core/` and `http/` must not import Node built-ins (`node:*`, `fs`, `process`). They run on Workers too.
- Runtime-specific code goes in `adapters/` (e.g. `file-store.ts` is Node only) and `entry/`.
- New storage = new `Store` adapter. New platform = new `entry/*.ts` calling `build(env, store)`.
- Scheduling = `service.tick()` once a minute; must stay idempotent.

## Commands

```bash
# edge
cd edge && python -m pytest -q                       # uses EDGE_SERIAL_PORT=mock internally
docker compose -f docker-compose.dev.yml up --build  # simulated Nano on :8080
# cloud
cd cloud/api && npm test && npm run typecheck && npm run build
cd cloud/web && npm run build
EDGE_URL=mock ADMIN_PASSWORD=pw npm run dev --prefix cloud/api   # cloud with fake edge
```
Firmware: no local compiler needed; CI compiles it (`arduino/compile-sketches`).

## Gotchas

- Opening the serial port resets the Nano; `NanoLink._open` waits 2 s. Don't remove it.
- Edge must run with **one** uvicorn worker (one process owns the serial port).
- The edge poll (5 s) is also the Nano's heartbeat; the Nano switches all relays off after 60 s of silence.
- Phase 1 customer auth is mocked on purpose (any username/password, verify always passes). Admin uses `ADMIN_PASSWORD`.
- `serveStatic` in `entry/node.ts` needs a **relative** `WEB_DIR`.
- Times in schedules are local to `TZ_NAME` (default `Asia/Bangkok`).

## Keep HANDOFF.md current

When you finish a piece of work, update the "Status" and "Next steps" sections of `HANDOFF.md`.
