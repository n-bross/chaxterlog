"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { createId, getDevice } from "@/lib/device";
import { errorMessage } from "@/lib/errors";
import {
  buttonItem, cartAdd, cartRemove, cartTotals, changeBreakdown, countedTotal, CURRENT_KEY, customItem, DEFAULT_BUTTONS, DENOMINATIONS, denominationLabel, EMPTY_KEYPAD,
  formatCents, formatSigned, KASSE_CHANGE, keypadPress, keypadTotal, nextSeq, parseEuro, PFAND_CENTS, pruneOps, readOps, saveOp, sessionView, validateButtons,
  type CartLine, type KasseButton, type KasseOp, type Keypad, type ServerEntry, type ServerSession, type StoredOp,
} from "@/lib/kasse";
import { useKasseSync, type KasseSyncState } from "@/lib/use-kasse-sync";
import { Modal } from "./interior/modal";
import { SegmentedControl } from "./interior/segmented-control";

type SessionData = { session: ServerSession | null; entries: ServerEntry[] };
type Overview = { open: ServerSession[]; closed: ServerSession[] };
const OVERVIEW_CACHE = "chaxterkasse:overview:v1";
const BUTTONS_CACHE = "chaxterkasse:buttons:v1";
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

export default function Kasse({ user }: { user: { username: string; role: string } }) {
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

  // Queries wait for the auth token; until then the page runs on this device's data and the cache.
  const { isAuthenticated } = useConvexAuth();
  const liveOverview = useQuery(api.kasse.overview, isAuthenticated ? {} : "skip");
  const liveSession = useQuery(api.kasse.session, isAuthenticated && sessionId ? { id: sessionId } : "skip");
  const liveButtons = useQuery(api.kasse.buttons, isAuthenticated ? {} : "skip");
  useEffect(() => { if (liveOverview) writeJson(OVERVIEW_CACHE, liveOverview); }, [liveOverview]);
  useEffect(() => { if (liveButtons) writeJson(BUTTONS_CACHE, liveButtons); }, [liveButtons]);
  const buttons = liveButtons ?? (ready ? readJson<KasseButton[]>(BUTTONS_CACHE) : null) ?? DEFAULT_BUTTONS;
  useEffect(() => { if (liveSession && sessionId) writeJson(sessionCache(sessionId), liveSession); }, [liveSession, sessionId]);
  // Offline after a reload: show the last server state merged with this device's bookings.
  const overview = liveOverview ?? (ready ? readJson<Overview>(OVERVIEW_CACHE) : null);
  const server = liveSession ?? (ready && sessionId ? readJson<SessionData>(sessionCache(sessionId)) : null);
  useEffect(() => { if (liveOverview) try { pruneOps(localStorage, new Set(liveOverview.closed.map((s) => s.id))); } catch { /* Cleanup is optional. */ } }, [liveOverview]);

  const [tab, setTab] = useState<"kassieren" | "uebersicht">("kassieren");
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
          : <>
            <SegmentedControl className="kasse-tabs" label="Ansicht" value={tab} onValueChange={(value) => setTab(value as typeof tab)}
              options={[{ value: "kassieren", label: "Kassieren" }, { value: "uebersicht", label: `Übersicht · ${formatCents(view.expectedCents)}` }]} />
            <Register sessionId={sessionId} view={view} buttons={buttons} canEdit={user.role === "admin"} tab={tab} />
          </>}
      {overview && overview.closed.length > 0 && (view?.closed || (view && tab === "uebersicht")) && <History sessions={overview.closed} />}
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
      {last && <small id="float-hint" className="kasse-hint">Letztes Mal: {formatCents(last.floatCents)}</small>}
      {problem && <p role="alert" className="error-message">{problem}</p>}
      <button type="submit" className="primary-button">Kasse öffnen</button>
    </form>
  </>;
}

type View = ReturnType<typeof sessionView>;

function Register({ sessionId, view, buttons, canEdit, tab }: { sessionId: string; view: View; buttons: KasseButton[]; canEdit: boolean; tab: "kassieren" | "uebersicht" }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [keypad, setKeypad] = useState<Keypad>(EMPTY_KEYPAD);
  const [showKeypad, setShowKeypad] = useState(false);
  const [given, setGiven] = useState<number | null>(null);
  const [givenText, setGivenText] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [storno, setStorno] = useState<View["entries"][number] | null>(null);
  const [closing, setClosing] = useState(false);
  const [editing, setEditing] = useState(false);
  const result = cartTotals(cart, given);
  const reset = () => { setCart([]); setKeypad(EMPTY_KEYPAD); setGiven(null); setGivenText(""); };
  const custom = keypadTotal(keypad);
  const addCustom = () => { if (custom) { setCart((c) => cartAdd(c, { ...customItem(custom), label: formatCents(custom) })); setKeypad(EMPTY_KEYPAD); } };

  const book = () => {
    if (!cart.length) return;
    try {
      record(sessionId, { type: "sale", amountCents: result.till });
      setFlash(`${formatCents(result.till)} gebucht`); setProblem(null); reset();
      setTimeout(() => setFlash(null), 2200);
    } catch (e) { setProblem(errorMessage(e, "Buchung NICHT gespeichert – bitte erneut versuchen.")); }
  };
  // Hardware keyboards (tablet with keyboard, laptop) can type other amounts directly.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (closing || storno || editing || (event.target as HTMLElement)?.closest?.("input, textarea")) return;
      const map: Record<string, string> = { Backspace: "back", Escape: "clear", Delete: "clear" };
      const key = /^\d$/.test(event.key) ? event.key : map[event.key];
      if (key) { event.preventDefault(); setShowKeypad(true); setKeypad((k) => keypadPress(k, key)); }
      else if (event.key === "+") { event.preventDefault(); addCustom(); }
      else if (event.key === "Enter") { event.preventDefault(); if (custom) addCustom(); else book(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const amounts = buttons.filter((b) => !b.pfand), drinks = buttons.filter((b) => b.pfand);
  const tap = (b: KasseButton) => setCart((c) => cartAdd(c, buttonItem(b)));
  const recent = [...view.entries].reverse().slice(0, 40);
  const dialogs = <>

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
    {editing && <ButtonEditor buttons={buttons} onClose={() => setEditing(false)} />}
    <CloseDialog open={closing} view={view} onClose={() => setClosing(false)} onConfirm={(countedCents) => { record(sessionId, { type: "close", countedCents }); setClosing(false); }} />
  </>;
  if (tab === "uebersicht") return <>
    <section className="kasse-panel kasse-status">
      <div className="kasse-status-main"><span className="kasse-hint">Soll in der Kasse</span><strong>{formatCents(view.expectedCents)}</strong></div>
      <dl className="kasse-summary">
        <div><dt>Wechselgeld</dt><dd>{formatCents(view.floatCents)}</dd></div>
        <div><dt>Umsatz</dt><dd>{formatCents(view.netCents)}</dd></div>
        <div><dt>Buchungen</dt><dd>{view.saleCount}</dd></div>
        {view.openedAt && <div><dt>Geöffnet</dt><dd>{dateTime(view.openedAt)}</dd></div>}
      </dl>
      <button type="button" className="primary-button" onClick={() => setClosing(true)}>Kasse abschließen</button>
    </section>
    <section className="kasse-panel kasse-log" aria-label="Buchungen">
      <h2>Buchungen</h2>
      {recent.length === 0 && <p className="kasse-hint">Noch keine Buchung.</p>}
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
    {problem && <p role="alert" className="error-message">{problem}</p>}
    {dialogs}
  </>;

  return <>
      <section className="kasse-register" aria-label="Kassieren">
        {drinks.length > 0 && <div className="kasse-buttons kasse-buttons-drinks">{drinks.map((b) => <button key={b.id} type="button" className="kasse-btn kasse-btn-drink" onClick={() => tap(b)}>
          <span className="kasse-btn-name">{b.label}</span>
          <strong>{formatCents(b.priceCents + PFAND_CENTS)}</strong>
          <small>{formatCents(b.priceCents)} + {formatCents(PFAND_CENTS)} Pfand</small>
        </button>)}</div>}
        <div className="kasse-buttons kasse-buttons-amounts">
          {amounts.map((b) => <button key={b.id} type="button" className="kasse-btn" onClick={() => tap(b)}>
            <strong>{b.label}</strong>{b.label.replace(/\s/g, "") !== formatCents(b.priceCents).replace(/\s/g, "") && <small>{formatCents(b.priceCents)}</small>}
          </button>)}
          <button type="button" className="kasse-btn kasse-btn-other" aria-expanded={showKeypad} onClick={() => setShowKeypad((v) => !v)}><strong>{showKeypad ? "×" : "…"}</strong><small>{showKeypad ? "schließen" : "anderer"}</small></button>
        </div>
        {showKeypad && <div className="kasse-custom">
          <output className="kasse-display" aria-label={`Betrag ${formatCents(custom)}`}><span className="kasse-amount">{formatCents(custom)}</span></output>
          <div className="kasse-keypad">
            {["7", "8", "9", "back", "4", "5", "6", "clear", "1", "2", "3", "add", "0", "00"].map((key) => {
              const label = key === "back" ? "⌫" : key === "clear" ? "C" : key === "add" ? "Dazu" : key;
              return <button key={key} type="button" className={`kasse-key${/^\d/.test(key) ? "" : " kasse-key-op"}${key === "0" || key === "00" ? " kasse-key-wide" : ""}`}
                disabled={key === "add" && !custom}
                aria-label={key === "back" ? "Letzte Ziffer löschen" : key === "clear" ? "Betrag löschen" : key === "add" ? "Betrag zum Bon hinzufügen" : undefined}
                onClick={() => key === "add" ? addCustom() : setKeypad((k) => keypadPress(k, key))}>{label}</button>;
            })}
          </div>
        </div>}

        {cart.length > 0 && <ul className="kasse-bon" aria-label="Bon">{cart.map((line) => <li key={line.key}>
          <span>{line.count > 1 && <b>{line.count}× </b>}{line.label}</span>
          <span className="kasse-bon-amount">{formatCents((line.tillCents + line.pfandCents) * line.count)}</span>
          <button type="button" aria-label={`${line.label} einmal entfernen`} onClick={() => setCart((c) => cartRemove(c, line.key))}>−</button>
        </li>)}</ul>}

        {result.customerPays > 0 && <div className="kasse-given" role="group" aria-label="Gegeben (Rückgeld berechnen)">
          <span className="kasse-hint">Gegeben</span>
          <div className="kasse-chips">
            {[500, 1000, 2000, 5000].map((cents) => <button key={cents} type="button" className="secondary-button btn-small" aria-pressed={given === cents} onClick={() => { setGiven(given === cents ? null : cents); setGivenText(""); }}>{cents / 100} €</button>)}
            <input className="kasse-given-input" inputMode="decimal" placeholder="anderer" value={givenText} onChange={(e) => { setGivenText(e.target.value); setGiven(parseEuro(e.target.value)); }} aria-label="Gegebener Betrag" />
          </div>
        </div>}
        {problem && <p role="alert" className="error-message">{problem}</p>}
        {canEdit && <button type="button" className="kasse-edit-link" onClick={() => setEditing(true)}>Knöpfe bearbeiten</button>}

        {/* Always in reach: the total, what goes into the till, and the booking button. */}
        <div className="kasse-pay-bar" aria-live="polite">
          <div className="kasse-pay-totals">
            <div className="kasse-pay-customer"><span>Gesamt</span><strong>{formatCents(result.customerPays)}</strong>{result.deposit > 0 && <small>inkl. {formatCents(result.deposit)} Pfand</small>}</div>
            {/* Only differs from the total when deposit is involved. */}
            {result.deposit > 0 && <div className="kasse-pay-till"><span>In die Kasse legen</span><strong>{formatCents(result.till)}</strong></div>}
          </div>
          {result.change !== null && result.customerPays > 0 && (result.change >= 0
            ? <p className="kasse-change">Rückgeld <strong>{formatCents(result.change)}</strong> <small>{changeBreakdown(result.change).map((c) => `${c.count}× ${denominationLabel(c.cents)}`).join(", ")}</small></p>
            : <p className="kasse-change" data-short>Es fehlen noch <strong>{formatCents(-result.change)}</strong></p>)}
          <div className="kasse-pay-actions">
            <button type="button" className="secondary-button kasse-clear" onClick={reset} disabled={!cart.length}>Leeren</button>
            <button type="button" className="primary-button kasse-book" onClick={book} disabled={!cart.length}>{flash ? `✓ ${flash}` : !cart.length ? "Knopf antippen" : "Buchen"}</button>
          </div>
        </div>
      </section>
      {dialogs}
  </>;
}

function ButtonEditor({ buttons, onClose }: { buttons: KasseButton[]; onClose: () => void }) {
  const save = useMutation(api.kasse.saveButtons);
  const [rows, setRows] = useState(() => buttons.map((b) => ({ ...b, price: (b.priceCents / 100).toFixed(2).replace(".", ",") })));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const update = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((r) => r.map((row, j) => j === i ? { ...row, ...patch } : row));
  const move = (i: number, by: number) => setRows((r) => { const next = [...r]; const [row] = next.splice(i, 1); next.splice(Math.max(0, Math.min(next.length, i + by)), 0, row); return next; });
  const submit = async () => {
    const result: KasseButton[] = [];
    for (const row of rows) {
      const cents = parseEuro(row.price);
      if (cents === null) return setProblem(`Preis bei „${row.label || "ohne Namen"}“ ist ungültig.`);
      result.push({ id: row.id, label: row.label.trim(), priceCents: cents, pfand: row.pfand });
    }
    const invalid = validateButtons(result);
    if (invalid) return setProblem(invalid);
    setBusy(true);
    try { await save({ buttons: result }); onClose(); } catch (e) { setProblem(errorMessage(e, "Speichern fehlgeschlagen – Verbindung prüfen.")); } finally { setBusy(false); }
  };
  return <Modal open onClose={() => !busy && onClose()} title="Knöpfe bearbeiten" maxWidth={560} className="interior-modal">
    <div className="modal-form kasse-editor">
      <p className="kasse-hint">Mit „+ Pfand“ werden 0,50 € für den Kunden dazugerechnet; in die Kasse geht nur der Preis. Gilt für alle Geräte.</p>
      {rows.map((row, i) => <div key={row.id} className="kasse-editor-row">
        <input aria-label="Name" value={row.label} maxLength={30} onChange={(e) => update(i, { label: e.target.value })} placeholder="Name" />
        <input aria-label="Preis" inputMode="decimal" value={row.price} onChange={(e) => update(i, { price: e.target.value })} placeholder="0,00" />
        <label className="kasse-editor-pfand"><input type="checkbox" checked={row.pfand} onChange={(e) => update(i, { pfand: e.target.checked })} /> + Pfand</label>
        <span className="kasse-editor-actions">
          <button type="button" aria-label="Nach oben" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
          <button type="button" aria-label="Entfernen" onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>✕</button>
        </span>
      </div>)}
      <button type="button" className="secondary-button btn-small" onClick={() => setRows((r) => [...r, { id: createId().slice(0, 13), label: "", priceCents: 0, pfand: false, price: "" }])}>+ Knopf hinzufügen</button>
      {problem && <p role="alert" className="error-message">{problem}</p>}
      <div className="modal-buttons">
        <button type="button" className="secondary-button btn-small" onClick={onClose} disabled={busy}>Abbrechen</button>
        <button type="button" className="primary-button btn-small" onClick={() => void submit()} disabled={busy}>{busy ? "Speichern …" : "Speichern"}</button>
      </div>
    </div>
  </Modal>;
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
      <div><dt>Umsatz ({view.saleCount} {view.saleCount === 1 ? "Buchung" : "Buchungen"})</dt><dd>{formatCents(view.netCents)}</dd></div>
      <div><dt>Soll</dt><dd>{formatCents(expected)}</dd></div>
      <div><dt>Gezählt</dt><dd className="kasse-strong">{formatCents(counted)}</dd></div>
      <div><dt>Differenz</dt><dd className="kasse-diff" data-sign={Math.sign(diff)}>{diff === 0 ? "stimmt ✓" : formatSigned(diff)}</dd></div>
    </dl>
    <p className="kasse-hint">{confirmed ? `✓ Auf dem Server gespeichert${server?.closedBy ? ` von ${server.closedBy}` : ""}.` : "… Abschluss ist auf diesem Gerät gespeichert und wird übertragen."}</p>
    {(server?.lateCount ?? 0) > 0 && <p className="kasse-warning">{server!.lateCount} Buchung(en) kamen erst nach dem Abschluss an (z. B. von einem Gerät, das offline war).</p>}
    <button type="button" className="primary-button" onClick={onNew} disabled={view.unconfirmed > 0} title={view.unconfirmed ? "Erst wenn alles übertragen ist" : undefined}>Neue Kasse öffnen</button>
    {view.unconfirmed > 0 && <small className="kasse-hint">Eine neue Kasse kann geöffnet werden, sobald alles übertragen ist.</small>}
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
          <td>{dateTime(s.openedAt)}<br /><small className="kasse-hint">{s.openedBy}{s.closedBy && s.closedBy !== s.openedBy ? ` → ${s.closedBy}` : ""}</small></td>
          <td>{formatCents(s.salesCents - s.stornoCents)}</td>
          <td>{formatCents(s.expectedCents ?? 0)}</td>
          <td>{formatCents(s.countedCents ?? 0)}</td>
          <td className="kasse-diff" data-sign={Math.sign(diff)}>{formatSigned(diff)}{s.lateCount > 0 && <small className="kasse-late" title="Nachträgliche Buchungen nach dem Abschluss"> +{s.lateCount} nachträgl.</small>}</td>
        </tr>;
      })}</tbody>
    </table>
  </section>;
}
