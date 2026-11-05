import { describe, expect, it } from "vitest";
import { FakeEdgeClient } from "../src/adapters/fake-edge";
import { MemoryStore } from "../src/adapters/stores";
import { dueSlot, soilPercent } from "../src/core/schedule";
import { FreshLabService } from "../src/core/service";
import { createApp } from "../src/http/app";
import type { Schedule } from "../src/core/types";

const TZ = "Asia/Bangkok";
// 2026-11-05 07:02 Bangkok (UTC+7) = 00:02 UTC, Thursday (4)
const at = (iso: string) => new Date(iso);

const base: Schedule = {
  id: "s1", name: "morning water", relay: "pump", time: "07:00",
  days: [], durationSec: 30, enabled: true,
};

describe("dueSlot", () => {
  it("is due inside the grace window, once", () => {
    const slot = dueSlot(base, at("2026-11-05T00:02:00Z"), TZ, undefined);
    expect(slot).toBe("2026-11-05T07:00");
    expect(dueSlot(base, at("2026-11-05T00:03:00Z"), TZ, slot!)).toBeNull();
  });
  it("is not due before or long after", () => {
    expect(dueSlot(base, at("2026-11-04T23:59:00Z"), TZ, undefined)).toBeNull();
    expect(dueSlot(base, at("2026-11-05T00:30:00Z"), TZ, undefined)).toBeNull();
  });
  it("respects weekdays and enabled", () => {
    expect(dueSlot({ ...base, days: [1] }, at("2026-11-05T00:01:00Z"), TZ, undefined)).toBeNull();
    expect(dueSlot({ ...base, days: [4] }, at("2026-11-05T00:01:00Z"), TZ, undefined)).not.toBeNull();
    expect(dueSlot({ ...base, enabled: false }, at("2026-11-05T00:01:00Z"), TZ, undefined)).toBeNull();
  });
});

describe("soilPercent", () => {
  it("maps dry..wet to 0..100 and clamps", () => {
    const cal = { dryRaw: 1000, wetRaw: 400 };
    expect(soilPercent(1000, cal)).toBe(0);
    expect(soilPercent(400, cal)).toBe(100);
    expect(soilPercent(700, cal)).toBe(50);
    expect(soilPercent(1023, cal)).toBe(0);
  });
});

function setup(nowIso: string) {
  const edge = new FakeEdgeClient();
  const store = new MemoryStore();
  let now = at(nowIso);
  const svc = new FreshLabService(edge, store, { timeZone: TZ, doorRelay: "door", doorUnlockSeconds: 5 }, { now: () => now });
  return { edge, svc, setNow: (iso: string) => (now = at(iso)) };
}

describe("tick", () => {
  it("runs a due schedule exactly once", async () => {
    const { edge, svc, setNow } = setup("2026-11-05T00:01:00Z");
    await svc.saveSchedule({ ...base });
    expect((await svc.tick()).ran).toEqual(["s1"]);
    setNow("2026-11-05T00:02:00Z");
    expect((await svc.tick()).ran).toEqual([]);
    expect(edge.calls).toEqual([{ name: "pump", on: true, maxSeconds: 30 }]);
  });
  it("skips watering when soil is wet enough", async () => {
    const { edge, svc } = setup("2026-11-05T00:01:00Z");
    edge.soilRaw = 350; // very wet with default calibration
    await svc.saveSchedule({ ...base, skipIfSoilAbovePct: 60 });
    expect((await svc.tick()).ran).toEqual([]);
    expect(edge.calls).toEqual([]);
    expect((await svc.events())[0].kind).toBe("schedule_skip");
  });
});

describe("http", () => {
  it("customer must log in and verify before opening", async () => {
    const edge = new FakeEdgeClient();
    const service = new FreshLabService(edge, new MemoryStore(), { timeZone: TZ, doorRelay: "door", doorUnlockSeconds: 5 });
    const app = createApp({ service, edge, jwtSecret: "x", adminPassword: "pw" });
    const post = (path: string, body: unknown, token?: string) =>
      app.request(`/api${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });

    const { token: t1 } = await (await post("/auth/login", { username: "a", password: "b" })).json();
    expect((await post("/cabinet/open", {}, t1)).status).toBe(403);
    const { token: t2 } = await (await post("/auth/verify", {}, t1)).json();
    expect((await post("/cabinet/open", {}, t2)).status).toBe(200);
    expect(edge.calls).toEqual([{ name: "door", on: true, maxSeconds: 5 }]);

    expect((await post("/admin/login", { password: "nope" })).status).toBe(401);
  });
});
