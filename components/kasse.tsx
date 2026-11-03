"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { createId, getDevice } from "@/lib/device";
import { errorMessage } from "@/lib/errors";
import {
  changeBreakdown, checkout, countedTotal, CURRENT_KEY, DENOMINATIONS, denominationLabel, EMPTY_KEYPAD, formatCents, formatSigned, KASSE_CHANGE,
  keypadPress, keypadTotal, nextSeq, NO_PFAND, parseEuro, PFAND, pruneOps, readOps, saveOp, sessionView,
  type KasseOp, type Keypad, type PfandCounts, type ServerEntry, type ServerSession, type StoredOp,
} from "@/lib/kasse";
import { useKasseSync, type KasseSyncState } from "@/lib/use-kasse-sync";
import { Modal } from "./interior/modal";

type SessionData = { session: ServerSession | null; entries: ServerEntry[] };
type Overview = { open: ServerSession[]; closed: ServerSession[] };
const OVERVIEW_CACHE = "chaxterkasse:overview:v1";
const sessionCache = (id: string) => `chaxterkasse:session:v1:${id}`;

function readJson<T>(key: string): T | null { try { return JSON.parse(localStorage.getItem(key) ?? "null") as T | null; } catch { return null; } }
function writeJson(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* A full cache only costs the offline view. */ } }
const time = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const dateTime = (iso: string) => new Date(iso).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Writes one operation durably; throws if the device could not store it. */
function record(sessionId: string, op: { type: "open"; floatCents: number } | { type: "sale"; amountCents: number } | { type: "storno"; saleId: string } | { type: "close"; countedCents: number }) {
  const device = getDevice();
  const full = { id: createId(), sessionId, at: new Date().toISOString(), seq: nextSeq(localStorage), deviceId: device.id, deviceName: device.name, ...op } as KasseOp;
  saveOp(localStorage, full);
  window.dispatchEvent(new Event(KASSE_CHANGE));
  return full;
}

export default function Kasse({ user }: { user: { username: string } }) {
  const [local, setLocal] = useState<StoredOp[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    try { setLocal(readOps(localStorage)); setSessionId(localStorage.getItem(CURRENT_KEY)); setError(null); }
    catch { setError("Der Gerätespeicher ist nicht lesbar. Bitte Seite neu laden."); }
    setReady(true);
  }, []);
  useEffect(() => { refresh(); void navigator.storage?.persist?.().catch(() => {}); }, [refresh]);
  const sync = useKasseSync(refresh);

  const liveOverview = useQuery(api.kasse.overview, {});
  const liveSession = useQuery(api.kasse.session, sessionId ? { id: sessionId } : "skip");
  useEffect(() => { if (liveOverview) writeJson(OVERVIEW_CACHE, liveOverview); }, [liveOverview]);
  useEffect(() => { if (liveSession && sessionId) writeJson(sessionCache(sessionId), liveSession); }, [liveSession, sessionId]);
  // Offline after a reload: show the last server state merged with this device's bookings.
  const overview = liveOverview ?? (ready ? readJson<Overview>(OVERVIEW_CACHE) : null);
  const server = liveSession ?? (ready && sessionId ? readJson<SessionData>(sessionCache(sessionId)) : null);
  useEffect(() => { if (liveOverview) try { pruneOps(localStorage, new Set(liveOverview.closed.map((s) => s.id))); } catch { /* Cleanup is optional. */ } }, [liveOverview]);

  const choose = (id: string | null) => { if (id) localStorage.setItem(CURRENT_KEY, id); else localStorage.removeItem(CURRENT_KEY); refresh(); };
  const view = useMemo(() => sessionId ? sessionView(sessionId, local, server) : null, [sessionId, local, server]);

  return (
    <main className="manage-screen kasse-screen">
      <header className="manage-header">
        <Link className="back-link" href="/"><span className="back-arrow" aria-hidden="true">←</span> Zählung</Link>
        <h1>Kasse <span className="kasse-badge">Test</span></h1>
        <KasseSync status={sync} />
      </header>
      {error && <p role="alert" className="error-message">{error}</p>}
      {sync.state === "error" && <p role="alert" className="error-message">Buchungen werden vom Server abgelehnt: {sync.message} – sie bleiben auf diesem Gerät gespeichert.</p>}
      {!ready ? null : !sessionId || !view
        ? <Start user={user} overview={overview} onOpen={(floatCents) => { const id = createId(); record(id, { type: "open", floatCents }); choose(id); }} onJoin={choose} />
        : view.closed
          ? <Closed view={view} server={server?.session ?? null} onNew={() => choose(null)} />
          : <Register sessionId={sessionId} view={view} />}
      {overview && overview.closed.length > 0 && <History sessions={overview.closed} />}
    </main>
  );
}

function KasseSync({ status }: { status: KasseSyncState }) {
  const label = status.state === "synced" ? "Alles übertragen" : status.state === "connecting" ? "Verbinde …" : status.state === "pending" ? `${status.pending} wird übertragen` : status.state === "offline" ? `Offline${status.pending ? ` · ${status.pending} gespeichert` : ""}` : `${status.pending} nicht übertragen`;
  return <span className="sync-status kasse-sync" data-state={status.state === "error" ? "conflict" : status.state} role="status" title={status.message ?? label}><span className="sync-dot" aria-hidden="true" />{label}</span>;
}

function Start({ user, overview, onOpen, onJoin }: { user: { username: string }; overview: Overview | null; onOpen: (floatCents: number) => void; onJoin: (id: string) => void }) {
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const last = overview?.closed[0];
  useEffect(() => { if (last && !text) setText((last.floatCents / 100).toFixed(2).replace(".", ",")); }, [last, text]);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const cents = parseEuro(text || "0");
    if (cents === null) return setProblem("Bitte einen Betrag wie 50 oder 50,00 eingeben.");
    try { onOpen(cents); } catch (e) { setProblem(errorMessage(e, "Kasse konnte nicht geöffnet werden.")); }
  };
  return <>
    {overview && overview.open.length > 0 && <section className="kasse-panel">
      <h2>Offene Kasse</h2>
      <p className="page-intro">Auf einem anderen Gerät wurde schon eine Kasse geöffnet. Übernimm sie, damit alle Buchungen in dieselbe Abrechnung laufen.</p>
      {overview.open.map((s) => <button key={s.id} type="button" className="secondary-button kasse-join" onClick={() => onJoin(s.id)}>
        <span>Geöffnet {dateTime(s.openedAt)} von {s.openedBy}</span><strong>{formatCents(s.floatCents + s.salesCents - s.stornoCents)}</strong>
      </button>)}
    </section>}
    <form className="kasse-panel" onSubmit={submit}>
      <h2>Kasse öffnen</h2>
      <p className="page-intro">Zähle das Wechselgeld in der Kasse und trage es ein. Angemeldet als {user.username}.</p>
      <label className="kasse-field">Wechselgeld
        <span className="kasse-euro-input"><input inputMode="decimal" autoComplete="off" value={text} onChange={(e) => { setText(e.target.value); setProblem(null); }} placeholder="0,00" aria-describedby="float-hint" /><span aria-hidden="true">€</span></span>
      </label>
      {last && <small id="float-hint" className="meta">Letztes Mal: {formatCents(last.floatCents)}</small>}
      {problem && <p role="alert" className="error-message">{problem}</p>}
      <button type="submit" className="primary-button">Kasse öffnen</button>
    </form>
  </>;
}

type View = ReturnType<typeof sessionView>;

function Register({ sessionId, view }: { sessionId: string; view: View }) {
  const [keypad, setKeypad] = useState<Keypad>(EMPTY_KEYPAD);
  const [pfand, setPfand] = useState<PfandCounts>(NO_PFAND);
  const [given, setGiven] = useState<number | null>(null);
  const [givenText, setGivenText] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [storno, setStorno] = useState<View["entries"][number] | null>(null);
  const [closing, setClosing] = useState(false);
  const amount = keypadTotal(keypad);
  const result = checkout(amount, pfand, given);
  const touched = amount > 0 || pfand.getraenk !== 0 || pfand.wasser !== 0;
  const reset = () => { setKeypad(EMPTY_KEYPAD); setPfand(NO_PFAND); setGiven(null); setGivenText(""); };

  const book = () => {
    if (!amount) { reset(); return; }
    try {
      record(sessionId, { type: "sale", amountCents: amount });
      setFlash(`${formatCents(amount)} gebucht`); setProblem(null); reset();
      setTimeout(() => setFlash(null), 2200);
    } catch (e) { setProblem(errorMessage(e, "Buchung NICHT gespeichert – bitte erneut versuchen.")); }
  };
  // Hardware keyboards (tablet with keyboard, laptop) can type amounts directly.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (closing || storno || (event.target as HTMLElement)?.closest?.("input, textarea")) return;
      const map: Record<string, string> = { Backspace: "back", "+": "plus", Escape: "clear", Delete: "clear" };
      const key = /^\d$/.test(event.key) ? event.key : map[event.key];
      if (key) { event.preventDefault(); setKeypad((k) => keypadPress(k, key)); }
      else if (event.key === "Enter") { event.preventDefault(); book(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const recent = [...view.entries].reverse().slice(0, 40);
  return <>
    <section className="kasse-total" aria-live="polite">
      <span className="meta">Soll in der Kasse</span>
      <strong>{formatCents(view.expectedCents)}</strong>
      <span className="meta">Wechselgeld {formatCents(view.floatCents)} · Umsatz {formatCents(view.netCents)} · {view.saleCount} {view.saleCount === 1 ? "Buchung" : "Buchungen"}</span>
    </section>

    <div className="kasse-layout">
      <section className="kasse-panel kasse-register" aria-label="Buchen">
        <output className="kasse-display" aria-label={`Betrag ${formatCents(amount)}`}>
          {keypad.parts.length > 0 && <span className="kasse-parts">{[...keypad.parts, keypad.current].map(formatCents).join(" + ")}</span>}
          <span className="kasse-amount">{formatCents(amount)}</span>
        </output>
        <div className="kasse-keypad">
          {["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", "00"].map((key) => <button key={key} type="button" className="kasse-key" onClick={() => setKeypad((k) => keypadPress(k, key))}>{key}</button>)}
          <button type="button" className="kasse-key" aria-label="Löschen" onClick={() => setKeypad((k) => keypadPress(k, "back"))}>⌫</button>
          <button type="button" className="kasse-key kasse-key-op" onClick={() => setKeypad((k) => keypadPress(k, "plus"))}>+</button>
          <button type="button" className="kasse-key kasse-key-op" onClick={reset}>C</button>
        </div>

        <div className="kasse-pfand" role="group" aria-label="Pfand (nur Rechenhilfe)">
          {PFAND.map((item) => <div key={item.key} className="kasse-pfand-row">
            <span>Pfand {item.label} <small className="meta">{formatCents(item.cents)}</small></span>
            <span className="kasse-stepper">
              <button type="button" aria-label={`${item.label}-Pfand weniger oder Flasche zurück`} onClick={() => setPfand((p) => ({ ...p, [item.key]: Math.max(-20, p[item.key] - 1) }))}>−</button>
              <output data-negative={pfand[item.key] < 0}>{pfand[item.key]}</output>
              <button type="button" aria-label={`${item.label}-Pfand mehr`} onClick={() => setPfand((p) => ({ ...p, [item.key]: Math.min(20, p[item.key] + 1) }))}>+</button>
            </span>
          </div>)}
          <small className="meta">Minus = Flasche zurückgegeben. Pfand wird nicht gebucht.</small>
        </div>

        <dl className="kasse-summary">
          <div><dt>Kunde zahlt</dt><dd className="kasse-strong">{formatCents(result.customerPays)}</dd></div>
          <div><dt>{result.deposit < 0 ? "Pfand zurück" : "davon Pfand"}</dt><dd>{formatCents(Math.abs(result.deposit))}</dd></div>
          <div><dt>In die Kasse</dt><dd className="kasse-strong">{formatCents(result.till)}</dd></div>
        </dl>

        <div className="kasse-given" role="group" aria-label="Gegeben (Rückgeld berechnen)">
          <span className="meta">Gegeben</span>
          <div className="kasse-chips">
            {[500, 1000, 2000, 5000].map((cents) => <button key={cents} type="button" className="secondary-button btn-small" aria-pressed={given === cents} onClick={() => { setGiven(given === cents ? null : cents); setGivenText(""); }}>{cents / 100} €</button>)}
            <input className="kasse-given-input" inputMode="decimal" placeholder="anderer Betrag" value={givenText} onChange={(e) => { setGivenText(e.target.value); setGiven(parseEuro(e.target.value)); }} aria-label="Gegebener Betrag" />
          </div>
          {result.change !== null && (result.change >= 0
            ? <p className="kasse-change">Rückgeld <strong>{formatCents(result.change)}</strong> <small className="meta">{changeBreakdown(result.change).map((c) => `${c.count}× ${denominationLabel(c.cents)}`).join(", ")}</small></p>
            : <p className="kasse-change" data-short>Es fehlen noch <strong>{formatCents(-result.change)}</strong></p>)}
        </div>

        {problem && <p role="alert" className="error-message">{problem}</p>}
        <button type="button" className="primary-button kasse-book" onClick={book} disabled={!touched}>
          {amount ? `${formatCents(amount)} buchen` : touched ? "Nur Pfand – fertig" : "Betrag eingeben"}
        </button>
        <p className="kasse-flash" role="status" aria-live="assertive">{flash && <>✓ {flash}</>}</p>
      </section>

      <section className="kasse-panel kasse-log" aria-label="Buchungen">
        <h2>Buchungen</h2>
        {recent.length === 0 && <p className="meta">Noch keine Buchung.</p>}
        <ol>
          {recent.map((entry) => {
            const cancelled = entry.kind === "sale" && view.cancelled.has(entry.id);
            return <li key={entry.id} data-kind={entry.kind} data-cancelled={cancelled}>
              <span className="kasse-log-state" title={entry.confirmed ? "Auf dem Server gespeichert" : "Nur auf diesem Gerät – wird übertragen"} data-confirmed={entry.confirmed}>{entry.confirmed ? "✓" : "…"}</span>
              <span className="kasse-log-time">{time(entry.at)}</span>
              <span className="kasse-log-what">{entry.kind === "storno" ? "Storno" : entry.who}{entry.late && " · nachträglich"}</span>
              <span className="kasse-log-amount">{entry.kind === "storno" ? formatSigned(entry.amountCents) : formatCents(entry.amountCents)}</span>
              {entry.kind === "sale" && !cancelled && <button type="button" className="kasse-storno" onClick={() => setStorno(entry)}>Storno</button>}
            </li>;
          })}
        </ol>
        {view.checksumOk === false && <p role="alert" className="error-message">Prüfsumme stimmt nicht: Server-Summe und Einzelbuchungen weichen ab.</p>}
      </section>
    </div>

    <button type="button" className="secondary-button kasse-close-button" onClick={() => setClosing(true)}>Kasse abschließen</button>

    <Modal open={!!storno} onClose={() => setStorno(null)} title="Buchung stornieren?" maxWidth={420} className="interior-modal">
      {storno && <div className="modal-form">
        <p>{formatCents(storno.amountCents)} von {time(storno.at)} Uhr wird aus der Kasse herausgerechnet. Die Buchung bleibt im Protokoll sichtbar.</p>
        <div className="modal-buttons">
          <button type="button" className="secondary-button btn-small" onClick={() => setStorno(null)}>Abbrechen</button>
          <button type="button" className="danger-button btn-small" onClick={() => {
            try { record(sessionId, { type: "storno", saleId: storno.id }); setStorno(null); }
            catch (e) { setProblem(errorMessage(e, "Storno NICHT gespeichert.")); setStorno(null); }
          }}>Stornieren</button>
        </div>
      </div>}
    </Modal>
    <CloseDialog open={closing} view={view} onClose={() => setClosing(false)} onConfirm={(countedCents) => { record(sessionId, { type: "close", countedCents }); setClosing(false); }} />
  </>;
}

function CloseDialog({ open, view, onClose, onConfirm }: { open: boolean; view: View; onClose: () => void; onConfirm: (counted: number) => void }) {
  const [mode, setMode] = useState<"count" | "sum">("count");
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [sumText, setSumText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const counted = mode === "count" ? countedTotal(Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number(v) || 0]))) : parseEuro(sumText || "0");
  const diff = counted === null ? null : counted - view.expectedCents;
  return <Modal open={open} onClose={onClose} title="Kasse abschließen" maxWidth={520} className="interior-modal">
    <div className="modal-form kasse-close">
      {view.unconfirmed > 0 && <p role="alert" className="kasse-warning">{view.unconfirmed} {view.unconfirmed === 1 ? "Buchung ist" : "Buchungen sind"} noch nicht auf dem Server. Der Abschluss wird trotzdem auf diesem Gerät gespeichert und mit übertragen, sobald wieder Verbindung besteht.</p>}
      <div className="kasse-chips" role="group" aria-label="Zählweise">
        <button type="button" className="secondary-button btn-small" aria-pressed={mode === "count"} onClick={() => setMode("count")}>Scheine &amp; Münzen zählen</button>
        <button type="button" className="secondary-button btn-small" aria-pressed={mode === "sum"} onClick={() => setMode("sum")}>Summe eingeben</button>
      </div>
      {mode === "count"
        ? <div className="kasse-denoms">{DENOMINATIONS.map((value) => <label key={value}><span>{denominationLabel(value)}</span>
            <input inputMode="numeric" pattern="[0-9]*" placeholder="0" value={counts[value] ?? ""} onChange={(e) => setCounts((c) => ({ ...c, [value]: e.target.value.replace(/\D/g, "").slice(0, 4) }))} aria-label={`Anzahl ${denominationLabel(value)}`} />
          </label>)}</div>
        : <label className="kasse-field">Gezählt<span className="kasse-euro-input"><input inputMode="decimal" value={sumText} onChange={(e) => setSumText(e.target.value)} placeholder="0,00" /><span aria-hidden="true">€</span></span></label>}
      <dl className="kasse-summary">
        <div><dt>Soll</dt><dd>{formatCents(view.expectedCents)}</dd></div>
        <div><dt>Gezählt</dt><dd className="kasse-strong">{counted === null ? "–" : formatCents(counted)}</dd></div>
        <div><dt>Differenz</dt><dd className="kasse-diff" data-sign={diff === null ? undefined : Math.sign(diff)}>{diff === null ? "–" : formatSigned(diff)}</dd></div>
      </dl>
      {problem && <p role="alert" className="error-message">{problem}</p>}
      <div className="modal-buttons">
        <button type="button" className="secondary-button btn-small" onClick={onClose}>Weiter kassieren</button>
        <button type="button" className="primary-button btn-small" disabled={counted === null} onClick={() => {
          try { if (counted !== null) onConfirm(counted); } catch (e) { setProblem(errorMessage(e, "Abschluss NICHT gespeichert.")); }
        }}>Abschließen</button>
      </div>
    </div>
  </Modal>;
}

function Closed({ view, server, onNew }: { view: View; server: ServerSession | null; onNew: () => void }) {
  const counted = server?.countedCents ?? view.closedLocally?.countedCents ?? 0;
  const expected = server?.expectedCents ?? view.expectedCents;
  const diff = counted - expected;
  const confirmed = server?.status === "closed";
  return <section className="kasse-panel kasse-result">
    <h2>Kassenabschluss</h2>
    <dl className="kasse-summary">
      <div><dt>Wechselgeld</dt><dd>{formatCents(view.floatCents)}</dd></div>
      <div><dt>Umsatz ({view.saleCount} Buchungen)</dt><dd>{formatCents(view.netCents)}</dd></div>
      <div><dt>Soll</dt><dd>{formatCents(expected)}</dd></div>
      <div><dt>Gezählt</dt><dd className="kasse-strong">{formatCents(counted)}</dd></div>
      <div><dt>Differenz</dt><dd className="kasse-diff" data-sign={Math.sign(diff)}>{diff === 0 ? "stimmt ✓" : formatSigned(diff)}</dd></div>
    </dl>
    <p className="meta">{confirmed ? `✓ Auf dem Server gespeichert${server?.closedBy ? ` von ${server.closedBy}` : ""}.` : "… Abschluss ist auf diesem Gerät gespeichert und wird übertragen."}</p>
    {(server?.lateCount ?? 0) > 0 && <p className="kasse-warning">{server!.lateCount} Buchung(en) kamen erst nach dem Abschluss an (z. B. von einem Gerät, das offline war).</p>}
    <button type="button" className="primary-button" onClick={onNew} disabled={view.unconfirmed > 0} title={view.unconfirmed ? "Erst wenn alles übertragen ist" : undefined}>Neue Kasse öffnen</button>
    {view.unconfirmed > 0 && <small className="meta">Eine neue Kasse kann geöffnet werden, sobald alles übertragen ist.</small>}
  </section>;
}

function History({ sessions }: { sessions: ServerSession[] }) {
  return <section className="kasse-panel kasse-history">
    <h2>Letzte Abschlüsse</h2>
    <table>
      <thead><tr><th>Geöffnet</th><th>Umsatz</th><th>Soll</th><th>Gezählt</th><th>Differenz</th></tr></thead>
      <tbody>{sessions.map((s) => {
        const diff = (s.countedCents ?? 0) - (s.expectedCents ?? 0);
        return <tr key={s.id}>
          <td>{dateTime(s.openedAt)}<br /><small className="meta">{s.openedBy}{s.closedBy && s.closedBy !== s.openedBy ? ` → ${s.closedBy}` : ""}</small></td>
          <td>{formatCents(s.salesCents - s.stornoCents)}</td>
          <td>{formatCents(s.expectedCents ?? 0)}</td>
          <td>{formatCents(s.countedCents ?? 0)}</td>
          <td className="kasse-diff" data-sign={Math.sign(diff)}>{formatSigned(diff)}{s.lateCount > 0 && <small className="kasse-late" title="Nachträgliche Buchungen nach dem Abschluss"> +{s.lateCount} nachträgl.</small>}</td>
        </tr>;
      })}</tbody>
    </table>
  </section>;
}
