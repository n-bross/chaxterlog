"""Münzwaage für den Kasseneinsatz: erzeugt die STL-Dateien.

Ein Modul pro Münzstreifen: Grundplatte mit Wägezelle (47 x 12 x 6 mm, TAL221-Bauform),
HX711-Fach und vier einstellbaren Überlast-Anschlägen; darauf ein Träger, in den der
vorhandene gedruckte Münzstreifen gelegt wird. Die Module werden seitlich mit
Schwalbenschwänzen zusammengesteckt. Das mittlere Modul hat zusätzlich das ESP32-Fach.

Aufruf:  python generate.py            (Maße unten anpassen, dann neu erzeugen)
Benötigt: pip install manifold3d numpy matplotlib
"""
from __future__ import annotations

import math
import struct
from pathlib import Path

import numpy as np
from manifold3d import CrossSection, Manifold

# ---------------------------------------------------------------- Maße (mm) ---
# Vorhandener Münzstreifen (bitte nachmessen!)
STRIP_LEN = 140.0       # Länge des Streifens
STRIP_W = 45.0          # Breite des Streifens
STRIP_CLEARANCE = 0.4   # Luft rundum, damit der Streifen leicht rein und raus geht

# Träger (hier liegt der Streifen drin)
FLOOR = 3.0             # Bodendicke
RIM_WALL = 1.6          # Randdicke
RIM_H = 4.0             # Randhöhe über dem Boden
GRIP_W = 22.0           # Grifflücke im Rand an den Schmalseiten (0 = keine)

# Abstand zwischen zwei Trägern – sie dürfen sich nie berühren
LANE_GAP = 2.0

# Wägezelle (TAL221-Bauform)
CELL_L, CELL_W, CELL_H = 47.0, 12.0, 6.0
CLAMP_LEN = 14.0        # Länge des festen Endblocks der Zelle (nur bis zur Verjüngung/Bohrung!)
SCREW_SLOT = (2.5, 11.5)  # Langloch für die M3-Schrauben, Abstand vom Zellenende (von, bis)

# Höhen
BASE_T = 5.0            # Grundplatte
PAD_H = 2.0             # Sockel unter dem festen Zellenende (Luft unter dem freien Ende)
SPACER_H = 2.0          # Abstandshalter auf dem freien Ende (Luft über dem festen Ende)

# Überlast-Anschläge (M3x10 Zylinderkopf, von unten eingedreht)
STOP_INSET_X = 14.0
STOP_INSET_Y = 7.0
STOP_POST_D = 8.0
STOP_POST_TOP_GAP = 3.0   # Pfosten endet so weit unter dem Träger; die Schraube überbrückt den Rest
STOP_COUNTERBORE = 6.0    # Senkung für den Schraubenkopf (von unten)

# Elektronik
HX_L, HX_W, HX_DEPTH = 36.0, 22.0, 1.0      # HX711-Platine (Mulde zum Fixieren mit Klebepad)
ESP_L, ESP_W, ESP_DEPTH = 24.0, 19.0, 1.5   # ESP32-C3 SuperMini
CHANNEL_W, CHANNEL_DEPTH = 6.0, 2.5         # Kabelkanal quer über alle Module

# Schwalbenschwanz-Verbindung zwischen den Modulen
DOVE_NECK, DOVE_TIP, DOVE_DEPTH, DOVE_FIT = 6.0, 10.0, 5.0, 0.25
DOVE_X = 35.0

M3_CLEAR_R = 1.7
M3_TAP_R = 1.25          # Kernloch: Schraube schneidet ihr Gewinde selbst in den Kunststoff
M3_HEAD_R = 3.1          # Zylinderkopf 5,5 mm + Luft
M3_HEAD_H = 3.2
M3_CSK_R = 3.0           # Senkkopf 6 mm
M3_CSK_H = 1.7

SEG = 48

# ------------------------------------------------------------- abgeleitet ----
CARRIER_L = STRIP_LEN + 2 * (STRIP_CLEARANCE + RIM_WALL)
CARRIER_W = STRIP_W + 2 * (STRIP_CLEARANCE + RIM_WALL)
BASE_L = CARRIER_L
BASE_W = CARRIER_W + LANE_GAP
Z_PAD = BASE_T
Z_CELL = Z_PAD + PAD_H
Z_SPACER = Z_CELL + CELL_H
Z_CARRIER = Z_SPACER + SPACER_H
FIXED_X0 = -CELL_L / 2                      # festes Ende links
FREE_X1 = CELL_L / 2                        # freies Ende rechts
HX_X0 = FREE_X1 + 3.0
CHANNEL_X = BASE_L / 2 - 3.0 - CHANNEL_W / 2


def box(x0, x1, y0, y1, z0, z1) -> Manifold:
    return Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0])


def cyl(x, y, z0, z1, r, r_top=None) -> Manifold:
    return Manifold.cylinder(z1 - z0, r, r if r_top is None else r_top, SEG).translate([x, y, z0])


def slot(xa, xb, y, z0, z1, r, r_top=None) -> Manifold:
    """Langloch in x-Richtung (Hülle zweier Zylinder)."""
    return Manifold.batch_hull([cyl(xa, y, z0, z1, r, r_top), cyl(xb, y, z0, z1, r, r_top)])


def dovetail(fit: float) -> Manifold:
    neck, tip = DOVE_NECK / 2 + fit, DOVE_TIP / 2 + fit
    poly = CrossSection([[(-neck, 0.0), (neck, 0.0), (tip, DOVE_DEPTH + fit), (-tip, DOVE_DEPTH + fit)]])
    return poly.extrude(BASE_T + 2).translate([0, 0, -1])


def fixed_slots():
    a, b = FIXED_X0 + SCREW_SLOT[0], FIXED_X0 + SCREW_SLOT[1]
    return a, b


def free_slots():
    a, b = FREE_X1 - SCREW_SLOT[1], FREE_X1 - SCREW_SLOT[0]
    return a, b


def stop_positions():
    sx, sy = BASE_L / 2 - STOP_INSET_X, CARRIER_W / 2 - STOP_INSET_Y
    return [(x, y) for x in (-sx, sx) for y in (-sy, sy)]


def base(with_esp: bool) -> Manifold:
    m = box(-BASE_L / 2, BASE_L / 2, -BASE_W / 2, BASE_W / 2, 0, BASE_T)
    # Sockel unter dem festen Zellenende
    m += box(FIXED_X0, FIXED_X0 + CLAMP_LEN, -CELL_W / 2, CELL_W / 2, Z_PAD, Z_CELL)
    # Anschlag-Pfosten
    post_top = Z_CARRIER - STOP_POST_TOP_GAP
    for x, y in stop_positions():
        m += cyl(x, y, BASE_T - 0.01, post_top, STOP_POST_D / 2)
    # Schwalbenschwänze: Zapfen auf +y, Nut auf -y
    for x in (-DOVE_X, DOVE_X):
        m += dovetail(0).translate([x, BASE_W / 2 - 0.01, 0]) ^ box(x - 20, x + 20, BASE_W / 2 - 1, BASE_W / 2 + 20, 0, BASE_T)

    cut = []
    a, b = fixed_slots()
    cut.append(slot(a, b, 0, -1, Z_CELL + 1, M3_CLEAR_R))
    cut.append(slot(a, b, 0, -1, M3_HEAD_H, M3_HEAD_R))
    for x, y in stop_positions():
        cut.append(cyl(x, y, -1, Z_CARRIER, M3_TAP_R))
        cut.append(cyl(x, y, -1, STOP_COUNTERBORE, M3_HEAD_R))
    for x in (-DOVE_X, DOVE_X):
        cut.append(dovetail(DOVE_FIT).translate([x, -BASE_W / 2 - 0.01, 0]))
    # HX711-Mulde neben dem freien Zellenende
    cut.append(box(HX_X0, HX_X0 + HX_L, -HX_W / 2, HX_W / 2, BASE_T - HX_DEPTH, BASE_T + 1))
    # Kabelkanal quer über die ganze Breite (läuft über alle Module durch)
    cut.append(box(CHANNEL_X - CHANNEL_W / 2, CHANNEL_X + CHANNEL_W / 2, -BASE_W, BASE_W, BASE_T - CHANNEL_DEPTH, BASE_T + 1))
    if with_esp:
        # ESP32 am linken Rand, USB-C zeigt nach außen
        cut.append(box(-BASE_L / 2 - 1, -BASE_L / 2 + ESP_L, -ESP_W / 2, ESP_W / 2, BASE_T - ESP_DEPTH, BASE_T + 1))
    for c in cut:
        m -= c
    return m


def carrier() -> Manifold:
    """Träger, liegend gedruckt (Boden auf dem Druckbett)."""
    m = box(-CARRIER_L / 2, CARRIER_L / 2, -CARRIER_W / 2, CARRIER_W / 2, 0, FLOOR + RIM_H)
    m -= box(-CARRIER_L / 2 + RIM_WALL, CARRIER_L / 2 - RIM_WALL, -CARRIER_W / 2 + RIM_WALL, CARRIER_W / 2 - RIM_WALL, FLOOR, FLOOR + RIM_H + 1)
    if GRIP_W > 0:
        m -= box(-CARRIER_L, CARRIER_L, -GRIP_W / 2, GRIP_W / 2, FLOOR + 1.0, FLOOR + RIM_H + 1)
    a, b = free_slots()
    m -= slot(a, b, 0, -1, FLOOR + 1, M3_CLEAR_R)
    m -= slot(a, b, 0, FLOOR - M3_CSK_H, FLOOR + 0.01, M3_CLEAR_R, M3_CSK_R)
    return m


def spacer() -> Manifold:
    a, b = free_slots()
    m = box(FREE_X1 - CLAMP_LEN, FREE_X1, -CELL_W / 2, CELL_W / 2, 0, SPACER_H)
    m -= slot(a, b, 0, -1, SPACER_H + 1, M3_CLEAR_R)
    return m.translate([-(FREE_X1 - CLAMP_LEN / 2), 0, 0])


def cell_dummy() -> Manifold:
    return box(-CELL_L / 2, CELL_L / 2, -CELL_W / 2, CELL_W / 2, Z_CELL, Z_SPACER)


# ------------------------------------------------------------------ Export ---
def mesh_arrays(m: Manifold):
    mesh = m.to_mesh()
    verts = np.asarray(mesh.vert_properties)[:, :3]
    tris = np.asarray(mesh.tri_verts)
    return verts, tris


def write_stl(m: Manifold, path: Path) -> None:
    verts, tris = mesh_arrays(m)
    with path.open("wb") as f:
        f.write(b"Muenzwaage".ljust(80, b" "))
        f.write(struct.pack("<I", len(tris)))
        for t in tris:
            p = verts[t]
            n = np.cross(p[1] - p[0], p[2] - p[0])
            length = np.linalg.norm(n)
            n = n / length if length else n
            f.write(struct.pack("<12fH", *n, *p[0], *p[1], *p[2], 0))


def module_assembly(with_esp: bool, explode: float = 0.0) -> list[tuple[Manifold, str]]:
    sp = spacer().translate([FREE_X1 - CLAMP_LEN / 2, 0, Z_SPACER + explode])
    return [
        (base(with_esp), "#d9b44a"),
        (cell_dummy().translate([0, 0, explode * 0.5]), "#a8adb3"),
        (sp, "#4a90d9"),
        (carrier().translate([0, 0, Z_CARRIER + explode * 2]), "#f2d27a"),
    ]


def render(parts: list[tuple[Manifold, str]], path: Path, elev: float, azim: float, title: str, width: int = 1200) -> None:
    """Kleiner Z-Buffer-Renderer (orthografisch), damit die Vorschau ohne CAD-Programm klappt."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    e, a = math.radians(elev), math.radians(azim)
    view = np.array([math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)])  # zur Kamera
    right = np.cross([0, 0, 1], view); right /= np.linalg.norm(right)
    up = np.cross(view, right)
    light = 0.6 * view + 0.5 * up + 0.3 * right; light /= np.linalg.norm(light)
    all_p, all_c = [], []
    for m, color in parts:
        verts, tris = mesh_arrays(m)
        all_p.append(verts[tris]); all_c.append(np.repeat([matplotlib.colors.to_rgb(color)], len(tris), 0))
    polys, cols = np.concatenate(all_p), np.concatenate(all_c)
    proj = np.stack([polys @ right, polys @ up, polys @ view], -1)
    lo, hi = proj[..., :2].reshape(-1, 2).min(0), proj[..., :2].reshape(-1, 2).max(0)
    scale = (width - 40) / (hi - lo).max()
    h = int((hi - lo)[1] * scale) + 40
    w = int((hi - lo)[0] * scale) + 40
    px = (proj[..., 0] - lo[0]) * scale + 20
    py = (hi[1] - proj[..., 1]) * scale + 20
    depth = np.full((h, w), -np.inf); img = np.ones((h, w, 3))
    normals = np.cross(polys[:, 1] - polys[:, 0], polys[:, 2] - polys[:, 0])
    normals /= np.linalg.norm(normals, axis=1, keepdims=True) + 1e-12
    shade = 0.35 + 0.65 * np.abs(normals @ light)
    for i in range(len(polys)):
        x, y, z = px[i], py[i], proj[i, :, 2]
        x0, x1 = max(int(x.min()), 0), min(int(x.max()) + 1, w - 1)
        y0, y1 = max(int(y.min()), 0), min(int(y.max()) + 1, h - 1)
        if x1 < x0 or y1 < y0:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        d = (y[1] - y[2]) * (x[0] - x[2]) + (x[2] - x[1]) * (y[0] - y[2])
        if abs(d) < 1e-9:
            continue
        l0 = ((y[1] - y[2]) * (gx - x[2]) + (x[2] - x[1]) * (gy - y[2])) / d
        l1 = ((y[2] - y[0]) * (gx - x[2]) + (x[0] - x[2]) * (gy - y[2])) / d
        l2 = 1 - l0 - l1
        inside = (l0 >= -1e-6) & (l1 >= -1e-6) & (l2 >= -1e-6)
        zz = l0 * z[0] + l1 * z[1] + l2 * z[2]
        sub = depth[y0:y1 + 1, x0:x1 + 1]
        hit = inside & (zz > sub)
        sub[hit] = zz[hit]
        img[y0:y1 + 1, x0:x1 + 1][hit] = cols[i] * shade[i]
    # Kanten betonen: Tiefensprünge dunkel zeichnen
    finite = np.where(np.isfinite(depth), depth, depth[np.isfinite(depth)].min() - 50)
    edge = (np.abs(np.diff(finite, axis=0, prepend=finite[:1])) > 1.5) | (np.abs(np.diff(finite, axis=1, prepend=finite[:, :1])) > 1.5)
    img[edge] *= 0.35
    fig = plt.figure(figsize=(w / 110, h / 110 + 0.5), dpi=110)
    ax = fig.add_axes([0, 0, 1, h / (h + 55)]); ax.imshow(np.clip(img, 0, 1)); ax.set_axis_off()
    fig.suptitle(title, y=0.99)
    fig.savefig(path)
    plt.close(fig)


def main() -> None:
    out = Path(__file__).resolve().parent
    stl = out / "stl"
    stl.mkdir(exist_ok=True)
    parts = {
        "grundplatte.stl": base(False),
        "grundplatte_mit_esp32.stl": base(True),
        "traeger.stl": carrier(),
        "abstandshalter.stl": spacer(),
    }
    for name, m in parts.items():
        assert m.status().name == "NoError", name
        write_stl(m, stl / name)
        lo, hi = np.asarray(m.bounding_box()[:3]), np.asarray(m.bounding_box()[3:])
        size = hi - lo
        print(f"{name:28s} {size[0]:6.1f} x {size[1]:5.1f} x {size[2]:4.1f} mm  {m.volume() / 1000:5.1f} cm³")

    # Gesamtansicht: fünf Module nebeneinander, mittleres mit ESP32
    full: list[tuple[Manifold, str]] = []
    for i in range(5):
        for m, c in module_assembly(i == 2):
            full.append((m.translate([0, (i - 2) * BASE_W, 0]), c))
    render(full, out / "vorschau_gesamt.png", 28, -60, "5 Module zusammengesteckt")
    render(module_assembly(True, explode=12), out / "vorschau_modul.png", 20, -55, "Ein Modul (auseinandergezogen)")
    print(f"Gesamtmaß: {BASE_L:.1f} x {5 * BASE_W:.1f} mm, Höhe bis Trägerboden-Oberseite {Z_CARRIER + FLOOR:.1f} mm")


if __name__ == "__main__":
    main()
