# RA FreshLab PoC

Automated fresh-vegetable cabinet: door lock, watering, light and fan,
controlled from the cloud through a Raspberry Pi and an Arduino Nano.

```
cloud/      business logic + web UI (TypeScript, Hono, React). VPS first, serverless-ready.
edge/       Raspberry Pi hardware API (Python FastAPI, Docker, Cloudflare Tunnel). No business logic.
firmware/   Arduino Nano sketch: DHT22 + soil sensor reads, 4 relays, safety timers.
docs/       architecture, serial protocol, wiring, deployment guides.
```

| Read this | For |
|---|---|
| [HANDOFF.md](HANDOFF.md) | current status, what's done / next, how to pick the project up |
| [CLAUDE.md](CLAUDE.md) | rules for AI agents and contributors working in this repo |
| [docs/architecture.md](docs/architecture.md) | how the pieces fit and why |
| [docs/protocol.md](docs/protocol.md) | Pi ⇄ Nano serial commands |
| [docs/hardware.md](docs/hardware.md) | pin map, wiring, flashing the Nano |
| [docs/deploy-pi.md](docs/deploy-pi.md) | Pi setup, Docker, Cloudflare Tunnel |
| [docs/deploy-cloud.md](docs/deploy-cloud.md) | VPS / serverless deployment, local dev |

## Quick start without hardware

```bash
# edge with a simulated Nano
docker compose -f edge/docker-compose.dev.yml up --build -d        # :8080, token dev-token

# cloud pointing at it
cd cloud/api && npm i && EDGE_URL=http://localhost:8080 EDGE_API_TOKEN=dev-token ADMIN_PASSWORD=pw npm run dev
cd cloud/web && npm i && npm run dev                                 # http://localhost:5173  (/admin, password pw)
```

## Tests
```bash
cd edge && pip install -r requirements-dev.txt && python -m pytest -q
cd cloud/api && npm test && npm run typecheck
```
CI (`.github/workflows/ci.yml`) also compiles the firmware and builds the arm64 edge image.

Successor of [Prototype-fruit-selling-machine](https://github.com/pran-awesome/Prototype-fruit-selling-machine) (Phase 1 mock, everything on the Pi).
