#!/usr/bin/env python3
"""Generate figures for the RequirementPilot Expansion and Innovation Roadmap.
F6: innovation portfolio map (impact x effort, colored by adoption tier)
F7: tiered adoption roadmap (three lanes across 24 weeks + post-thesis)
Style: DM-1 derived low-saturation palette, consistent with the analysis report figures.
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch

plt.rcParams["font.sans-serif"] = ["DejaVu Sans"]
plt.rcParams["axes.unicode_minus"] = False

OUT = "/home/z/my-project/download/assets_rp"

ACCENT = "#1B6B7A"     # V1 tier (teal)
TAN = "#C49B72"        # V2 tier
GRAY = "#8A9BA8"       # Future tier
TEXT = "#24343C"
GRID = "#D9E2E7"
SURFACE = "#EDF3F5"

def style_ax(ax):
    ax.spines[["top", "right"]].set_visible(False)
    ax.spines[["left", "bottom"]].set_color("#B8C4CC")
    ax.tick_params(colors=TEXT, labelsize=10)

# ---------------------------------------------------------------- F6: Portfolio map
def fig6_portfolio():
    # id, x (effort position with jitter), y (impact), tier color, label (dx, dy, ha)
    pts = [
        ("I1", 0.90, 4.60, ACCENT, (0.94, 4.635, "left")),
        ("I2", 1.02, 4.20, ACCENT, (1.06, 4.235, "left")),
        ("I3", 1.12, 4.00, ACCENT, (1.16, 4.020, "left")),
        ("I7", 0.92, 3.96, ACCENT, (0.96, 3.875, "left")),
        ("I12", 1.02, 3.78, ACCENT, (1.06, 3.800, "left")),
        ("I13", 1.10, 3.58, ACCENT, (1.14, 3.590, "left")),
        ("I14", 0.92, 3.40, ACCENT, (0.96, 3.420, "left")),
        ("I6", 2.00, 4.42, TAN, (2.04, 4.440, "left")),
        ("I10", 1.96, 4.20, TAN, (2.00, 4.215, "left")),
        ("I9", 2.06, 4.00, TAN, (2.10, 4.015, "left")),
        ("I4", 1.94, 3.62, GRAY, (1.90, 3.640, "right")),
        ("I11", 2.08, 3.56, GRAY, (2.12, 3.575, "left")),
        ("I5", 1.92, 3.40, TAN, (1.88, 3.420, "right")),
        ("I8", 3.00, 4.22, GRAY, (3.05, 4.235, "left")),
    ]
    fig, ax = plt.subplots(figsize=(10, 6.6), constrained_layout=True)
    # Flagship band (impact >= 4.0)
    ax.axhspan(4.0, 4.95, facecolor=SURFACE, alpha=0.6, zorder=0)
    ax.axhline(4.0, color="#B8C4CC", lw=1.0, ls="--", zorder=1)
    ax.text(3.36, 4.06, "flagship-adjacent band", fontsize=8.5, color="#7A8A94",
            ha="right", va="bottom", style="italic")

    for pid, x, y, col, (lx, ly, ha) in pts:
        ax.scatter(x, y, s=150, color=col, edgecolor="white", linewidth=1.4, zorder=3)
        ax.text(lx, ly, pid, fontsize=9.5, color=TEXT, ha=ha, va="center",
                fontweight="bold", zorder=4)

    ax.set_xlim(0.55, 3.45)
    ax.set_ylim(3.15, 4.95)
    ax.set_xticks([1, 2, 3])
    ax.set_xticklabels(["S  (\u22641 person-week)", "M  (1\u20133 person-weeks)", "L  (>3 person-weeks)"])
    ax.set_xlabel("Implementation effort class", fontsize=11, color=TEXT)
    ax.set_ylabel("Expected thesis impact (analyst score)", fontsize=11, color=TEXT)
    style_ax(ax)
    ax.grid(axis="y", alpha=0.3, color=GRID)
    handles = [
        mpatches.Patch(color=ACCENT, label="Tier V1  (weeks 1\u201312)"),
        mpatches.Patch(color=TAN, label="Tier V2  (months 4\u20136)"),
        mpatches.Patch(color=GRAY, label="Tier Future  (post-thesis)"),
    ]
    ax.legend(handles=handles, loc="lower right", frameon=False, fontsize=9.5)
    fig.savefig(f"{OUT}/fig6_portfolio.png", dpi=200, facecolor="white", edgecolor="none")
    plt.close(fig)

# ---------------------------------------------------------------- F7: Tiered roadmap
def fig7_roadmap():
    fig, ax = plt.subplots(figsize=(11.2, 6.6), constrained_layout=True)

    # (name, short_id, start, end, color, dashed)  — top row first
    rows = [
        ("I12  Decision journal",        "I12",  1, 3,  ACCENT, False),
        ("I13  Cost observatory",        "I13",  2, 4,  ACCENT, False),
        ("I3  Critic-verifier loop",     "I3",   4, 7,  ACCENT, False),
        ("I1  Ask-vs-proceed gate",      "I1",   4, 9,  ACCENT, False),
        ("I7  Stakeholder wind tunnel",  "I7",   6, 10, ACCENT, False),
        ("I2  Calibration study",        "I2",   9, 12, ACCENT, False),
        ("I6  Arabic-first layer",       "I6",   9, 18, TAN,    False),
        ("I9  Verifiable artifacts",     "I9",  14, 19, TAN,    False),
        ("I10  MCP requirement server",  "I10", 15, 20, TAN,    False),
        ("I14  Health report",           "I14", 18, 22, TAN,    False),
        ("Field pilot (2\u20133 teams)", "Pilot", 17, 24, TAN,  False),
        ("I5  Multimodal intake",        "I5",  20, 24, TAN,    True),
        ("I4 \u00b7 I8 \u00b7 I11  (post-thesis)", "", 24, 30, GRAY, False),
    ]
    n = len(rows)
    lane_h = 0.62
    y_of = lambda i: (n - 1 - i) + 0.5

    # Lane background spans: V1 rows i0-i5 (y 6.95-13.0), V2 rows i6-i11 (y 0.95-6.95)
    ax.axhspan(6.95, 13.05, color="#EBF2F4", alpha=0.55, zorder=0)
    ax.axhspan(0.95, 6.95, color="#F7F1E8", alpha=0.45, zorder=0)

    for wk in (4, 8, 16, 20):
        ax.axvline(wk, color=GRID, lw=0.8, zorder=1)
    ax.axvline(12, color="#9FB4BE", lw=1.4, ls="--", zorder=2)
    ax.axvline(24, color="#9FB4BE", lw=1.2, ls=":", zorder=2)

    for i, (label, short, s, e, col, dashed) in enumerate(rows):
        y = y_of(i)
        if dashed:
            ax.barh(y, e - s, left=s, height=lane_h, color=col, alpha=0.40,
                    edgecolor=col, linewidth=1.2, linestyle="--", zorder=3)
        else:
            ax.barh(y, e - s, left=s, height=lane_h, color=col,
                    edgecolor="white", linewidth=1.0, zorder=3)
        if short:
            ax.text(s + 0.25, y, short, fontsize=8.5, color="white", ha="left",
                    va="center", fontweight="bold", zorder=5)

    # Lane labels inside empty plot regions
    ax.text(13.0, 11.2, "Tier V1 \u00b7 weeks 1\u201312\nharden the two cores",
            fontsize=10, color="#14525E", ha="left", va="center", fontweight="bold")
    ax.text(24.9, 5.6, "Tier V2 \u00b7 months 4\u20136\ndemonstrate breadth",
            fontsize=10, color="#8A6537", ha="left", va="center", fontweight="bold")
    ax.text(24.35, 0.5, "post-thesis", fontsize=8.5, color="white", ha="left",
            va="center", fontweight="bold", zorder=5)

    # Month labels along the top
    for m, wk in enumerate([2, 6, 10, 14, 18, 22], start=1):
        ax.text(wk, n + 0.72, f"Month {m}", fontsize=8.5, color="#7A8A94",
                ha="center", va="center")

    ax.set_xlim(0, 30.6)
    ax.set_ylim(0.1, n + 1.1)
    ax.set_yticks([y_of(i) for i in range(n)])
    ax.set_yticklabels([r[0] for r in rows], fontsize=9.5)
    ax.set_xticks(range(0, 29, 4))
    ax.set_xticklabels(["0", "4", "8", "12", "16", "20", "24", "28"])
    ax.set_xlabel("Project week (24-week window, then post-thesis horizon)", fontsize=11, color=TEXT)
    style_ax(ax)
    ax.grid(axis="x", alpha=0.25, color=GRID)
    ax.tick_params(axis="y", length=0)

    ax.text(12.25, 0.45, "V1 \u2192 V2 gate (week 12)", fontsize=8.5, color="#5E7682",
            ha="left", va="center", style="italic")
    fig.savefig(f"{OUT}/fig7_roadmap.png", dpi=200, facecolor="white", edgecolor="none")
    plt.close(fig)

if __name__ == "__main__":
    fig6_portfolio()
    fig7_roadmap()
    print("figures written to", OUT)
