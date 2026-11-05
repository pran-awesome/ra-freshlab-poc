// Serverless entry (Cloudflare Workers). Same core + HTTP app, different adapters:
//   store  -> Workers KV (binding FRESHLAB_KV)
//   timer  -> Cron Trigger "* * * * *" calling service.tick()
//   SPA    -> Workers static assets (see wrangler.toml)
// Other platforms (Lambda, Vercel, Deno Deploy) follow the same pattern:
// build(env, someStore) -> app.fetch for HTTP, service.tick() for cron.
import { KVStore, type KVLike } from "../adapters/stores";
import { build } from "./config";

interface WorkerEnv {
  FRESHLAB_KV: KVLike;
  [k: string]: unknown;
}

function strEnv(env: WorkerEnv) {
  return Object.fromEntries(Object.entries(env).filter(([, v]) => typeof v === "string")) as Record<string, string>;
}

export default {
  fetch(req: Request, env: WorkerEnv, ctx: ExecutionContext) {
    return build(strEnv(env), new KVStore(env.FRESHLAB_KV)).app.fetch(req, env, ctx);
  },
  async scheduled(_e: ScheduledController, env: WorkerEnv, ctx: ExecutionContext) {
    ctx.waitUntil(build(strEnv(env), new KVStore(env.FRESHLAB_KV)).service.tick());
  },
};
