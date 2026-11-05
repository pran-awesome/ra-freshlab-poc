# Architecture

## Layers and the one rule

| Layer | Runs on | Knows about | Must NOT contain |
|---|---|---|---|
| `firmware/nano` | Arduino Nano | pins, ADC, relay channels, safety caps | names, schedules, thresholds, network |
| `edge` | Raspberry Pi 4, Docker | serial protocol, relay **names**, bearer token | schedules, users, soil %, "should I water?" |
| `cloud` | VPS (→ serverless) | everything else: users, cabinet flow, schedules, calibration, logs, UI | serial/GPIO details |

The rule: **the cloud decides *when* and *why*; the edge and Nano only do *what*.**
If a change needs a decision ("water if soil < 40%"), it goes in `cloud/api/src/core`.

The only logic allowed below the cloud is **hardware safety** (relay max-on caps,
watchdog all-off, relays off at boot). Those protect the hardware when the
network or cloud is down; they never make product decisions.

## Request path (open cabinet)

```
phone ─POST /api/cabinet/open─▶ cloud (checks verified JWT, logs event)
      ─POST https://edge.<domain>/v1/relays/door {on:true,max_seconds:5}─▶ Cloudflare ─tunnel─▶ Pi edge
      ─"RELAY 0 1 5\n"─▶ Nano ─D4 LOW─▶ relay ─▶ lock solenoid (auto-off after 5 s)
```

## Scheduling path (watering)

The cloud calls `FreshLabService.tick()` every minute (setInterval on VPS, cron on serverless).
A schedule fires once per slot within a 5-minute grace window, optionally skipped
if soil moisture % (calibrated in the cloud from `soil_raw`) is already high.

## Cloud code layout (ports & adapters)

```
cloud/api/src/
  core/        pure business logic: types, schedule math, FreshLabService
               depends only on the ports below
  core/ports.ts  EdgeClient, Store, Clock interfaces
  adapters/    HttpEdgeClient (fetch), FakeEdgeClient, MemoryStore, KVStore, JsonFileStore(Node only)
  http/app.ts  Hono routes (runtime-agnostic)
  entry/       node.ts (VPS) | worker.ts (Cloudflare Workers) | config.ts (wiring)
cloud/web/     React + Vite SPA (customer flow + /admin)
```

## Why these choices

- **Pi connects out (Cloudflare Tunnel)**: Pi is behind the router; no port forwarding, TLS for free, public hostname for the cloud to call.
- **HTTP pull from cloud → edge** (not MQTT): simplest to debug with curl, works from serverless functions without a broker. If many cabinets are added later, consider an MQTT broker; only `HttpEdgeClient` would change.
- **Hono + TypeScript**: one codebase runs on Node and on edge/serverless runtimes.
- **Python FastAPI on the Pi**: pyserial is mature; the service is ~200 lines.
