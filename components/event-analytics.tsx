"use client";
import { useEffect, useState } from "react";
import { listDays, listEvents } from "@/lib/client-data";
import type { ChaxterEvent } from "@/lib/events";
import type { DailyAggregate } from "@/lib/aggregation";
import EventPerformance from "./event-performance";
export default function EventAnalytics({ onSelectDay }: { onSelectDay: (day: string) => void }) {
  const [data, setData] = useState<{ events: ChaxterEvent[]; days: DailyAggregate[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; Promise.all([listEvents(), listDays()]).then(([events, days]) => { if (active) setData({ events, days }); }).catch(() => { if (active) setError("Event-Auswertung konnte nicht geladen werden."); }); return () => { active = false; }; }, []);
  return error ? <p role="alert">{error}</p> : data ? <EventPerformance events={data.events} days={data.days} visits={[]} onSelectDay={onSelectDay} /> : <p>Daten werden geladen …</p>;
}
