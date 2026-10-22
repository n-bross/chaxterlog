// Scriptable (iOS) home-screen widget that shows today's totals. The token is embedded,
// so the generated script must be treated like a password.
export function scriptableWidget(origin: string, token: string) {
  return `// ChaxterLog – Tageszähler für Scriptable
// Enthält deinen persönlichen Token: nicht weitergeben.
const BASE = ${JSON.stringify(`${origin}/api/v1`)};
const TOKEN = ${JSON.stringify(token)};

async function load() {
  const request = new Request(BASE + "/today");
  request.headers = { Authorization: "Bearer " + TOKEN };
  request.timeoutInterval = 10;
  try { return await request.loadJSON(); } catch (error) { return { error: "Keine Verbindung" }; }
}

function cell(stack, label, value, color) {
  const box = stack.addStack();
  box.layoutVertically();
  const title = box.addText(label);
  title.font = Font.semiboldSystemFont(12);
  title.textColor = new Color("#ffffff", 0.75);
  const number = box.addText(String(value));
  number.font = Font.boldRoundedSystemFont(34);
  number.textColor = color;
  number.minimumScaleFactor = 0.5;
}

const data = await load();
const widget = new ListWidget();
widget.backgroundColor = new Color("#00698c");
widget.url = ${JSON.stringify(origin)};
widget.setPadding(14, 14, 14, 14);

const head = widget.addText("ChaxterLog heute");
head.font = Font.semiboldSystemFont(13);
head.textColor = Color.white();
widget.addSpacer(8);

if (data.error) {
  const message = widget.addText(data.error);
  message.font = Font.systemFont(13);
  message.textColor = new Color("#fffd24");
} else {
  const row = widget.addStack();
  cell(row, "U15", data.u15, Color.white());
  row.addSpacer();
  cell(row, "Ü15", data.o15, Color.white());
  widget.addSpacer(6);
  const total = widget.addText("Gesamt " + data.total);
  total.font = Font.semiboldSystemFont(14);
  total.textColor = new Color("#fffd24");
}

widget.addSpacer();
const stamp = widget.addDate(new Date());
stamp.applyTimeStyle();
stamp.font = Font.systemFont(10);
stamp.textColor = new Color("#ffffff", 0.6);
// iOS decides the actual refresh; this only asks for one after five minutes.
widget.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);

if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentSmall();
Script.complete();
`;
}
