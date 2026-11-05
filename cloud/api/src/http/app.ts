// HTTP layer (Hono). Runtime-agnostic: the same app runs on Node and Workers.
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { sign, verify } from "hono/jwt";
import type { EdgeClient } from "../core/ports";
import type { FreshLabService } from "../core/service";

export interface AppDeps {
  service: FreshLabService;
  edge: EdgeClient;
  jwtSecret: string;
  adminPassword: string;
}

type Claims = { sub: string; role: "customer" | "admin"; step?: "authed" | "verified"; exp: number };
type Vars = { Variables: { claims: Claims } };

const ttl = (min: number) => Math.floor(Date.now() / 1000) + min * 60;

export function createApp(d: AppDeps) {
  const app = new Hono<Vars>().basePath("/api");

  const requireAuth =
    (check: (c: Claims) => boolean): MiddlewareHandler<Vars> =>
    async (c, next) => {
      const h = c.req.header("authorization") ?? "";
      try {
        const claims = (await verify(h.replace(/^Bearer /, ""), d.jwtSecret)) as Claims;
        if (!check(claims)) return c.json({ error: "forbidden" }, 403);
        c.set("claims", claims);
      } catch {
        return c.json({ error: "unauthorized" }, 401);
      }
      await next();
    };
  const admin = requireAuth((x) => x.role === "admin");

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: err.message }, 500);
  });

  app.get("/health", (c) => c.json({ ok: true }));

  // ---- customer flow (Phase 1 mock auth carried over from the prototype) ----
  app.post("/auth/login", async (c) => {
    const { username, password } = await c.req.json<{ username?: string; password?: string }>();
    if (!username?.trim() || !password) return c.json({ error: "username and password required" }, 400);
    const token = await sign({ sub: username.trim(), role: "customer", step: "authed", exp: ttl(15) }, d.jwtSecret);
    return c.json({ token, step: "authed" });
  });

  app.post("/auth/verify", requireAuth((x) => x.role === "customer"), async (c) => {
    // TODO(real auth): OTP / ID check goes here. Mock = always verified.
    const { sub } = c.get("claims");
    const token = await sign({ sub, role: "customer", step: "verified", exp: ttl(5) }, d.jwtSecret);
    return c.json({ token, step: "verified" });
  });

  app.post("/cabinet/open", requireAuth((x) => x.role === "customer" && x.step === "verified"), async (c) => {
    return c.json(await d.service.openCabinet(c.get("claims").sub));
  });

  // ---- admin ----
  app.post("/admin/login", async (c) => {
    const { password } = await c.req.json<{ password?: string }>();
    if (!d.adminPassword || password !== d.adminPassword) return c.json({ error: "wrong password" }, 401);
    return c.json({ token: await sign({ sub: "admin", role: "admin", exp: ttl(12 * 60) }, d.jwtSecret) });
  });

  app.get("/admin/status", admin, async (c) => {
    const [health, sensors, relays] = await Promise.allSettled([
      d.edge.health(),
      d.service.sensors(),
      d.edge.relays(),
    ]);
    const val = <T>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : null);
    const errors = [health, sensors, relays]
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => String(r.reason?.message ?? r.reason));
    return c.json({ edge: val(health), sensors: val(sensors), relays: val(relays), errors });
  });

  app.post("/admin/relays/all-off", admin, async (c) => {
    await d.edge.allOff();
    await d.service.log("relay", "ALL OFF", "admin");
    return c.json({ ok: true });
  });

  app.post("/admin/relays/:name", admin, async (c) => {
    const { on, maxSeconds } = await c.req.json<{ on: boolean; maxSeconds?: number }>();
    await d.service.setRelay(c.req.param("name"), !!on, maxSeconds || undefined, "admin");
    return c.json({ ok: true });
  });

  app.get("/admin/schedules", admin, async (c) => c.json(await d.service.schedules()));
  app.post("/admin/schedules", admin, async (c) => {
    try {
      return c.json(await d.service.saveSchedule(await c.req.json()));
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });
  app.delete("/admin/schedules/:id", admin, async (c) => {
    await d.service.deleteSchedule(c.req.param("id"));
    return c.json({ ok: true });
  });

  app.get("/admin/soil-calibration", admin, async (c) => c.json(await d.service.soilCalibration()));
  app.put("/admin/soil-calibration", admin, async (c) => {
    const { dryRaw, wetRaw } = await c.req.json<{ dryRaw: number; wetRaw: number }>();
    await d.service.setSoilCalibration({ dryRaw: Number(dryRaw), wetRaw: Number(wetRaw) });
    return c.json({ ok: true });
  });

  app.get("/admin/events", admin, async (c) => c.json(await d.service.events()));
  app.post("/admin/tick", admin, async (c) => c.json(await d.service.tick()));

  return app;
}
