"""Münzwaage: acht gewogene Münzmulden für 2 € bis 1 ct. Erzeugt die STL-Dateien.

Jede Münzsorte hat eine eigene Mulde auf einer eigenen Wägezelle (47 x 12 x 6 mm,
TAL221-Bauform). Weil die Waage zählt, liegen die Münzen lose in der Mulde – kein Stapeln.
Zwei Reihen à vier Mulden; jede Reihe ist eine Grundplatte, die beiden werden mit
Schwalbenschwänzen zusammengesteckt. Breite jeder Mulde und Tiefe jeder Reihe sind frei
einstellbar: oft benutzte Münzen bekommen mehr Platz.

Aufruf:  python generate.py            (LAYOUT unten anpassen, dann neu erzeugen)
Benötigt: pip install manifold3d numpy matplotlib
"""
from __future__ import annotations

import math
import struct
from pathlib import Path

import numpy as np
from manifold3d import CrossSection, FillRule, JoinType, Manifold

# ---------------------------------------------------------------- Maße (mm) ---
# Aufteilung: pro Reihe die Tiefe der Mulden und pro Mulde (Beschriftung, Breite).
# Beide Reihen müssen zusammen gleich breit sein (Breite + GAP je Mulde).
# Vorne (nah an der Hand) die oft gebrauchten Münzen, hinten die selteneren.
LAYOUT = {
    "hinten": {"depth": 64.0, "bowls": [("10 ct", 70.0), ("5 ct", 66.0), ("2 ct", 52.0), ("1 ct", 52.0)]},
    "vorne": {"depth": 88.0, "bowls": [("2 €", 62.0), ("1 €", 60.0), ("50 ct", 68.0), ("20 ct", 50.0)]},
}
ESP_UNDER = "2 €"       # unter dieser Mulde sitzt der ESP32 (muss ganz links in ihrer Reihe stehen)

# Mulde
BOWL_H = 28.0           # Höhe außen
BOWL_FLOOR = 3.0
BOWL_WALL = 2.0
BOWL_SLOPE = 8.0        # so weit laufen die Wände nach unten zusammen (Münzen rutschen zur Mitte)
BOWL_FRONT_DROP = 8.0   # Vorderkante niedriger, damit man leichter hineingreift
LABEL_DEPTH = 0.8
GAP = 2.0               # Luft zwischen zwei Mulden – sie dürfen sich nie berühren
MIN_BOWL_W = 42.0       # schmaler passen Zelle und Anschläge nicht darunter

# Wägezelle (TAL221-Bauform)
CELL_L, CELL_W, CELL_H = 47.0, 12.0, 6.0
CLAMP_LEN = 14.0          # Länge des massiven Endblocks der Zelle
SCREW_SLOT = (2.5, 11.5)  # Langloch für die M3-Schrauben, Abstand vom Zellenende (von, bis)

# Höhen
BASE_T = 5.0
PAD_H = 2.0             # Sockel unter dem festen Zellenende (Luft unter dem freien Ende)
SPACER_H = 2.0          # Abstandshalter auf dem freien Ende (Luft über dem festen Ende)

# Überlast-Anschläge (M3x10 Zylinderkopf, von unten eingedreht)
STOP_INSET = 8.0
STOP_POST_D = 8.0
STOP_POST_TOP_GAP = 3.0
STOP_COUNTERBORE = 6.0

# Elektronik: die HX711 werden mit Klebepads auf eine freie Stelle unter einer Mulde geklebt.
HX_L, HX_W = 36.0, 22.0
ESP_L, ESP_W, ESP_DEPTH = 24.0, 19.0, 1.5   # ESP32-C3 SuperMini

# Schwalbenschwanz zwischen den beiden Reihen
DOVE_NECK, DOVE_TIP, DOVE_DEPTH, DOVE_FIT = 6.0, 10.0, 5.0, 0.25

M3_CLEAR_R = 1.7
M3_TAP_R = 1.25
M3_HEAD_R = 3.1
M3_HEAD_H = 3.2
M3_CSK_R = 3.0
M3_CSK_H = 1.7
SEG = 48

# ------------------------------------------------------------- abgeleitet ----
Z_CELL = BASE_T + PAD_H
Z_SPACER = Z_CELL + CELL_H
Z_BOWL = Z_SPACER + SPACER_H
# Die Zelle liegt in y-Richtung: festes Ende hinten (+y), freies Ende vorne (-y).
FIXED_Y1 = CELL_L / 2
FREE_Y0 = -CELL_L / 2


def row_length(row: dict) -> float:
    return sum(w + GAP for _, w in row["bowls"])


def stations(row: dict) -> list[tuple[str, float, float]]:
    """(Beschriftung, Mitte x, Breite) jeder Mulde, Reihe um x = 0 zentriert."""
    x, out = -row_length(row) / 2, []
    for text, w in row["bowls"]:
        out.append((text, x + (w + GAP) / 2, w))
        x += w + GAP
    return out


ROW_L = row_length(LAYOUT["vorne"])
assert abs(ROW_L - row_length(LAYOUT["hinten"])) < 0.01, "beide Reihen müssen gleich breit sein"
assert all(w >= MIN_BOWL_W for r in LAYOUT.values() for _, w in r["bowls"]), f"Mulden mindestens {MIN_BOWL_W} mm breit"
assert all(r["depth"] >= CELL_L + 15 for r in LAYOUT.values()), "Reihe zu flach für die Wägezelle"


def box(x0, x1, y0, y1, z0, z1) -> Manifold:
    return Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0])


def cyl(x, y, z0, z1, r, r_top=None) -> Manifold:
    return Manifold.cylinder(z1 - z0, r, r if r_top is None else r_top, SEG).translate([x, y, z0])


def slot_y(x, ya, yb, z0, z1, r, r_top=None) -> Manifold:
    return Manifold.batch_hull([cyl(x, ya, z0, z1, r, r_top), cyl(x, yb, z0, z1, r, r_top)])


def rounded_rect(w, d, r) -> CrossSection:
    r = min(r, w / 2 - 0.01, d / 2 - 0.01)
    return CrossSection.square([w - 2 * r, d - 2 * r], True).offset(r, JoinType.Round, circular_segments=SEG)


def dovetail(fit: float) -> Manifold:
    neck, tip = DOVE_NECK / 2 + fit, DOVE_TIP / 2 + fit
    poly = CrossSection([[(-neck, 0.0), (neck, 0.0), (tip, DOVE_DEPTH + fit), (-tip, DOVE_DEPTH + fit)]])
    return poly.extrude(BASE_T + 2).translate([0, 0, -1])


def fixed_slot():
    return FIXED_Y1 - SCREW_SLOT[1], FIXED_Y1 - SCREW_SLOT[0]


def free_slot():
    return FREE_Y0 + SCREW_SLOT[0], FREE_Y0 + SCREW_SLOT[1]


def stop_positions(w, d):
    sx, sy = w / 2 - STOP_INSET, d / 2 - STOP_INSET
    return [(x, y) for x in (-sx, sx) for y in (-sy, sy)]


def station(w: float, d: float, with_esp: bool) -> tuple[Manifold, list[Manifold]]:
    """Aufbauten und Ausschnitte einer Wägestelle (Mitte = Ursprung)."""
    add = box(-CELL_W / 2, CELL_W / 2, FIXED_Y1 - CLAMP_LEN, FIXED_Y1, BASE_T - 0.01, Z_CELL)
    for x, y in stop_positions(w, d):
        add += cyl(x, y, BASE_T - 0.01, Z_BOWL - STOP_POST_TOP_GAP, STOP_POST_D / 2)
    a, b = fixed_slot()
    cut = [slot_y(0, a, b, -1, Z_CELL + 1, M3_CLEAR_R), slot_y(0, a, b, -1, M3_HEAD_H, M3_HEAD_R)]
    for x, y in stop_positions(w, d):
        cut += [cyl(x, y, -1, Z_BOWL, M3_TAP_R), cyl(x, y, -1, STOP_COUNTERBORE, M3_HEAD_R)]
    if with_esp:
        # links neben der Zelle, USB-C zeigt nach links aus dem Gerät
        assert (w + GAP) / 2 - ESP_L > CELL_W / 2 + 1, "Mulde über dem ESP32 ist zu schmal"
        cut.append(box(-(w + GAP) / 2 - 1, -(w + GAP) / 2 + ESP_L, -ESP_W / 2, ESP_W / 2, BASE_T - ESP_DEPTH, BASE_T + 1))
    return add, cut


def base_row(name: str) -> Manifold:
    """Grundplatte einer Reihe. Vorne: Zapfen hinten. Hinten: Nuten vorne."""
    row = LAYOUT[name]
    pitch_y = row["depth"] + GAP
    m = box(-ROW_L / 2, ROW_L / 2, -pitch_y / 2, pitch_y / 2, 0, BASE_T)
    cuts: list[Manifold] = []
    for i, (text, x, w) in enumerate(stations(row)):
        add, cut = station(w, row["depth"], with_esp=text == ESP_UNDER and i == 0)
        m += add.translate([x, 0, 0])
        cuts += [c.translate([x, 0, 0]) for c in cut]
    # Verbindungen in der Mitte der hinteren Mulden (dort ist am Rand nichts im Weg)
    joint_x = [x for _, x, _ in stations(LAYOUT["hinten"])]
    if name == "vorne":
        for x in joint_x:
            m += dovetail(0).translate([x, pitch_y / 2 - 0.01, 0]) ^ box(x - 20, x + 20, pitch_y / 2 - 1, pitch_y / 2 + 20, 0, BASE_T)
    else:
        cuts += [dovetail(DOVE_FIT).translate([x, -pitch_y / 2 - 0.01, 0]) for x in joint_x]
    for c in cuts:
        m -= c
    return m


def label(text: str, height: float, max_w: float) -> Manifold:
    """Prägeschrift als Körper (liegt in der xz-Ebene, Tiefe in +y)."""
    from matplotlib.font_manager import FontProperties
    from matplotlib.textpath import TextPath

    path = TextPath((0, 0), text, size=height, prop=FontProperties(family="DejaVu Sans", weight="bold"))
    polys = [p.tolist() for p in path.to_polygons(closed_only=True) if len(p) > 2]
    cs = CrossSection(polys, FillRule.EvenOdd)
    (x0, y0), (x1, y1) = cs.bounds()[:2], cs.bounds()[2:]
    cs = cs.translate([-(x0 + x1) / 2, -(y0 + y1) / 2])
    if x1 - x0 > max_w:
        cs = cs.scale([max_w / (x1 - x0)] * 2)
    return cs.extrude(LABEL_DEPTH + 1).rotate([90, 0, 0]).translate([0, LABEL_DEPTH, 0])


def bowl(text: str, w: float, d: float) -> Manifold:
    """Münzmulde, aufrecht gedruckt (Boden auf dem Druckbett)."""
    outer = rounded_rect(w, d, 6).extrude(BOWL_H)
    top = rounded_rect(w - 2 * BOWL_WALL, d - 2 * BOWL_WALL, 4).extrude(0.01).translate([0, 0, BOWL_H])
    slope = min(BOWL_SLOPE, (w - 2 * BOWL_WALL - 16) / 2)
    bottom = rounded_rect(w - 2 * (BOWL_WALL + slope), d - 2 * (BOWL_WALL + slope), 8).extrude(0.01).translate([0, 0, BOWL_FLOOR])
    m = outer - Manifold.batch_hull([top, bottom, top.translate([0, 0, 5])])
    if BOWL_FRONT_DROP > 0:
        m -= Manifold.batch_hull([
            box(-w, w, -d / 2 - 1, -d / 2 + 0.01, BOWL_H - BOWL_FRONT_DROP, BOWL_H + 1),
            box(-w, w, -d / 6, -d / 6 + 0.01, BOWL_H, BOWL_H + 1),
        ])
    a, b = free_slot()
    m -= slot_y(0, a, b, -1, BOWL_FLOOR + 1, M3_CLEAR_R)
    m -= slot_y(0, a, b, BOWL_FLOOR - M3_CSK_H, BOWL_FLOOR + 0.01, M3_CLEAR_R, M3_CSK_R)
    text_h = (BOWL_H - BOWL_FRONT_DROP) * 0.42
    m -= label(text, text_h, w - 14).translate([0, -d / 2 - 0.01, (BOWL_H - BOWL_FRONT_DROP) / 2])
    return m


def spacer() -> Manifold:
    a, b = free_slot()
    m = box(-CELL_W / 2, CELL_W / 2, FREE_Y0, FREE_Y0 + CLAMP_LEN, 0, SPACER_H)
    m -= slot_y(0, a, b, -1, SPACER_H + 1, M3_CLEAR_R)
    return m.translate([0, -(FREE_Y0 + CLAMP_LEN / 2), 0])


def cell_dummy() -> Manifold:
    return box(-CELL_W / 2, CELL_W / 2, -CELL_L / 2, CELL_L / 2, Z_CELL, Z_SPACER)


def board_dummy(w, l, x, y, h=4.0) -> Manifold:
    return box(x, x + w, y - l / 2, y + l / 2, BASE_T, BASE_T + h)


# ------------------------------------------------------------------ Export ---
def mesh_arrays(m: Manifold):
    mesh = m.to_mesh()
    return np.asarray(mesh.vert_properties)[:, :3], np.asarray(mesh.tri_verts)


def write_stl(m: Manifold, path: Path) -> None:
    verts, tris = mesh_arrays(m)
    p = verts[tris]
    n = np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0])
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
    rec = np.zeros(len(tris), dtype=[("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")])
    rec["n"], rec["v"] = n, p
    with path.open("wb") as f:
        f.write(b"Muenzwaage".ljust(80, b" "))
        f.write(struct.pack("<I", len(tris)))
        f.write(rec.tobytes())


def render(parts: list[tuple[Manifold, str]], path: Path, elev: float, azim: float, title: str, width: int = 1300) -> None:
    """Kleiner Z-Buffer-Renderer (orthografisch), damit die Vorschau ohne CAD-Programm klappt."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    e, a = math.radians(elev), math.radians(azim)
    view = np.array([math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)])
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
    w, h = int((hi - lo)[0] * scale) + 40, int((hi - lo)[1] * scale) + 40
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
        d = (y[1] - y[2]) * (x[0] - x[2]) + (x[2] - x[1]) * (y[0] - y[2])
        if x1 < x0 or y1 < y0 or abs(d) < 1e-9:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        l0 = ((y[1] - y[2]) * (gx - x[2]) + (x[2] - x[1]) * (gy - y[2])) / d
        l1 = ((y[2] - y[0]) * (gx - x[2]) + (x[0] - x[2]) * (gy - y[2])) / d
        l2 = 1 - l0 - l1
        inside = (l0 >= -1e-6) & (l1 >= -1e-6) & (l2 >= -1e-6)
        zz = l0 * z[0] + l1 * z[1] + l2 * z[2]
        sub = depth[y0:y1 + 1, x0:x1 + 1]
        hit = inside & (zz > sub)
        sub[hit] = zz[hit]
        img[y0:y1 + 1, x0:x1 + 1][hit] = cols[i] * shade[i]
    finite = np.where(np.isfinite(depth), depth, depth[np.isfinite(depth)].min() - 50)
    edge = (np.abs(np.diff(finite, axis=0, prepend=finite[:1])) > 1.5) | (np.abs(np.diff(finite, axis=1, prepend=finite[:, :1])) > 1.5)
    img[edge] *= 0.35
    fig = plt.figure(figsize=(w / 110, h / 110 + 0.5), dpi=110)
    ax = fig.add_axes([0, 0, 1, h / (h + 55)]); ax.imshow(np.clip(img, 0, 1)); ax.set_axis_off()
    fig.suptitle(title, y=0.99)
    fig.savefig(path)
    plt.close(fig)


def file_name(text: str) -> str:
    return text.replace(" €", "euro").replace(" ct", "cent")


def row_offsets() -> dict[str, float]:
    """y-Mitte jeder Reihe; die Fuge zwischen den Reihen liegt bei y = 0."""
    return {"vorne": -(LAYOUT["vorne"]["depth"] + GAP) / 2, "hinten": (LAYOUT["hinten"]["depth"] + GAP) / 2}


def main() -> None:
    out = Path(__file__).resolve().parent
    stl = out / "stl"
    stl.mkdir(exist_ok=True)
    for old in stl.glob("*.stl"):
        old.unlink()
    parts = {"grundplatte_hinten.stl": base_row("hinten"), "grundplatte_vorne.stl": base_row("vorne"), "abstandshalter.stl": spacer()}
    for row in LAYOUT.values():
        for text, _, w in stations(row):
            parts[f"mulde_{file_name(text)}.stl"] = bowl(text, w, row["depth"])
    for name, m in parts.items():
        assert m.status().name == "NoError", name
        write_stl(m, stl / name)
        bb = np.asarray(m.bounding_box())
        size = bb[3:] - bb[:3]
        print(f"{name:26s} {size[0]:6.1f} x {size[1]:5.1f} x {size[2]:4.1f} mm  {m.volume() / 1000:5.1f} cm³")

    offs = row_offsets()
    scene: list[tuple[Manifold, str]] = []
    for name, row in LAYOUT.items():
        y = offs[name]
        scene.append((base_row(name).translate([0, y, 0]), "#c9a43c"))
        for text, x, w in stations(row):
            color = "#e8c766" if "€" in text or text == "50 ct" or text in ("20 ct", "10 ct") else "#c98a5a"
            scene.append((bowl(text, w, row["depth"]).translate([x, y, Z_BOWL]), color))
    render(scene, out / "vorschau_gesamt.png", 32, -70, "Oft gebrauchte Münzen vorne und größer, 1 ct und 2 ct klein hinten")

    ex = 14.0
    row = LAYOUT["vorne"]
    text, x, w = stations(row)[0]
    y = offs["vorne"]
    st = [
        (base_row("vorne").translate([0, y, 0]) ^ box(-ROW_L / 2, x + (w + GAP) / 2, -200, 200, -1, 50), "#c9a43c"),
        (cell_dummy().translate([x, y, ex * 0.5]), "#a8adb3"),
        (board_dummy(HX_W, HX_L, x + CELL_W / 2 + 1.5, y), "#7b3fa0"),
        (board_dummy(ESP_L, ESP_W, -ROW_L / 2 - 1, y, 3), "#2f6f3a"),
        (spacer().translate([x, y + FREE_Y0 + CLAMP_LEN / 2, Z_SPACER + ex]), "#4a90d9"),
        (bowl(text, w, row["depth"]).translate([x, y, Z_BOWL + ex * 2.5]), "#e8c766"),
    ]
    render(st, out / "vorschau_modul.png", 22, -60, "Eine Wägestelle, auseinandergezogen (Zelle grau, HX711 lila, ESP32 grün)")
    depth = sum(r["depth"] + GAP for r in LAYOUT.values())
    print(f"Gesamtmaß: {ROW_L:.0f} x {depth:.0f} mm, Höhe {Z_BOWL + BOWL_H:.0f} mm")


if __name__ == "__main__":
    main()
