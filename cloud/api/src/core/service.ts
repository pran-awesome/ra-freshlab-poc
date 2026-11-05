// All FreshLab business logic lives here: when to open, when to water, what to log.
import type { Clock, EdgeClient, Store } from "./ports";
import { dueSlot, parseHHMM, soilPercent } from "./schedule";
import type { EventLog, Schedule, SensorSnapshot, SoilCalibration } from "./types";

export interface ServiceConfig {
  timeZone: string;
  doorRelay: string;
  doorUnlockSeconds: number;
  maxEvents?: number;
}

const K = {
  schedules: "schedules",
  events: "events",
  lastRun: "schedule_last_run",
  soilCal: "soil_calibration",
};

const DEFAULT_CAL: SoilCalibration = { dryRaw: 1023, wetRaw: 300 };

export class FreshLabService {
  constructor(
    private edge: EdgeClient,
    private store: Store,
    private cfg: ServiceConfig,
    private clock: Clock = { now: () => new Date() },
  ) {}

  // ---- events ---------------------------------------------------------
  async log(kind: EventLog["kind"], message: string, actor?: string) {
    const events = (await this.store.get<EventLog[]>(K.events)) ?? [];
    events.unshift({ at: this.clock.now().toISOString(), kind, message, actor });
    await this.store.set(K.events, events.slice(0, this.cfg.maxEvents ?? 200));
  }
  async events() {
    return (await this.store.get<EventLog[]>(K.events)) ?? [];
  }

  // ---- sensors --------------------------------------------------------
  async soilCalibration() {
    return (await this.store.get<SoilCalibration>(K.soilCal)) ?? DEFAULT_CAL;
  }
  async setSoilCalibration(cal: SoilCalibration) {
    await this.store.set(K.soilCal, cal);
  }
  async sensors(fresh = false): Promise<SensorSnapshot> {
    const s = await this.edge.sensors(fresh);
    return {
      temperatureC: s.temperature_c,
      humidityPct: s.humidity_pct,
      soilRaw: s.soil_raw,
      soilPct: soilPercent(s.soil_raw, await this.soilCalibration()),
      readAt: s.read_at,
    };
  }

  // ---- actions --------------------------------------------------------
  async openCabinet(actor: string) {
    await this.edge.setRelay(this.cfg.doorRelay, true, this.cfg.doorUnlockSeconds);
    await this.log("cabinet_open", `door unlocked for ${this.cfg.doorUnlockSeconds}s`, actor);
    return { unlockedForSeconds: this.cfg.doorUnlockSeconds };
  }

  async setRelay(name: string, on: boolean, maxSeconds: number | undefined, actor: string) {
    await this.edge.setRelay(name, on, maxSeconds);
    await this.log("relay", `${name} -> ${on ? "ON" : "OFF"}${maxSeconds ? ` (${maxSeconds}s)` : ""}`, actor);
  }

  // ---- schedules ------------------------------------------------------
  async schedules() {
    return (await this.store.get<Schedule[]>(K.schedules)) ?? [];
  }
  async saveSchedule(input: Omit<Schedule, "id"> & { id?: string }) {
    parseHHMM(input.time);
    if (!(input.durationSec > 0)) throw new Error("durationSec must be > 0");
    const list = await this.schedules();
    const id = input.id ?? crypto.randomUUID();
    const next = { ...input, id } as Schedule;
    const i = list.findIndex((s) => s.id === id);
    if (i >= 0) list[i] = next;
    else list.push(next);
    await this.store.set(K.schedules, list);
    return next;
  }
  async deleteSchedule(id: string) {
    await this.store.set(K.schedules, (await this.schedules()).filter((s) => s.id !== id));
  }

  /**
   * Run every schedule that is due. Call this once a minute from whatever
   * the runtime offers: setInterval on a VPS, a cron trigger on serverless.
   * Idempotent: a slot runs at most once even if called many times.
   */
  async tick() {
    const now = this.clock.now();
    const lastRun = (await this.store.get<Record<string, string>>(K.lastRun)) ?? {};
    const ran: string[] = [];
    let soil: number | null | undefined;

    for (const s of await this.schedules()) {
      const slot = dueSlot(s, now, this.cfg.timeZone, lastRun[s.id]);
      if (!slot) continue;
      lastRun[s.id] = slot; // mark first so a failing edge does not cause retries every minute
      await this.store.set(K.lastRun, lastRun);
      try {
        if (s.skipIfSoilAbovePct != null) {
          soil ??= (await this.sensors(true)).soilPct;
          if (soil != null && soil >= s.skipIfSoilAbovePct) {
            await this.log("schedule_skip", `${s.name}: soil ${soil}% >= ${s.skipIfSoilAbovePct}%`, "scheduler");
            continue;
          }
        }
        await this.edge.setRelay(s.relay, true, s.durationSec);
        await this.log("schedule_run", `${s.name}: ${s.relay} ON ${s.durationSec}s`, "scheduler");
        ran.push(s.id);
      } catch (e) {
        await this.log("error", `${s.name}: ${(e as Error).message}`, "scheduler");
      }
    }
    return { ran };
  }
}
