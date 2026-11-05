import type { Schedule, SoilCalibration } from "./types";

/** Local wall-clock parts of `date` in `timeZone` (works in Node and Workers). */
export function localParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
    weekday,
  };
}

export function parseHHMM(s: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  if (!m) throw new Error(`invalid time "${s}", expected HH:MM`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * A schedule is due if its slot is within the last `graceMin` minutes today
 * and it has not already run for today's slot. The grace window tolerates a
 * late or skipped tick (cron jitter, VPS restart, cold start).
 */
export function dueSlot(
  s: Schedule,
  now: Date,
  timeZone: string,
  lastRunSlot: string | undefined,
  graceMin = 5,
): string | null {
  if (!s.enabled) return null;
  const { date, minutes, weekday } = localParts(now, timeZone);
  if (s.days.length && !s.days.includes(weekday)) return null;
  const at = parseHHMM(s.time);
  const delta = minutes - at;
  if (delta < 0 || delta > graceMin) return null;
  const slot = `${date}T${s.time}`;
  return slot === lastRunSlot ? null : slot;
}

export function soilPercent(raw: number | null, cal: SoilCalibration): number | null {
  if (raw == null || cal.dryRaw === cal.wetRaw) return null;
  const pct = ((cal.dryRaw - raw) / (cal.dryRaw - cal.wetRaw)) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)));
}
