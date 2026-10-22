// Scriptable (iOS) home-screen widget: U15 +1, Ü15 +1 and Undo, with today's totals on the buttons.
// The token is embedded, so the generated script must be treated like a password.
export function scriptableWidget(origin: string, token: string) {
  return `// ChaxterLog – Zähl-Widget für Scriptable (mittlere Größe)
// Enthält deinen persönlichen Token: nicht weitergeben.
const BASE = ${JSON.stringify(`${origin}/api/v1`)};
const TOKEN = ${JSON.stringify(token)};
const APP = ${JSON.stringify(origin)};

const PETROL = new Color("#00698c"), DEEP = new Color("#004f6a"), YELLOW = new Color("#fffd24");
const files = FileManager.local();
const LOG = files.joinPath(files.documentsDirectory(), "chaxterlog-refresh.json");
const clock = new DateFormatter();
clock.dateFormat = "HH:mm:ss";

async function call(path, method, body) {
  const request = new Request(BASE + path);
  request.method = method;
  request.timeoutInterval = 10;
  request.headers = { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" };
  if (body) request.body = JSON.stringify(body);
  try { return await request.loadJSON(); } catch (error) { return { error: "Keine Verbindung", text: "Keine Verbindung zu ChaxterLog." }; }
}

// Every widget refresh and tap is logged, to measure how fast iOS refreshes the widget.
function readLog() { try { return JSON.parse(files.readString(LOG)); } catch (error) { return []; } }
function log(kind, data) {
  const entries = readLog();
  entries.unshift({ at: new Date().toISOString(), kind, u15: data.u15, o15: data.o15, updatedAt: data.updatedAt || null, error: data.error || null });
  files.writeString(LOG, JSON.stringify(entries.slice(0, 100)));
}

const runUrl = (action) => "scriptable:///run/" + encodeURIComponent(Script.name()) + "?action=" + action;

function button(row, width, title, value, action, color) {
  const box = row.addStack();
  box.layoutVertically();
  box.size = new Size(width, 92);
  box.setPadding(8, 10, 8, 10);
  box.cornerRadius = 16;
  box.backgroundColor = color;
  box.url = runUrl(action);
  const head = box.addText(title);
  head.font = action === "undo" ? Font.boldSystemFont(24) : Font.semiboldSystemFont(13);
  head.textColor = new Color("#ffffff", 0.8);
  box.addSpacer();
  if (value !== null) {
    const number = box.addText(String(value));
    number.font = Font.boldRoundedSystemFont(32);
    number.textColor = Color.white();
    number.minimumScaleFactor = 0.5;
  }
  const hint = box.addText(action === "undo" ? "zurück" : "+1");
  hint.font = Font.semiboldSystemFont(12);
  hint.textColor = YELLOW;
}

function widget(data) {
  const w = new ListWidget();
  w.backgroundColor = new Color("#f7f7f6");
  w.setPadding(12, 12, 12, 12);
  w.url = APP;
  const top = w.addStack();
  top.centerAlignContent();
  const title = top.addText("ChaxterLog");
  title.font = Font.boldSystemFont(14);
  title.textColor = new Color("#151515");
  top.addSpacer();
  const stamp = top.addText("Stand " + clock.string(new Date()));
  stamp.font = Font.systemFont(11);
  stamp.textColor = new Color("#6f6f6f");
  w.addSpacer(8);
  if (data.error) {
    const message = w.addText(data.text || data.error);
    message.font = Font.systemFont(13);
    message.textColor = new Color("#c4372b");
    w.addSpacer();
    return w;
  }
  const row = w.addStack();
  button(row, 112, "U15", data.u15, "u15", PETROL);
  row.addSpacer(8);
  button(row, 112, "Ü15", data.o15, "o15", PETROL);
  row.addSpacer(8);
  button(row, 56, "↶", null, "undo", DEEP);
  w.addSpacer();
  const changed = data.updatedAt ? " · geändert " + clock.string(new Date(data.updatedAt)) : "";
  const footer = w.addText("Gesamt " + data.total + changed);
  footer.font = Font.systemFont(11);
  footer.textColor = new Color("#464646");
  // iOS decides the actual refresh; this only asks for one as early as allowed.
  w.refreshAfterDate = new Date(Date.now() + 60 * 1000);
  return w;
}

function showLog() {
  const table = new UITable();
  table.showSeparators = true;
  const head = new UITableRow();
  head.isHeader = true;
  ["Zeit", "Abstand", "U15 / Ü15", "Quelle"].forEach((text) => head.addText(text));
  table.addRow(head);
  const entries = readLog();
  entries.forEach((entry, index) => {
    const row = new UITableRow();
    const next = entries[index + 1];
    const gap = next ? Math.round((new Date(entry.at) - new Date(next.at)) / 1000) : null;
    row.addText(clock.string(new Date(entry.at)));
    row.addText(gap === null ? "–" : gap >= 60 ? Math.floor(gap / 60) + " min " + (gap % 60) + " s" : gap + " s");
    row.addText(entry.error ? "Fehler" : entry.u15 + " / " + entry.o15);
    row.addText(entry.kind === "widget" ? "Widget" : "Tipp " + entry.kind);
    table.addRow(row);
  });
  return table.present();
}

const action = args.queryParameters.action;
if (config.runsInWidget) {
  const data = await call("/today", "GET");
  log("widget", data);
  Script.setWidget(widget(data));
} else if (action === "u15" || action === "o15" || action === "undo") {
  // Tapping a widget button opens Scriptable, counts and reports the new total.
  const data = action === "undo" ? await call("/undo", "POST", {}) : await call("/visit", "POST", { group: action });
  log(action, data);
  const note = new Notification();
  note.title = "ChaxterLog";
  note.body = data.text || data.error;
  await note.schedule();
} else {
  const menu = new Alert();
  menu.title = "ChaxterLog-Widget";
  menu.addAction("Widget-Vorschau");
  menu.addAction("Refresh-Protokoll");
  menu.addDestructiveAction("Protokoll leeren");
  menu.addCancelAction("Schließen");
  const choice = await menu.presentSheet();
  if (choice === 0) await widget(await call("/today", "GET")).presentMedium();
  if (choice === 1) await showLog();
  if (choice === 2) files.writeString(LOG, "[]");
}
Script.complete();
`;
}
