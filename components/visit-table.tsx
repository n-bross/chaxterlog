import { Fragment } from "react";
import type { TrackEvent } from "@/lib/tracking";

export default function VisitTable({ events }: { events: TrackEvent[] }) {
  return <div className="event-table-wrap"><table className="event-table">
    <thead><tr><th scope="col">Datum</th><th scope="col">Uhrzeit</th><th scope="col">Gruppe</th></tr></thead>
    <tbody>{events.map((event) => {
      const date = new Date(event.timestamp);
      const username = event.username || (event.userId ? `Benutzer ${event.userId.slice(0, 8)}` : event.legacy ? "Unbekannt (Altbestand)" : "Nicht erfasst");
      const device = event.deviceName || (event.deviceId ? `Gerät ${event.deviceId.slice(0, 8)}` : event.platform || "Nicht erfasst");
      const deviceDetails = [event.deviceName ? event.platform : undefined, event.deviceId ? `ID ${event.deviceId.slice(0, 8)}` : undefined].filter(Boolean).join(" · ");
      return <Fragment key={event.id}>
        <tr className="event-main-row"><td>{date.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}</td><td>{date.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td><td><span className={`event-group ${event.group === "u15" ? "counter-blue" : "counter-yellow"}`}>{event.group === "u15" ? "U15" : "Ü15"}</span></td></tr>
        <tr className="event-attribution-row"><td colSpan={3}><dl className="event-attribution">
          <div><dt>{event.redoOf ? "Wiederhergestellt von (Redo)" : "Benutzer"}</dt><dd>{username}</dd></div>
          <div><dt>{event.legacy ? "Importgerät" : "Gerät"}</dt><dd>{device}{deviceDetails && <small>{deviceDetails}</small>}</dd></div>
        </dl></td></tr>
      </Fragment>;
    })}</tbody>
  </table></div>;
}
