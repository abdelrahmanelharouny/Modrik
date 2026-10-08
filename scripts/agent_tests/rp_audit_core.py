# RequirementPilot — Deep Agent Audit harness (core helpers + dispatcher)
# Usage: python3 rp_audit_core.py <phase>
#   phases: sanity | s1 | s2 | s3 | s4 | s5 | s6 | s7
# State persists in scripts/agent_tests/state.json
# Results append to scripts/agent_tests/results/*.json
import json
import os
import re
import sys
import time

import requests

BASE = "http://localhost:3000"
HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.join(HERE, "results")
STATE_PATH = os.path.join(HERE, "state.json")
os.makedirs(RESULTS_DIR, exist_ok=True)

AR_RE = re.compile(r"[\u0600-\u06FF]")

RESULTS = []  # {ts, phase, agent, check, status, detail, evidence}


def load_state():
    if os.path.exists(STATE_PATH):
        with open(STATE_PATH) as f:
            return json.load(f)
    return {}


def save_state(st):
    with open(STATE_PATH, "w") as f:
        json.dump(st, f, indent=2, ensure_ascii=False)


def record(phase, agent, check, status, detail="", evidence=None):
    RESULTS.append(
        {
            "ts": time.strftime("%H:%M:%S"),
            "phase": phase,
            "agent": agent,
            "check": check,
            "status": status,  # pass | fail | warn | info
            "detail": detail,
            "evidence": evidence,
        }
    )
    icon = {"pass": "PASS", "fail": "FAIL", "warn": "WARN", "info": "INFO"}[status]
    print(f"[{icon}] {phase}/{agent} :: {check} — {detail}")


def dump_results(phase):
    path = os.path.join(RESULTS_DIR, f"results_{phase}.json")
    with open(path, "w") as f:
        json.dump(RESULTS, f, indent=2, ensure_ascii=False)
    print(f"== {len(RESULTS)} checks for phase {phase} -> {path}")


def api(method, path, body=None, timeout=300):
    """Returns (status_code, parsed_json_or_{})."""
    url = f"{BASE}{path}"
    try:
        if method == "GET":
            r = requests.get(url, timeout=timeout)
        elif method == "POST":
            r = requests.post(url, json=body or {}, timeout=timeout)
        elif method == "PATCH":
            r = requests.patch(url, json=body or {}, timeout=timeout)
        elif method == "DELETE":
            r = requests.delete(url, timeout=timeout)
        else:
            raise ValueError(method)
        try:
            return r.status_code, r.json()
        except Exception:
            return r.status_code, {"_raw": r.text[:500]}
    except requests.exceptions.Timeout:
        return 0, {"error": "client timeout"}
    except Exception as e:  # noqa: BLE001
        return -1, {"error": str(e)[:300]}


def get_project(pid):
    code, data = api("GET", f"/api/projects/{pid}")
    assert code == 200, f"get_project failed {code}: {data}"
    return data["project"]


def run_stage(pid, phase, agent, timeout=300):
    """POST pipeline run; returns (ok, project_after, wall_seconds)."""
    t0 = time.time()
    code, data = api("POST", f"/api/projects/{pid}/pipeline", {"action": "run"}, timeout=timeout)
    wall = time.time() - t0
    if code != 200:
        record(phase, agent, "run_http", "fail", f"HTTP {code}: {json.dumps(data, ensure_ascii=False)[:300]}")
        return False, None, wall
    proj = get_project(pid)
    runs = [r for r in proj.get("runs", []) if r["stage"] == agent and r["status"] != "running"]
    run = runs[0] if runs else {}
    record(
        phase,
        agent,
        "run_http",
        "pass",
        f"stage run ok in {wall:.1f}s (server latency {run.get('latencyMs', '?')} ms, ~{run.get('estTokens', '?')} tok, cost ${run.get('estCostUsd', '?')}, prompt {run.get('promptVersion', '?')})",
    )
    return True, proj, wall


def latest_run_for(pid, stage):
    proj = get_project(pid)
    runs = [r for r in proj.get("runs", []) if r["stage"] == stage]
    return runs[0] if runs else {}


# ────────────────────────────────────────────────────────────────
# Phase: sanity
# ────────────────────────────────────────────────────────────────
def phase_sanity():
    code, data = api("GET", "/api")
    record("sanity", "platform", "server_up", "pass" if code == 200 else "fail", f"GET /api -> {code}")
    code, data = api("GET", "/api/projects")
    n = len(data.get("projects", [])) if code == 200 else -1
    record("sanity", "platform", "projects_list", "pass" if code == 200 else "fail", f"GET /api/projects -> {code}, {n} projects")
    code, data = api("GET", "/api/telemetry")
    record("sanity", "platform", "telemetry", "pass" if code == 200 else "fail", f"GET /api/telemetry -> {code} keys={list(data)[:6]}")
    demo = data.get("demo", {}) if isinstance(data, dict) else {}


# ────────────────────────────────────────────────────────────────
# Shared scenario content
# ────────────────────────────────────────────────────────────────
SCENARIO_A = {
    "name": "AGENT-AUDIT-A — Nile Fresh Market",
    "brief": (
        "Nile Fresh Market — an ordering app for small Cairo grocery shops, replacing "
        "WhatsApp order-taking. Shopkeepers capture neighborhood orders with next-morning "
        "delivery. Focus: order tracking, Arabic-first UX, cash-on-delivery, low bandwidth, "
        "customer data privacy. Team of 2; pilot in 3 districts."
    ),
    "evidences": [
        {
            "title": "مقابلة مع صاحبة بقالة (المعادي)",
            "sourceType": "interview",
            "language": "ar-EG",
            "content": (
                "أنا بعيش في المعادي وعندي بقالة صغيرة. الزباين بيكلموني على الواتساب "
                "ويطلبوا حاجات من السوبر ماركت. المشكلة إن الطلبات بتتضيع ساعات ومش بعرف "
                "أتابع مين استلم ومين لسه. عايزة نظام يسجل الطلب ويبعتلي رسالة بالطلبات "
                "الجديدة كل يوم الصبح. الدفع كاش عند التسليم ومفيش فكة كتير معايا. عايزة "
                "كمان أعرف أكتر حاجة مطلوبة في الحتة بتاعتي عشان أشتري بكى."
            ),
        },
        {
            "title": "Operations constraints (draft v2)",
            "sourceType": "document",
            "language": "en",
            "content": (
                "Orders must be captured before 21:00 for next-morning delivery. Each order "
                "must include a delivery time window chosen by the customer. The system shall "
                "send an SMS confirmation to the customer when the shopkeeper accepts the "
                "order. Delivery radius is limited to 5 km. The app must function on 3G and "
                "load under 3 MB per screen. Shopkeepers must be able to mark an item out of "
                "stock, and the system shall hide out-of-stock items immediately. Payments "
                "are cash on delivery only; card processing is out of scope this year. "
                "Customer phone numbers must not be shared with any third party."
            ),
        },
        {
            "title": "Stakeholder sync — pilot scoping notes",
            "sourceType": "meeting",
            "language": "codeswitch",
            "content": (
                "اتفقنا النهارده إن الـ pilot هيبقى في 3 areas بس. الـ shopkeeper لازم يكون "
                "عنده dashboard بسيط بالعربي. We agreed إن الـ notifications لازم تكون "
                "real-time مش SMS بس — WhatsApp optional. Customer support في الـ MVP هيكون "
                "phone only. كمان لو الـ order اتلغت مرتين الـ customer يتحظر مؤقتا. Data "
                "privacy مهمة — مينفعش نشارك أرقام العملاء مع أي حد. Launch قبل رمضان."
            ),
        },
    ],
}


def create_project(phase, tag, name, brief):
    code, data = api("POST", "/api/projects", {"name": name, "brief": brief})
    pid = (data.get("project") or {}).get("id") if code == 201 else None
    record(phase, tag, "create_project", "pass" if pid else "fail", f"HTTP {code}, id={pid}")
    return pid


def add_evidence(phase, tag, pid, ev):
    code, data = api("POST", f"/api/projects/{pid}/evidence", ev)
    ok = code == 201
    record(phase, tag, f"add_evidence[{ev.get('language')}]", "pass" if ok else "fail", f"HTTP {code}")


def _phase_registry():
    import rp_audit_phases1
    import rp_audit_phases2

    reg = {"sanity": phase_sanity}
    for mod in (rp_audit_phases1, rp_audit_phases2):
        for name in ("s1", "s2", "s3", "s4", "s5", "s6", "s7"):
            fn = getattr(mod, f"phase_{name}", None)
            if fn:
                reg[name] = fn
    return reg


def main():
    reg = _phase_registry()
    if len(sys.argv) < 2 or sys.argv[1] not in reg:
        print(f"usage: python3 {sys.argv[0]} {'|'.join(reg)}")
        sys.exit(1)
    ph = sys.argv[1]
    RESULTS.clear()
    reg[ph]()
    dump_results(ph)


if __name__ == "__main__":
    # Re-enter through the named module so that phases (which do
    # `from rp_audit_core import record`) share ONE module instance.
    import rp_audit_core

    rp_audit_core.main()
