import { dayKey, type AgeGroup } from "./tracking.ts";
export type DailyAggregate = { date: string; u15: number; o15: number; u: number[]; o: number[] };
export const berlinHour = (timestamp: string) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(new Date(timestamp)));
export function updateAggregate(previous: DailyAggregate | null, timestamp: string, group: AgeGroup, delta: number): DailyAggregate {
  const next = previous ? { ...previous, u: [...previous.u], o: [...previous.o] } : { date: dayKey(new Date(timestamp)), u15: 0, o15: 0, u: Array(24).fill(0), o: Array(24).fill(0) };
  next[group] += delta;
  next[group === "u15" ? "u" : "o"][berlinHour(timestamp)] += delta;
  if (next[group] < 0 || next[group === "u15" ? "u" : "o"].some((n) => n < 0)) throw new Error("Ungültiger Zählerstand");
  return next;
}
