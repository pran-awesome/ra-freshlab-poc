# Deploy the cloud

The cloud is one TypeScript codebase with two entry points:

| Target | Entry | Store | Scheduler |
|---|---|---|---|
| **VPS (default)** | `cloud/api/src/entry/node.ts` | JSON file on a volume (`JsonFileStore`) | `setInterval` every 60 s |
| Serverless (Cloudflare Workers) | `cloud/api/src/entry/worker.ts` | Workers KV (`KVStore`) | Cron Trigger `* * * * *` |

Both call the same `build(env, store)` → `createApp()` + `FreshLabService.tick()`.

## VPS (Docker)
```bash
git clone https://github.com/pran-awesome/ra-freshlab-poc && cd ra-freshlab-poc/cloud
cp .env.example .env && nano .env    # JWT_SECRET, ADMIN_PASSWORD, EDGE_URL, EDGE_API_TOKEN
docker compose up -d --build                    # app on 127.0.0.1:8787
# public HTTPS with automatic certificates (DNS A record -> VPS):
docker compose --profile https up -d
```
- Customer page: `https://<host>/`  · Admin: `https://<host>/admin`
- State lives in the `freshlab-data` volume (`/data/state.json`). Back it up.

## Cloudflare Workers (optional)
```bash
cd cloud/api
npx wrangler kv namespace create FRESHLAB_KV     # paste id into wrangler.toml
npx wrangler secret put JWT_SECRET
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put EDGE_API_TOKEN
npm run build --prefix ../web && npm run deploy:worker
```
KV is eventually consistent; fine for a PoC with one admin. For more traffic
move the `Store` port to D1/Postgres (new adapter, core untouched).

## Other serverless platforms
Write a new entry file: build the `Store` adapter for that platform, call
`build(env, store)`, export `app.fetch` as the HTTP handler and call
`service.tick()` from the platform's scheduler (EventBridge, Vercel Cron, ...).

## Local dev (no hardware)
```bash
cd cloud/api && npm i && EDGE_URL=mock ADMIN_PASSWORD=pw npm run dev   # :8787
cd cloud/web && npm i && npm run dev                                   # :5173, proxies /api
```
Or against a simulated edge: `docker compose -f edge/docker-compose.dev.yml up`
and `EDGE_URL=http://localhost:8080 EDGE_API_TOKEN=dev-token`.
