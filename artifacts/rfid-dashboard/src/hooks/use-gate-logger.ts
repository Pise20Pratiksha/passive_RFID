import { useCallback, useEffect, useState } from "react";

export type GateLoggerRecord = { idx: number; epc: string; date: string; time: string; dir: "IN" | "OUT" };
export type GateLoggerStats = { count: number; head: number; tail: number; total: number; max: number };
type GateLoggerDump = { records: GateLoggerRecord[] };
type GateLoggerStatus = "connecting" | "connected" | "disconnected";

const gateLoggerUrl = (import.meta.env.VITE_GATE_LOGGER_URL || "http://192.168.4.1").replace(/\/+$/, "");
const storageKey = "gate-logger-records-v1";

function isRecord(value: unknown): value is GateLoggerRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return Number.isInteger(record.idx) && typeof record.epc === "string" && typeof record.date === "string"
    && typeof record.time === "string" && (record.dir === "IN" || record.dir === "OUT");
}

function keyOf(record: GateLoggerRecord) {
  return `${record.idx}:${record.epc}:${record.date}:${record.time}:${record.dir}`;
}

function loadSaved(): GateLoggerRecord[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  } catch {
    return [];
  }
}

function isStats(value: unknown): value is GateLoggerStats {
  if (!value || typeof value !== "object") return false;
  const stats = value as Record<string, unknown>;
  return ["count", "head", "tail", "total", "max"].every((key) => typeof stats[key] === "number");
}

export function useGateLoggerDump() {
  const [records, setRecords] = useState<GateLoggerRecord[]>(loadSaved);
  const [stats, setStats] = useState<GateLoggerStats | null>(null);
  const [status, setStatus] = useState<GateLoggerStatus>("connecting");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4_000);
    try {
      const [dumpResponse, statsResponse] = await Promise.all([
        fetch(`${gateLoggerUrl}/dump`, { signal: controller.signal, cache: "no-store" }),
        fetch(`${gateLoggerUrl}/stats`, { signal: controller.signal, cache: "no-store" }),
      ]);
      if (!dumpResponse.ok || !statsResponse.ok) throw new Error("Firmware did not return its data");
      const dump: unknown = await dumpResponse.json();
      const next = dump && typeof dump === "object" && Array.isArray((dump as GateLoggerDump).records)
        ? (dump as GateLoggerDump).records.filter(isRecord) : null;
      const nextStats: unknown = await statsResponse.json();
      if (!next || !isStats(nextStats)) throw new Error("Invalid firmware response");

      const saved = loadSaved();
      const known = new Set(saved.map(keyOf));
      const merged = [...saved, ...next.filter((record) => !known.has(keyOf(record)))];
      merged.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
      window.localStorage.setItem(storageKey, JSON.stringify(merged));
      setRecords(merged);
      setStats(nextStats);
      setStatus("connected");
      setError(null);
    } catch (cause) {
      setStatus("disconnected");
      setError(cause instanceof Error ? cause.message : "Unable to reach the RFID device");
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return { records, stats, status, error, refresh, url: gateLoggerUrl };
}
