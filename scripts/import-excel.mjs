import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not configured");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

// Use python to parse the xlsx cleanly
const pythonParseScript = `
import zipfile, xml.etree.ElementTree as ET, datetime, json

path = "/home/hermes/t3code/userdata/attachments/89142106-2bee-44de-b554-70656e1a06a0-d32faf5d-3b1f-4a9b-812e-ec35f161c000-xlsx.xlsx"
ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

with zipfile.ZipFile(path, "r") as z:
    shared_strings = []
    if "xl/sharedStrings.xml" in z.namelist():
        sst_root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in sst_root.findall("s:si", ns):
            t_texts = [t.text or "" for t in si.findall(".//s:t", ns)]
            shared_strings.append("".join(t_texts))

    sheet_root = ET.fromstring(z.read("xl/worksheets/sheet2.xml"))
    days = []
    for row in sheet_root.findall(".//s:row", ns):
        row_idx = int(row.get("r"))
        if row_idx < 5 or row_idx > 308:
            continue
        cells = {}
        for c in row.findall("s:c", ns):
            col = "".join(filter(str.isalpha, c.get("r")))
            val_el = c.find("s:v", ns)
            cells[col] = val_el.text if val_el is not None else None
        
        serial = cells.get("A")
        if not serial:
            continue
        d = datetime.date(1899, 12, 30) + datetime.timedelta(days=int(serial))
        u15 = int(float(cells.get("C") or 0))
        o15 = int(float(cells.get("D") or 0))
        unklar = int(float(cells.get("E") or 0))
        gesamt = int(float(cells.get("F") or 0))
        rand = int(float(cells.get("G") or 0)) if cells.get("G") else None
        note = cells.get("I")
        
        d_str = str(d)
        if d_str == "2026-02-13":
            u15 += 4
            o15 += 2
        elif d_str == "2026-05-06":
            u15 += 1
            o15 += 0
        elif d_str == "2026-05-14":
            u15 += 28
            o15 += 13
            
        if u15 > 0 or o15 > 0:
            days.append({
                "date": d_str,
                "u15": u15,
                "o15": o15,
                "note": note
            })
    print(json.dumps(days))
`;

const parsedDays = JSON.parse(execSync(`python3 -c '${pythonParseScript}'`, { encoding: "utf-8" }));
console.log(`Parsed ${parsedDays.length} days with visits from Tagesliste.`);

function deterministicUuid(seed) {
  const hash = createHash("sha256").update(seed).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

const hourFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" });
function berlinTimestamp(dateStr, hour, minute, second) {
  let iso = `${dateStr}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}+02:00`;
  let d = new Date(iso);
  if (Number(hourFormatter.format(d)) !== hour) {
    iso = `${dateStr}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}+01:00`;
    d = new Date(iso);
  }
  return d;
}

// Find admin user
const adminUser = await sql`SELECT id, name FROM "user" WHERE role = 'admin' LIMIT 1`;
const adminId = adminUser[0]?.id ?? "Bhe3UJDrc4tClInfAP8i2meaioiaLcSD";
const adminName = adminUser[0]?.name ?? "admin";
console.log(`Using admin actor: ${adminName} (${adminId})`);

const importDeviceId = "c4a87e10-2026-4000-8000-000000000001";
const importDeviceName = "Tagesliste 2026 (Excel)";
const importPlatform = "Excel-Import · Chaxter_2026_Tagesliste-1.xlsx";

// Register device
await sql`
  INSERT INTO chaxter_devices (id, name, platform, last_user, first_seen, last_seen)
  VALUES (${importDeviceId}, ${importDeviceName}, ${importPlatform}, ${adminName}, now(), now())
  ON CONFLICT (id) DO UPDATE SET last_seen = now(), last_user = ${adminName}
`;
console.log(`Import device registered: ${importDeviceId}`);

const allVisits = [];

for (const day of parsedDays) {
  const d = new Date(`${day.date}T12:00:00Z`);
  const dayOfWeek = (d.getUTCDay() + 6) % 7; // 0 = Mo, 1 = Di, 2 = Mi, 3 = Do, 4 = Fr, 5 = Sa, 6 = So
  
  let startHour = 15;
  let startMinute = 30;
  let totalMinutes = 240; // 15:30 to 19:30

  if (dayOfWeek === 2) {
    // Mittwoch: opens 14:30
    startHour = 14;
    startMinute = 30;
    totalMinutes = 300; // 14:30 to 19:30
  } else if (dayOfWeek === 5) {
    // Samstag: opens 15:00
    startHour = 15;
    startMinute = 0;
    totalMinutes = 270; // 15:00 to 19:30
  }

  const uCount = day.u15;
  const oCount = day.o15;
  const total = uCount + oCount;

  // Interleave U15 and O15 visitors across the opening hours
  // Create an array of groups
  const groups = [];
  let uLeft = uCount;
  let oLeft = oCount;
  while (uLeft > 0 || oLeft > 0) {
    if (uLeft > 0 && (oLeft === 0 || uLeft / uCount >= oLeft / oCount)) {
      groups.push("u15");
      uLeft--;
    } else {
      groups.push("o15");
      oLeft--;
    }
  }

  let uIdx = 0;
  let oIdx = 0;

  for (let i = 0; i < total; i++) {
    const group = groups[i];
    const seqInGroup = group === "u15" ? uIdx++ : oIdx++;

    const progress = (i + 0.5) / total;
    const minuteOffset = progress * totalMinutes;
    const hour = startHour + Math.floor((startMinute + minuteOffset) / 60);
    const minute = Math.floor((startMinute + minuteOffset) % 60);
    const second = Math.floor(((startMinute + minuteOffset) * 60) % 60);

    const timestamp = berlinTimestamp(day.date, hour, minute, second);
    const id = deterministicUuid(`chaxter:2026:${day.date}:${group}:${seqInGroup}`);

    allVisits.push({
      id,
      age_group: group,
      occurred_at: timestamp.toISOString(),
      click_order: timestamp.getTime(),
      cancelled: false,
      device_id: importDeviceId,
      device_name: importDeviceName,
      platform: importPlatform,
      user_id: null,
      username: null,
      legacy: true,
      imported_by: adminId,
    });
  }
}

console.log(`Generated ${allVisits.length} visits to insert.`);
const uTotal = allVisits.filter(v => v.age_group === "u15").length;
const oTotal = allVisits.filter(v => v.age_group === "o15").length;
console.log(`U15: ${uTotal}, Ü15: ${oTotal}, Total: ${uTotal + oTotal}`);

// Insert in batches of 500
const BATCH_SIZE = 500;
let insertedCount = 0;
for (let i = 0; i < allVisits.length; i += BATCH_SIZE) {
  const batch = allVisits.slice(i, i + BATCH_SIZE);
  await sql`
    INSERT INTO chaxter_visits (id, age_group, occurred_at, click_order, cancelled, device_id, device_name, platform, user_id, username, legacy, imported_by)
    SELECT id, age_group, occurred_at, click_order, cancelled, device_id, device_name, platform, user_id, username, legacy, imported_by
    FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
      AS batch(id uuid, age_group text, occurred_at timestamptz, click_order double precision, cancelled boolean, device_id uuid, device_name text, platform text, user_id text, username text, legacy boolean, imported_by text)
    ON CONFLICT (id) DO UPDATE SET
      age_group = EXCLUDED.age_group,
      occurred_at = EXCLUDED.occurred_at,
      click_order = EXCLUDED.click_order,
      legacy = EXCLUDED.legacy,
      device_id = EXCLUDED.device_id,
      device_name = EXCLUDED.device_name,
      platform = EXCLUDED.platform,
      imported_by = EXCLUDED.imported_by
  `;
  insertedCount += batch.length;
  process.stdout.write(`Inserted ${insertedCount} / ${allVisits.length} visits...\r`);
}

console.log(`\nSuccessfully imported ${allVisits.length} visits into database!`);
