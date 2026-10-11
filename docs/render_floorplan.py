"""Render docs/floorplan.json to docs/floorplan.png so Andrew can check the layout.

Usage: python3 docs/render_floorplan.py   (needs matplotlib)
"""
import json
import textwrap
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, FancyArrow

HERE = Path(__file__).resolve().parent
plan = json.loads((HERE / "floorplan.json").read_text())

INK = "#2b2b2b"
WALL = "#3a3a3a"
DOOR = "#e8590c"
FILL = {
    "basement": "#dfe7f2",
    "main": "#f3ead9",
    "upper": "#e6f0e1",
}
SPECIAL = {
    "formal_dining": "#ffd76a",   # Catan room
    "garage": "#d9d9d9",
    "bowling_alley": "#cfdcf0",
    "bowling_lounge": "#cfdcf0",
    "utility": "#c9cfd6",
}
OUTDOOR_FILL = "#ffffff"

order = ["upper", "main", "basement"]

# Short labels and nudged label positions so text never sits under stairs or fixtures.
LABELS = {
    "landing": ("Landing", 28.2, None),
    "foyer": ("Front hall\n+ stairs", 28.2, None),
    "great_room": ("Living room\n(great room)\nsunken, 2-story", 25.2, None),
    "office": ("Office /\nlibrary\n(under\nstairs)", None, None),
    "den": ("Basement\nTV den", 19.0, None),
    "bowling_alley": ("Bowling alley (2 lanes)", 36.0, 5.4),
    "common_area": ("Common\narea (pink\nsitting\nroom)", None, None),
    "back_hall": ("", None, None),
    "formal_dining": ("Formal\ndining -\nCATAN\nROOM", None, None),
    "bedroom_main": ("Downstairs\nbedroom\n(blue)", None, None),
}
# Per-level vertical window (north edge, south edge) so panels don't waste space.
YLIM = {"upper": (13.0, -3.0), "main": (16.2, -4.2), "basement": (11.5, -3.6)}
levels = {lv["id"]: lv for lv in plan["levels"]}

fig, axes = plt.subplots(3, 1, figsize=(16, 17.5),
                         gridspec_kw={"hspace": 0.08, "height_ratios": [16, 20.4, 15.1]})
fig.patch.set_facecolor("white")
fig.suptitle(
    "THE DEN - house floor plan (DRAFT v1 for Andrew to correct)",
    fontsize=20, fontweight="bold", color=INK, y=0.995,
)
fig.text(
    0.5, 0.968,
    "Real-world meters (game builds it 1.25x bigger). North / front of house is at the TOP. "
    "Orange bars = doors. Gold room = Catan room.",
    ha="center", fontsize=11.5, color="#555",
)


def all_rects(level):
    out = {r["id"]: r for r in level.get("rooms", [])}
    for r in level.get("outdoor_attached", []):
        out[r["id"]] = r
    return out


def door_segment(door, rects):
    x, z, w = door["x"], door["z"], door["width"]
    for key in (door["a"], door["b"]):
        r = rects.get(key)
        if not r:
            continue
        if abs(x - r["x"]) < 1e-6 or abs(x - (r["x"] + r["w"])) < 1e-6:
            return (x, z - w / 2), (x, z + w / 2)
        if abs(z - r["z"]) < 1e-6 or abs(z - (r["z"] + r["d"])) < 1e-6:
            return (x - w / 2, z), (x + w / 2, z)
    return (x - w / 2, z), (x + w / 2, z)


for ax, lid in zip(axes, order):
    lv = levels[lid]
    rects = all_rects(lv)
    ax.set_title(lv["name"], fontsize=16, fontweight="bold", loc="left", color=INK, pad=8)
    ax.set_aspect("equal")
    ax.set_xlim(-2.5, 51.5)
    ax.set_ylim(*YLIM[lid])  # inverted so north (z=0) is at the top
    ax.axis("off")

    # outdoor attached pieces first (under the rooms)
    for r in lv.get("outdoor_attached", []):
        ax.add_patch(Rectangle((r["x"], r["z"]), r["w"], r["d"], facecolor=OUTDOOR_FILL,
                               edgecolor="#8a8a8a", linewidth=1.2, linestyle="--", hatch="///", zorder=1))
        ax.text(r["x"] + r["w"] / 2, r["z"] + r["d"] / 2, r["name"], ha="center", va="center",
                fontsize=10, color="#555", style="italic", zorder=5,
                bbox=dict(facecolor="white", edgecolor="none", pad=1.5, alpha=0.85))

    for r in lv.get("open_to_below", []):
        ax.add_patch(Rectangle((r["x"], r["z"]), r["w"], r["d"], facecolor="none",
                               edgecolor="#9a9a9a", linewidth=1.2, linestyle=(0, (4, 3)), zorder=2))
        ax.text(r["x"] + r["w"] / 2, r["z"] + r["d"] / 2,
                "OPEN TO GREAT ROOM\nBELOW (2-story)", ha="center", va="center",
                fontsize=10, color="#888", zorder=3)

    for r in lv.get("rooms", []):
        fc = SPECIAL.get(r["id"], FILL[lid])
        ax.add_patch(Rectangle((r["x"], r["z"]), r["w"], r["d"], facecolor=fc,
                               edgecolor=WALL, linewidth=2.6, zorder=3))
        lx, lz = r["x"] + r["w"] / 2, r["z"] + r["d"] / 2
        if r["id"] in LABELS:
            wrapped, ox, oz = LABELS[r["id"]]
            lx = ox if ox is not None else lx
            lz = oz if oz is not None else lz
        else:
            width_chars = max(8, int(r["w"] * 2.3))
            wrapped = "\n".join(textwrap.wrap(r["name"], width_chars))
        fs = 10.5 if r["w"] >= 4.5 else 9.5
        ax.text(lx, lz, wrapped, ha="center", va="center",
                fontsize=fs, fontweight="bold", color=INK, zorder=10, linespacing=1.15)

    # bowling lanes detail
    if lid == "basement":
        a = rects["bowling_alley"]
        lane_len_x0 = a["x"] + 4.6
        for lz in (1.2, 3.6):
            ax.add_patch(Rectangle((lane_len_x0, a["z"] + lz), 18.29, 1.05, facecolor="#e9c98f",
                                   edgecolor="#a07a3a", linewidth=1, zorder=4))
            for i in range(4):
                ax.plot([lane_len_x0 + 18.29 + 0.25 + i * 0.25] * 2,
                        [a["z"] + lz + 0.15, a["z"] + lz + 0.9], color="#555", lw=1, zorder=5)
        ax.add_patch(Rectangle((lane_len_x0, a["z"] + 2.45), 18.29, 0.9, facecolor="#bbbbbb",
                               edgecolor="#777", linewidth=0.8, zorder=4))
        ax.text(lane_len_x0 + 9, a["z"] + 2.9, "ball return", ha="center", va="center", fontsize=8.5,
                color="#333", zorder=6)
        ax.annotate("bowler starts here", xy=(a["x"] + 2.3, a["z"] + 3.0), xytext=(a["x"] + 2.3, -2.6),
                    ha="center", fontsize=9.5, color=DOOR,
                    arrowprops=dict(arrowstyle="->", color=DOOR), zorder=7)
        ax.annotate("pins", xy=(a["x"] + 24.5, a["z"] + 1.7), xytext=(a["x"] + 25.5, -2.6),
                    ha="center", fontsize=9.5, color=DOOR,
                    arrowprops=dict(arrowstyle="->", color=DOOR), zorder=7)
        ax.plot([34, 34], [-0.6, 6.6], color="#b00", lw=1.2, linestyle=":", zorder=6)
        ax.text(34.3, -1.0, "house ends here - lanes run on underground", fontsize=9, color="#b00", zorder=7)

    # stairs
    for s in lv.get("stairs", []):
        ax.add_patch(Rectangle((s["x"], s["z"]), s["w"], s["d"], facecolor="#ffffff",
                               edgecolor="#555", linewidth=1.2, hatch="---", zorder=7))
        ax.text(s["x"] + s["w"] / 2, s["z"] + s["d"] / 2, "stairs", ha="center", va="center",
                fontsize=8.5, color="#333", zorder=8,
                bbox=dict(facecolor="white", edgecolor="none", pad=0.8))
    if lid == "main":
        ax.add_patch(Rectangle((12.0, 7.4), 4.5, 1.2, facecolor="#ffffff", edgecolor="#555",
                               linewidth=1.2, hatch="---", zorder=7))
        ax.text(14.25, 8.0, "back hall: stairs down", ha="center", va="center", fontsize=8.5, zorder=8,
                bbox=dict(facecolor="white", edgecolor="none", pad=0.8))
    if lid == "upper":
        ax.add_patch(Rectangle((25.6, 0.3), 1.2, 3.0, facecolor="#ffffff", edgecolor="#555",
                               linewidth=1.2, hatch="---", zorder=7))
        ax.text(26.2, 1.8, "stairs\ndown", ha="center", va="center", fontsize=8.5, zorder=8,
                bbox=dict(facecolor="white", edgecolor="none", pad=0.8))

    # doors
    for d in lv.get("doors", []):
        (x1, z1), (x2, z2) = door_segment(d, rects)
        ax.plot([x1, x2], [z1, z2], color=DOOR, lw=6, solid_capstyle="butt", zorder=9)

    # callouts
    if lid == "main":
        ax.add_patch(FancyArrow(-2.3, 4.2, 1.9, 0, width=0.35, head_width=1.0, head_length=0.8,
                                color=DOOR, zorder=10))
        ax.text(-2.4, -1.2, "you walk in\nthrough the\ngarage", fontsize=9.5, color=DOOR, ha="left",
                va="center", zorder=10)
        ax.text(27.5, -3.5, "front door", fontsize=9.5, color=DOOR, ha="center", zorder=10)
        ax.text(28.8, 9.6, "fireplace", fontsize=8.5, ha="right", va="center", color="#8b2e16",
                zorder=10)
        ax.add_patch(Rectangle((29.0, 5.6), 0.5, 2.8, facecolor="#b5523b", edgecolor="#6b2a1a", zorder=8))
        # legend / notes column
        notes = [
            "WALKTHROUGH (from Andrew):",
            "1. In through the garage",
            "2. Half bath on your right",
            "3. Kitchen straight ahead",
            "4. Dining hall on the left,",
            "   common area w/ patio door",
            "5. Great room w/ balcony + stairs,",
            "   formal dining (Catan),",
            "   1 bedroom, office under stairs",
            "",
            "CHECK THESE, ANDREW:",
            "- Is the pink room the common area?",
            "- Where do the basement stairs start?",
            "- Which side is the downstairs bedroom?",
        ]
        ax.text(36.0, -2.6, "\n".join(notes), fontsize=10.5, va="top", ha="left", color=INK,
                family="DejaVu Sans", linespacing=1.45,
                bbox=dict(facecolor="#fff8e6", edgecolor="#e0c070", pad=8))

    # north arrow + scale bar on the main floor panel
    if lid == "upper":
        ax.add_patch(FancyArrow(48.5, 3.0, 0, -4.0, width=0.3, head_width=1.2, head_length=1.0,
                                color=INK))
        ax.text(48.5, 4.0, "N", ha="center", va="top", fontsize=16, fontweight="bold")
        ax.plot([36, 41], [9.5, 9.5], color=INK, lw=3)
        ax.text(38.5, 10.8, "5 m (16 ft)", ha="center", fontsize=10)
        ax.text(36.0, 1.0, "3 bedrooms + bathroom upstairs.\nBalcony looks down into the\ngreat room.",
                fontsize=10.5, va="top", ha="left", color=INK, linespacing=1.4)

plt.savefig(HERE / "floorplan.png", dpi=110, bbox_inches="tight", facecolor="white")
print("wrote", HERE / "floorplan.png")
