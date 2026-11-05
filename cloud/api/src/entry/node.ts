// VPS / Docker entry: Node HTTP server + in-process minute scheduler + static SPA.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { JsonFileStore } from "../adapters/file-store";
import { build } from "./config";

const env = process.env;
const { app: api, service } = build(env, new JsonFileStore(env.DATA_FILE ?? "./data/state.json"));

const root = new Hono();
root.route("/", api);
// Must be RELATIVE to the working dir (hono node-server serveStatic limitation).
const webDir = env.WEB_DIR ?? "../web/dist";
root.use("/*", serveStatic({ root: webDir }));
// SPA fallback: unknown non-API paths get index.html (client-side routing).
let indexHtml = "<h1>FreshLab API</h1><p>web/dist not built</p>";
try {
  indexHtml = readFileSync(join(webDir, "index.html"), "utf8");
} catch {}
root.get("*", (c) => (c.req.path.startsWith("/api/") ? c.notFound() : c.html(indexHtml)));

const port = Number(env.PORT ?? 8787);
serve({ fetch: root.fetch, port }, () => console.log(`FreshLab cloud on :${port}`));

// Scheduler: same `tick()` a serverless cron would call.
const tick = () => service.tick().catch((e) => console.error("tick failed", e));
setInterval(tick, 60_000);
tick();
