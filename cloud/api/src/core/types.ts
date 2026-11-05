// Domain types. Pure data, no runtime dependencies.

export type RelayName = string; // e.g. "door" | "pump" | "light" | "fan"

export interface Schedule {
  id: string;
  name: string;
  relay: RelayName;
  /** Local time "HH:MM" in the configured timezone. */
  time: string;
  /** 0 = Sunday .. 6 = Saturday. Empty = every day. */
  days: number[];
  durationSec: number;
  enabled: boolean;
  /** Skip the run when soil moisture is already at/above this %. */
  skipIfSoilAbovePct?: number | null;
}

export interface SensorSnapshot {
  temperatureC: number | null;
  humidityPct: number | null;
  soilRaw: number | null;
  soilPct: number | null;
  readAt: number | null; // epoch seconds (from edge)
}

export interface RelayState {
  name: RelayName;
  channel: number;
  on: boolean | null;
}

export interface EventLog {
  at: string; // ISO
  kind: "cabinet_open" | "relay" | "schedule_run" | "schedule_skip" | "error";
  message: string;
  actor?: string;
}

export interface SoilCalibration {
  /** Raw ADC value in dry air (MH sensors: high = dry). */
  dryRaw: number;
  /** Raw ADC value in water. */
  wetRaw: number;
}
