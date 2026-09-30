#!/usr/bin/env python3
"""Generate matplotlib figures for RequirementPilot analysis report.
Figures: F1 novelty matrix, F3 Gantt, F4 risk grid, F5 scores.
Style: low-saturation professional palette derived from DM-1 table accent (#1B6B7A).
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

plt.rcParams["font.sans-serif"] = ["DejaVu Sans"]
plt.rcParams["axes.unicode_minus"] = False

OUT = "/home/z/my-project/download/assets_rp"

# Palette (low saturation, DM-1 derived)
ACCENT = "#1B6B7A"
GRAY = "#8A9BA8"
TEXT = "#24343C"
GRID = "#D9E2E7"
SURFACE = "#EDF3F5"
MORANDI = ["#1B6B7A", "#C49B72", "#7BA68A", "#B87472", "#9687A8", "#7A9BB8"]

def style_ax(ax):
    ax.spines[["top", "right"]].set_visible(False)
    ax.spines[["left", "bottom"]].set_color("#B8C4CC")
    ax.tick_params(colors=TEXT, labelsize=10)

# ---------------------------------------------------------------- F1: Novelty matrix
def fig1_novelty_matrix():
    # (name, short label, feasibility, impact, cluster)
    items = [
        ("N1 Evidence-first requirement objects", "N1", 4.2, 4.5, 0),
        ("N2 Impact-aware question selection", "N2", 3.4, 4.8, 0),
        ("N3 Ambiguity branching", "N3", 3.2, 4.2, 0),
        ("N4 Uncertainty ledger", "N4", 4.0, 3.8, 1),
        ("N5 Requirement debt score", "N5", 4.1, 3.0, 1),
        ("N6 Stakeholder voice preservation", "N6", 3.6, 3.9, 1),
        ("N7 Arabic code-switching benchmark", "N7", 3.0, 4.6, 2),
        ("N8 End-to-end change propagation", "N8", 2.8, 4.0, 2),
        ("N9 Requirements time travel", "N9", 3.8, 2.8, 1),
        ("N10 Explain-why-question rationales", "N10", 4.4, 3.2, 1),
    ]
    fig, ax = plt.subplots(figsize=(10, 7.2), constrained_layout=True)
    # Quadrant shading (low saturation)
    ax.axhspan(3.5, 5.25, xmin=0, xmax=1, facecolor=SURFACE, alpha=0.55, zorder=0)
    ax.axvspan(3.5, 5.0, ymin=0, ymax=1, facecolor="none", zorder=0)
    ax.axhline(3.5, color="#B8C4CC", lw=1.0, ls="--", zorder=1)
    ax.axvline(3.5, color="#B8C4CC", lw=1.0, ls="--", zorder=1)

    # Manual label offsets to guarantee zero overlap (absolute text position, ha)
    # Format: label_id -> (x_text, y_text, ha)
    offs = {
        "N1": (4.30, 4.58, "left"),
        "N2": (3.50, 4.92, "left"),
        "N3": (3.30, 4.32, "left"),
        "N4": (4.12, 3.86, "left"),
        "N5": (3.98, 3.02, "right"),
        "N6": (3.48, 3.76, "right"),
        "N7": (2.90, 4.68, "right"),
        "N8": (2.90, 3.66, "left"),
        "N9": (3.68, 2.84, "right"),
        "N10": (4.50, 3.36, "right"),
    }
    for name, lbl, x, y, cl in items:
        color = ACCENT if cl == 0 else (MORANDI[1] if cl == 1 else MORANDI[2])
        ax.scatter(x, y, s=230, color=color, edgecolor="white", linewidth=1.6, zorder=3)
        ax.annotate(lbl, (x, y), xytext=(0, 0), textcoords="offset points",
                    ha="center", va="center", fontsize=8.5, color="white",
                    fontweight="bold", zorder=4)
        dx, dy, ha = offs[lbl]
        ax.annotate(name, (x, y), xytext=(dx, dy), textcoords="data",
                    ha=ha, va="center", fontsize=9.2, color=TEXT, zorder=4)

    ax.text(4.92, 5.12, "Priority: preserve", ha="right", va="top",
            fontsize=9.5, color="#5E7280", style="italic")
    ax.text(1.62, 5.12, "Research value, high effort", ha="left", va="top",
            fontsize=9.5, color="#5E7280", style="italic")
    ax.text(1.62, 1.62, "Defer or simplify", ha="left", va="bottom",
            fontsize=9.5, color="#5E7280", style="italic")
    ax.text(4.92, 1.62, "Quick wins: keep lightweight", ha="right", va="bottom",
            fontsize=9.5, color="#5E7280", style="italic")

    ax.set_xlim(1.5, 5.0)
    ax.set_ylim(1.5, 5.35)
    ax.set_xlabel("Feasibility for a 4-person, 6-month graduation project", fontsize=11, color=TEXT)
    ax.set_ylabel("Expected research / product impact", fontsize=11, color=TEXT)
    ax.set_title("Novelty contributions N1-N10 positioned by impact vs. feasibility\n"
                 "(analyst scoring, 1 = low, 5 = high)", fontsize=13, color=TEXT, pad=14)
    ax.set_xticks([2, 3, 4, 5]); ax.set_yticks([2, 3, 4, 5])
    ax.grid(True, alpha=0.25, color=GRID, zorder=0)
    style_ax(ax)
    fig.savefig(f"{OUT}/fig1_novelty_matrix.png", dpi=200, facecolor="white")
    plt.close(fig)
    print("fig1 done")

# ---------------------------------------------------------------- F3: Gantt
def fig3_gantt():
    # (phase, start week, duration max, duration min)
    phases = [
        ("Phase 0 - Research setup", 0, 2, 1),
        ("Phase 1 - Backend foundation", 2, 3, 2),
        ("Phase 2 - Evidence + extraction", 5, 3, 2),
        ("Phase 3 - Interview engine", 8, 4, 3),
        ("Phase 4 - Requirement validation", 12, 3, 2),
        ("Phase 5 - Traceability graph", 15, 3, 2),
        ("Phase 6 - Change impact", 18, 3, 3),
        ("Phase 7 - Arabic research track", 18, 4, 3),
        ("Phase 8 - Research evaluation", 21, 4, 3),
    ]
    fig, ax = plt.subplots(figsize=(10.5, 6.2), constrained_layout=True)
    yticks, ylabels = [], []
    for i, (name, start, dmax, dmin) in enumerate(phases):
        y = len(phases) - 1 - i
        color = ACCENT if i < 7 else MORANDI[1]
        # max-duration bar (main) and min-duration overlay
        ax.barh(y, dmax, left=start, height=0.58, color=color, alpha=0.85,
                edgecolor="white", zorder=3)
        if dmin != dmax:
            ax.barh(y, dmin, left=start, height=0.58, color=color,
                    edgecolor=ACCENT, linewidth=1.2, zorder=4)
        yticks.append(y); ylabels.append(name)
    # 24-week deadline line
    ax.axvline(24, color="#B85450", lw=1.6, ls="--", zorder=5)
    ax.text(24.15, len(phases) - 0.55, "24-week limit (6 months)", color="#B85450",
            fontsize=9.5, va="top")
    ax.set_yticks(yticks)
    ax.set_yticklabels(ylabels, fontsize=9.8, color=TEXT)
    ax.set_xlim(0, 27)
    ax.set_xticks(range(0, 29, 2))
    ax.set_xlabel("Project week (sequential interpretation of the reference plan)", fontsize=11, color=TEXT)
    ax.set_title("Reference implementation plan mapped to a 24-week schedule\n"
                 "lighter overlay = minimum duration; phases sum to 18-26 weeks with no buffer",
                 fontsize=13, color=TEXT, pad=14)
    ax.grid(True, axis="x", alpha=0.3, color=GRID, zorder=0)
    style_ax(ax)
    fig.savefig(f"{OUT}/fig3_gantt.png", dpi=200, facecolor="white")
    plt.close(fig)
    print("fig3 done")

# ---------------------------------------------------------------- F4: Risk grid
def fig4_risk_grid():
    risks = [
        # (id, likelihood, severity, documented?)
        ("R1", 4.00, 4.00, True),   # scope explosion
        ("R2", 3.00, 3.00, True),   # LLM cost
        ("R3", 2.85, 4.00, True),   # synthetic benchmark bias
        ("R4", 3.30, 3.85, True),   # novelty challenge
        ("R5", 2.00, 3.00, True),   # agent swarm no benefit
        ("R6", 2.00, 3.35, True),   # Arabic claims too broad
        ("R7", 2.00, 5.00, True),   # hallucination
        ("R8", 4.30, 3.10, False),  # annotation quality / IAA
        ("R9", 4.00, 3.45, False),  # human-evaluator recruitment
        ("R10", 4.30, 4.35, False), # late benchmark / critical path
        ("R11", 2.00, 4.30, False), # ethics & privacy approval
    ]
    fig, ax = plt.subplots(figsize=(9.6, 7.0), constrained_layout=True)
    # zone colors (low saturation)
    for li in range(1, 6):
        for si in range(1, 6):
            score = li * si
            if score >= 16:
                c = "#F3E3E0"       # red zone
            elif score >= 8:
                c = "#F5EDDD"       # amber zone
            else:
                c = "#E7F0E9"       # green zone
            ax.add_patch(mpatches.Rectangle((li - 0.5, si - 0.5), 1, 1,
                         facecolor=c, edgecolor="white", lw=2, zorder=1))
    label_offs = {
        "R1": (0, 0.24), "R2": (0, 0.24), "R3": (0, 0.24), "R4": (0, 0.24),
        "R5": (0, 0.24), "R6": (0, 0.24), "R7": (0, 0.24), "R8": (0, 0.24),
        "R9": (0, 0.24), "R10": (0, 0.24), "R11": (0, 0.24),
    }
    for rid, l, s, doc in risks:
        color = ACCENT if doc else MORANDI[1]
        ax.scatter(l, s, s=340, color=color, edgecolor="white", linewidth=1.8, zorder=3)
        ax.annotate(rid, (l, s), ha="center", va="center", fontsize=8.5,
                    color="white", fontweight="bold", zorder=4)
    legend_elems = [
        mpatches.Patch(color=ACCENT, label="Stated in reference document (R1-R7)"),
        mpatches.Patch(color=MORANDI[1], label="Identified by this analysis (R8-R11)"),
    ]
    ax.legend(handles=legend_elems, loc="upper left", bbox_to_anchor=(0.0, -0.09),
              frameon=False, fontsize=9.5, ncol=2)
    ax.set_xlim(0.5, 5.5); ax.set_ylim(0.5, 5.5)
    ax.set_xticks(range(1, 6)); ax.set_yticks(range(1, 6))
    ax.set_xticklabels(["1\nRare", "2\nUnlikely", "3\nPossible", "4\nLikely", "5\nAlmost certain"], fontsize=9)
    ax.set_yticklabels(["1\nMinimal", "2\nMinor", "3\nModerate", "4\nMajor", "5\nSevere"], fontsize=9)
    ax.set_xlabel("Probability", fontsize=11, color=TEXT)
    ax.set_ylabel("Severity", fontsize=11, color=TEXT)
    ax.set_title("Risk register mapped on a probability-severity grid\n"
                 "(product of both axes approximates exposure)", fontsize=13, color=TEXT, pad=14)
    for sp in ax.spines.values():
        sp.set_visible(False)
    ax.tick_params(colors=TEXT, length=0)
    fig.savefig(f"{OUT}/fig4_risk_grid.png", dpi=200, facecolor="white")
    plt.close(fig)
    print("fig4 done")

# ---------------------------------------------------------------- F5: Scores
def fig5_scores():
    dims = [
        ("Strategic positioning", 4.0),
        ("Novelty & research gap", 4.0),
        ("Technical architecture", 4.0),
        ("Evaluation methodology", 4.5),
        ("Feasibility & schedule", 3.0),
        ("Reference-document quality", 5.0),
    ]
    labels = [d[0] for d in dims][::-1]
    vals = [d[1] for d in dims][::-1]
    fig, ax = plt.subplots(figsize=(9.6, 5.2), constrained_layout=True)
    colors = [ACCENT if v >= 4 else (MORANDI[3] if v < 3.5 else MORANDI[1]) for v in vals]
    bars = ax.barh(labels, vals, height=0.56, color=colors, edgecolor="white", zorder=3)
    for b, v in zip(bars, vals):
        ax.text(v + 0.07, b.get_y() + b.get_height() / 2, f"{v:.1f}",
                va="center", fontsize=10.5, color=TEXT, fontweight="bold")
    ax.axvline(4.0, color="#B8C4CC", lw=1.2, ls="--", zorder=2)
    ax.text(4.06, 5.48, "target threshold", fontsize=8.8, color="#5E7280",
            style="italic", va="top", ha="left", zorder=5)
    ax.set_xlim(0, 5.6)
    ax.set_xticks(range(0, 6))
    ax.set_xlabel("Assessment score (1 = weak, 5 = excellent)", fontsize=11, color=TEXT)
    ax.set_title("Consolidated assessment scores by analysis dimension", fontsize=13, color=TEXT, pad=14)
    ax.grid(True, axis="x", alpha=0.3, color=GRID, zorder=0)
    style_ax(ax)
    fig.savefig(f"{OUT}/fig5_scores.png", dpi=200, facecolor="white")
    plt.close(fig)
    print("fig5 done")

if __name__ == "__main__":
    fig1_novelty_matrix()
    fig3_gantt()
    fig4_risk_grid()
    fig5_scores()
    print("ALL FIGURES DONE")
