"use client";
import { convex } from "./convex-client";
import { api } from "@/convex/_generated/api";
import type { ChaxterEvent } from "./events";
import type { DailyAggregate } from "./aggregation";
export async function listEvents(from?: string, to?: string): Promise<ChaxterEvent[]> {
  const result: ChaxterEvent[] = []; let cursor: string | null = null;
  do {
    const page: { page: ChaxterEvent[]; isDone: boolean; continueCursor: string } = await convex.query(api.events.list, { ...(from ? { from } : {}), ...(to ? { to } : {}), paginationOpts: { cursor, numItems: 100 } });
    result.push(...page.page); cursor = page.isDone ? null : page.continueCursor;
  } while (cursor);
  return result;
}
export async function listDays(from = "2000-01-01", to = "2100-12-31"): Promise<DailyAggregate[]> {
  const result: DailyAggregate[] = []; let cursor: string | null = null;
  do {
    const page: { page: DailyAggregate[]; isDone: boolean; continueCursor: string } = await convex.query(api.stats.days, { from, to, paginationOpts: { cursor, numItems: 100 } });
    result.push(...page.page); cursor = page.isDone ? null : page.continueCursor;
  } while (cursor);
  return result;
}
