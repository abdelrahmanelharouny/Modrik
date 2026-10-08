# Agent Audit Report — figures (fig8 latency profile, fig9 audit coverage)
# DM-1-consistent palette, English labels, constrained_layout per platform rules.
import json
import os
from collections import Counter

import matplotlib
import matplotlib.font_manager as fm

fm.fontManager.addfont('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = "/home/z/my-project/download/assets_rp"
os.makedirs(OUT, exist_ok=True)

TEAL = "#1B6B7A"
TEAL_LIGHT = "#4E9AAC"
AMBER = "#C98A2E"
ROSE = "#B4552D"
INK = "#0A1628"
GREY = "#5B6B7D"

# ── fig8: measured latency per pipeline agent across full-pipeline runs ──
runs = {
    "Elicitation": [6.4, 12.6, 5.3],
    "Problem Selection": [4.4, 4.6, 2.6],
    "Extraction (+Critic)": [16.5, 18.1, 9.1],
    "Ambiguity": [10.9, 10.6, 5.8],
    "Stories": [22.4, 25.9, 14.2],
    "Conflicts": [7.3, 7.6, 3.2],
}
labels = list(runs.keys())
mins = [min(v) for v in runs.values()]
maxs = [max(v) for v in runs.values()]
mids = [sorted(v)[1] for v in runs.values()]
y = range(len(labels))

fig, ax = plt.subplots(figsize=(9.2, 4.6), constrained_layout=True)
ax.barh(y, maxs, height=0.56, color=TEAL_LIGHT, alpha=0.35, label="max run")
ax.barh(y, mids, height=0.56, color=TEAL, label="median run")
for i, (mn, mx, md) in enumerate(zip(mins, maxs, mids)):
    ax.plot([mn, mn], [i - 0.28, i + 0.28], color=INK, lw=1.4)
    ax.annotate(f"{md:.1f}s median · {mn:.1f}–{mx:.1f}s range", (mx + 0.4, i),
                va="center", fontsize=8.5, color=GREY)
ax.set_yticks(list(y), labels, fontsize=9.5)
ax.invert_yaxis()
ax.set_xlabel("Server-recorded agent latency per stage run (s)", fontsize=9.5)
ax.set_xlim(0, 31)
ax.set_title("Pipeline agent latency across three full live runs (GLM via Z.ai)",
             fontsize=11, color=INK, pad=10)
ax.spines[["top", "right"]].set_visible(False)
ax.legend(loc="lower right", fontsize=8.5, frameon=False)
ax.grid(axis="x", alpha=0.25, lw=0.6)
fig.savefig(os.path.join(OUT, "fig8_agent_latency.png"), dpi=200)
plt.close(fig)

# ── fig9: audit coverage & outcomes per agent (post-fix master) ──
m = json.load(open(os.path.join(HERE, "agent_tests", "results", "results_master.json")))
GROUPS = {
    "Questioner (Elicitation)": ("elicitation", "ELICITATION"),
    "Scope Agent": ("scope",),
    "Extraction + Critic": ("extraction",),
    "Ambiguity Agent": ("ambiguity",),
    "Story Agent": ("stories",),
    "Consistency Agent": ("consistency",),
    "Health Reporter": ("health",),
    "Drift Radar": ("drift",),
    "Compliance Checker": ("compliance",),
    "Wind Tunnel": ("wind_tunnel",),
    "Voice Intake (ASR)": ("asr",),
    "State Machine & Gates": ("state_machine",),
    "Memory Harvester": ("memory",),
}
data = {g: Counter() for g in GROUPS}
for r in m:
    if r["phase"] in ("sanity",) or r["agent"] in ("setup", "platform", "instruments", "cleanup"):
        continue
    for g, agents in GROUPS.items():
        if r["agent"] in agents:
            data[g][r["status"]] += 1
            break

order = sorted(GROUPS, key=lambda g: data[g]["pass"] + data[g]["warn"] + data[g]["fail"] + data[g].get("info", 0))
passc = [data[g]["pass"] for g in order]
infoc = [data[g].get("info", 0) for g in order]
warnc = [data[g]["warn"] for g in order]
failc = [data[g]["fail"] for g in order]

fig, ax = plt.subplots(figsize=(9.2, 5.4), constrained_layout=True)
left = [0] * len(order)
for vals, color, label in (
    (passc, TEAL, "pass"),
    (infoc, "#8FA6B2", "info"),
    (warnc, AMBER, "warn"),
    (failc, ROSE, "fail"),
):
    ax.barh(range(len(order)), vals, left=left, height=0.62, color=color, label=label)
    for i, v in enumerate(vals):
        if v:
            ax.text(left[i] + v / 2, i, str(v), va="center", ha="center", fontsize=8.5,
                    color="white" if color in (TEAL, ROSE) else INK)
    left = [l + v for l, v in zip(left, vals)]
ax.set_yticks(range(len(order)), order, fontsize=9.5)
ax.set_xlabel("Recorded audit checks (baseline + post-fix verification runs)", fontsize=9.5)
ax.set_title("Audit coverage and outcomes per agent — 141 automated checks",
             fontsize=11, color=INK, pad=10)
ax.spines[["top", "right"]].set_visible(False)
ax.legend(loc="lower right", fontsize=8.5, frameon=False, ncols=4)
ax.grid(axis="x", alpha=0.25, lw=0.6)
fig.savefig(os.path.join(OUT, "fig9_audit_coverage.png"), dpi=200)
plt.close(fig)

print("fig8 + fig9 written to", OUT)
for g in GROUPS:
    print(f"  {g}: {dict(data[g])}")
