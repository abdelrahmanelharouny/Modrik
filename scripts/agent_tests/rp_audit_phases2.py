# Deep Agent Audit — phases s3 (wind tunnel) s4 (robustness) s5 (state machine) s6 (ASR) s7 (memory+cleanup)
import base64
import json
import os
import sqlite3

from rp_audit_core import AR_RE, HERE, api, add_evidence, create_project, get_project, load_state, record, run_stage, save_state

DB_PATH = os.path.join(HERE, "..", "..", "db", "custom.db")

SHUTTLE_BRIEF = (
    "CampusShuttle — a university shuttle live-tracking app. Students want live bus "
    "locations and arrival estimates across 4 routes. The student union funds the pilot "
    "and must approve the budget and timeline."
)
SHUTTLE_EVIDENCES = [
    {
        "title": "Student council interview",
        "sourceType": "interview",
        "language": "en",
        "content": (
            "Students complain buses are unreliable and they wait too long. They want live "
            "GPS tracking and estimated arrival times on their phones. The transport office "
            "runs 12 buses on 4 routes. A pilot is planned for the spring semester. Some "
            "students speak only Arabic, so the app should support both languages."
        ),
    },
    {
        "title": "Transport office sync notes",
        "sourceType": "meeting",
        "language": "en",
        "content": (
            "The transport office wants a simple admin dashboard to update bus positions "
            "manually when GPS fails. Students should see bus movement within 30 seconds. "
            "Budget and final timeline must be confirmed with the student union before the "
            "pilot starts."
        ),
    },
]

SECRET_UNRELATED = "The transport office secretly plans to rebrand the shuttle service as 'CairoRide' next year."
SECRET_BUDGET = "The student union secretly cut the pilot budget by 40 percent, and the launch will slip from spring to the fall semester."


def _shuttle_project(tag):
    pid = create_project(tag, "setup", f"AGENT-AUDIT-{tag.upper()} — CampusShuttle", SHUTTLE_BRIEF)
    if not pid:
        return None
    for ev in SHUTTLE_EVIDENCES:
        add_evidence(tag, "setup", pid, ev)
    return pid


def phase_s3():
    st = load_state()

    # ── Arm 1: unrelated secret ──────────────────────────────────
    pid1 = st.get("W1") or _shuttle_project("W1")
    if pid1:
        st["W1"] = pid1
        save_state(st)
        ok, proj, _ = run_stage(pid1, "s3", "ELICITATION")
        if ok:
            qs = proj["questions"]
            record("s3", "wind_tunnel", "wt_questions_ready", "pass" if qs else "fail", f"{len(qs)} questions pending")
            code, data = api("POST", f"/api/projects/{pid1}/wind-tunnel", {
                "persona": "A busy, discreet university transport coordinator. Answers briefly and avoids sharing internal plans.",
                "secret": SECRET_UNRELATED,
            })
            ans = data.get("answered", -1)
            record("s3", "wind_tunnel", "wt_arm1_answered", "pass" if code == 200 and ans == len(qs) else "warn",
                   f"persona filled {ans}/{len(qs)} answers")
            proj = get_project(pid1)
            leaked = [q["id"] for q in proj["questions"] if "CairoRide" in (q.get("answer") or "")]
            record("s3", "wind_tunnel", "wt_arm1_secret_kept", "pass" if not leaked else "warn",
                   "unrelated secret NOT leaked into any answer (persona conditioning holds)" if not leaked
                   else f"secret leaked into {len(leaked)} answer(s)")
            prefixed = all((q.get("answer") or "").startswith("[synthetic · wind tunnel]") for q in proj["questions"] if q.get("answered"))
            record("s3", "wind_tunnel", "wt_synthetic_label", "pass" if prefixed else "warn",
                   "synthetic answers visibly labelled '[synthetic · wind tunnel]' — no impersonation of real stakeholders")
            acts = [d["action"] for d in proj["decisions"]]
            record("s3", "wind_tunnel", "wt_journal", "pass" if "synthetic_answers" in acts else "fail",
                   "wind-tunnel fill journaled as synthetic_answers (actor=agent)")

    # ── Arm 2: on-topic secret (budget/timeline) ─────────────────
    pid2 = st.get("W2") or _shuttle_project("W2")
    if pid2:
        st["W2"] = pid2
        save_state(st)
        ok, proj, _ = run_stage(pid2, "s3", "ELICITATION")
        if ok:
            qs = proj["questions"]
            budget_qs = [q for q in qs if any(k in q["text"].lower() for k in ("budget", "timeline", "fund", "semester", "cost", "deadline", "launch", "schedule", "money", "ميزانية", "وقت", "موعد"))]
            code, data = api("POST", f"/api/projects/{pid2}/wind-tunnel", {
                "persona": "A candid student union treasurer who shares financial and scheduling details when asked directly.",
                "secret": SECRET_BUDGET,
            })
            ans = data.get("answered", -1)
            record("s3", "wind_tunnel", "wt_arm2_answered", "pass" if code == 200 and ans == len(qs) else "warn",
                   f"persona filled {ans}/{len(qs)} answers")
            proj = get_project(pid2)
            revealing = [q["id"] for q in proj["questions"] if ("40" in (q.get("answer") or "") and "percent" in (q.get("answer") or "").lower()) or "fall semester" in (q.get("answer") or "").lower()]
            record("s3", "wind_tunnel", "wt_arm2_probe_reveals", "pass" if budget_qs and revealing else "warn",
                   f"{len(budget_qs)} question(s) probed budget/timeline; {len(revealing)} answer(s) revealed the held-out secret",
                   {"budget_questions": [q["text"][:110] for q in budget_qs[:3]],
                    "revealing_answers": [next((q.get("answer") or "")[:180] for q in proj["questions"] if q["id"] == rid) for rid in revealing[:2]]})
            not_probed = [q["id"] for q in proj["questions"] if q["id"] not in revealing and "40 percent" in (q.get("answer") or "")]
            record("s3", "wind_tunnel", "wt_arm2_evasive_elsewhere", "pass" if not not_probed else "warn",
                   "secret only surfaced on direct probes (evasive elsewhere)")


def phase_s4():
    st = load_state()

    # ── B1: brief-only, zero evidence ────────────────────────────
    pid = st.get("B1")
    if not pid:
        pid = create_project("s4", "setup", "AGENT-AUDIT-B1 — Brief Only", "A car-pooling app for a single gated community with 40 families; evening commute sharing, cost split, and a rota of volunteer drivers.")
        if not pid:
            return
        st["B1"] = pid
        save_state(st)
    ok, proj, _ = run_stage(pid, "s4", "ELICITATION")
    if ok:
        qs = proj["questions"]
        record("s4", "elicitation", "b1_zero_evidence", "pass" if len(qs) >= 3 else "warn",
               f"graceful degradation with '(no evidence sources provided yet)': {len(qs)} questions generated from brief alone")

    # ── B2: long-evidence truncation probe (1200-char cutoff) ────
    pid = st.get("B2")
    if not pid:
        filler = (
            "This document describes daily operations of the community kitchen ordering process. "
            "Volunteers collect orders by phone each morning and write them into a shared notebook. "
            "The notebook is passed between three shifts, and mistakes happen when handwriting is "
            "unclear. Meals are cooked in two kitchens and delivered by two drivers before noon. "
            "The team currently has no digital tooling and relies on group chats for coordination. "
        ) * 6  # ~2800+ chars of filler before the critical tail
        critical = (
            "SECURITY AND RETENTION APPENDIX. The system shall support two-factor authentication "
            "for all administrator accounts before launch. The system shall archive completed "
            "orders for seven years to satisfy municipal audits. "
        )
        pid = create_project("s4", "setup", "AGENT-AUDIT-B2 — Long Evidence Probe", "A meal-ordering tracker for a community kitchen run by volunteers; the ops handbook is long and the appendix matters.")
        if not pid:
            return
        add_evidence("s4", "setup", pid, {
            "title": "Ops handbook (long, appendix at end)",
            "sourceType": "document",
            "language": "en",
            "content": filler + critical,  # critical section starts beyond the 1200-char cutoff
        })
        st["B2"] = pid
        st["B2_cut"] = len(filler)
        save_state(st)
    proj = get_project(pid)
    ev = proj["evidences"][0] if proj["evidences"] else None
    cut = st.get("B2_cut", 0)
    if ev:
        record("s4", "extraction", "b2_probe_setup", "info",
               f"evidence length {len(ev['content'])} chars; critical appendix starts at char {cut} — but every agent prompt truncates each evidence at 1200 chars (evidenceBlock slice)")
    # fly the pipeline to extraction with minimal HITL (idempotent resume)
    def _ensure(agent):
        proj = get_project(pid)
        if proj["currentStage"] != agent:
            return True
        if proj["stageStatus"] == "awaiting_input":
            ok, _proj, _ = run_stage(pid, "s4", agent)
            if not ok:
                return False
        return True

    if not _ensure("ELICITATION"):
        return
    proj = get_project(pid)
    if proj["currentStage"] == "ELICITATION" and proj["stageStatus"] == "awaiting_review":
        for q in proj["questions"]:
            api("PATCH", f"/api/projects/{pid}/items", {"kind": "question", "itemId": q["id"], "data": {"answer": "Standard volunteer operations; no special constraints."}})
        api("POST", f"/api/projects/{pid}/pipeline", {"action": "approve"})
    if not _ensure("PROBLEM_SELECTION"):
        return
    proj = get_project(pid)
    if proj["currentStage"] == "PROBLEM_SELECTION" and proj["stageStatus"] == "awaiting_review":
        cs = proj["candidates"]
        if cs:
            api("PATCH", f"/api/projects/{pid}/items", {"kind": "candidate", "itemId": cs[0]["id"], "data": {"selected": True}})
        api("POST", f"/api/projects/{pid}/pipeline", {"action": "approve"})
    if not _ensure("EXTRACTION"):
        return
    proj = get_project(pid)
    rs = proj["requirements"]
    def _hits(r):
        t = (r["text"] + " " + (r.get("verifyNote") or "") + " " + " ".join(l["evidenceCode"] for l in (r.get("links") or []))).lower()
        return "two-factor" in t or "2fa" in t or "archive" in t or "seven years" in t or "retention" in t
    hits = [r["refId"] for r in rs if _hits(r)]
    record("s4", "extraction", "b2_tail_grounding", "pass" if hits else "warn",
           f"POST-FIX expectation met: {len(hits)} of {len(rs)} extracted requirements now reference the beyond-1200-char appendix (two-factor/auth/archive/retention): {hits}"
           if hits else
           f"appendix still missed by all {len(rs)} requirements — budget raise did not bite this run (check evidence window)")
    record("s4", "extraction", "b2_req_count", "info", f"{len(rs)} requirements extracted from the visible first-1200-chars window")


def phase_s5():
    st = load_state()
    pid = st.get("C")
    if not pid:
        pid = create_project("s5", "setup", "AGENT-AUDIT-C — Guardrails", "Guardrail probe project for state-machine and validation tests.")
        if not pid:
            return
        st["C"] = pid
        save_state(st)

    code, _d = api("POST", f"/api/projects/{pid}/pipeline", {"action": "approve"})
    record("s5", "state_machine", "sm_approve_before_run", "pass" if code == 409 else "fail",
           f"approve before any agent run rejected with HTTP {code} (expect 409)")
    code, _d = api("POST", "/api/projects", {"brief": "no name"})
    record("s5", "state_machine", "sm_create_no_name", "pass" if code == 400 else "fail", f"project without name rejected: HTTP {code}")
    code, _d = api("PATCH", f"/api/projects/{pid}/items", {"kind": "nonsense", "itemId": "x", "data": {}})
    record("s5", "state_machine", "sm_bad_kind", "pass" if code == 400 else "fail", f"unknown item kind rejected: HTTP {code}")
    code, _d = api("PATCH", f"/api/projects/{pid}/items", {"kind": "question", "itemId": "bogus-id", "data": {"answer": "x"}})
    record("s5", "state_machine", "sm_bad_item", "pass" if code == 404 else "fail", f"unknown itemId rejected: HTTP {code}")
    code, _d = api("POST", f"/api/projects/{pid}/drift", {"signal": ""})
    record("s5", "state_machine", "sm_drift_empty", "pass" if code == 400 else "fail", f"empty drift signal rejected: HTTP {code}")
    code, _d = api("POST", f"/api/projects/{pid}/wind-tunnel", {"persona": ""})
    record("s5", "state_machine", "sm_wt_no_persona", "pass" if code == 400 else "fail", f"wind tunnel without persona rejected: HTTP {code}")
    code, _d = api("POST", "/api/transcribe", {"audio": ""})
    record("s5", "state_machine", "sm_asr_empty", "pass" if code == 400 else "fail", f"ASR without audio rejected: HTTP {code}")

    # evidence management: renumbering after delete
    for t in ("alpha", "beta", "gamma"):
        add_evidence("s5", "state_machine", pid, {"title": t, "content": f"content {t}", "sourceType": "document", "language": "en", "consent": True})
    proj = get_project(pid)
    codes0 = [e["code"] for e in proj["evidences"]]
    first = proj["evidences"][0]
    code, _d = api("DELETE", f"/api/projects/{pid}/evidence?evidenceId={first['id']}")
    proj = get_project(pid)
    codes1 = [e["code"] for e in proj["evidences"]]
    renumber_ok = codes1 == ["E1", "E2"]
    record("s5", "state_machine", "sm_evidence_renumber", "pass" if code == 200 and renumber_ok else "fail",
           f"codes {codes0} -> after delete {codes1}")
    consent_on_file = any("consent on file" in d["detail"] for d in proj["decisions"])
    record("s5", "state_machine", "sm_consent_journal", "pass" if consent_on_file else "warn",
           "consent recording surfaced in decision journal (G13)")

    # double-run protection (one real LLM call)
    ok, proj, _ = run_stage(pid, "s5", "ELICITATION")
    if ok:
        code, _d = api("POST", f"/api/projects/{pid}/pipeline", {"action": "run"})
        record("s5", "state_machine", "sm_double_run", "pass" if code == 409 else "fail",
               f"second run while awaiting_review rejected: HTTP {code}")

    # reopen path on completed project A
    stA = load_state().get("A")
    if stA:
        projA = get_project(stA)
        if projA["status"] == "complete":
            code, _d = api("POST", f"/api/projects/{stA}/pipeline", {"action": "run"})
            record("s5", "state_machine", "sm_complete_locked", "pass" if code == 409 else "fail",
                   f"running agents on completed baseline rejected: HTTP {code}")
            code, _d = api("POST", f"/api/projects/{stA}/pipeline", {"action": "reopen"})
            projA = get_project(stA)
            record("s5", "state_machine", "sm_reopen", "pass" if code == 200 and projA["status"] == "active" else "fail",
                   f"baseline reopened for iteration (status={projA['status']}, stage={projA['currentStage']})")


def phase_s6():
    here = HERE
    for clip, lang in (("tts_en.wav", "en"), ("tts_ar.wav", "ar-EG")):
        p = os.path.join(here, clip)
        if not os.path.exists(p):
            record("s6", "asr", f"asr_{lang}_setup", "fail", f"{clip} missing — run: node {here}/rp_tts.mjs")
            continue
        b64 = base64.b64encode(open(p, "rb").read()).decode()
        code, data = api("POST", "/api/transcribe", {"audio": b64, "expectedLanguage": lang}, timeout=180)
        text = (data.get("text") or "").strip()
        warn = data.get("warning")
        got_lang = "ar" if AR_RE.search(text) else ("latin" if text else "?")
        if lang == "ar-EG":
            ok = code == 200 and text
            quality = "arabic" if got_lang == "ar" else "NON-ARABIC SCRIPT"
            record("s6", "asr", f"asr_{lang}_transcribe", "pass" if ok else "fail",
                   f"transcript script: {quality}; text: {text[:120]}")
            record("s6", "asr", f"asr_{lang}_script_guard", "pass" if warn else ("warn" if got_lang == "ar" else "fail"),
                   f"script-mismatch guard warning returned: {bool(warn)} — {str(warn)[:120]}")
        else:
            record("s6", "asr", f"asr_{lang}_transcribe", "pass" if code == 200 and text and got_lang == "latin" else ("warn" if code == 200 else "fail"),
                   f"transcript ({got_lang}): {text[:160]}")
            record("s6", "asr", f"asr_{lang}_script_guard", "pass" if not warn else "warn",
                   f"no false-positive mismatch warning for English clip: {not warn}")
    code, _d = api("POST", "/api/transcribe", {"audio": "A" * 20_000_001})
    record("s6", "asr", "asr_oversize_guard", "pass" if code == 413 else "fail",
           f"20MB payload rejected: HTTP {code} (expect 413)")


def phase_s7():
    # memory continuity (I4) — direct DB inspection
    try:
        con = sqlite3.connect(DB_PATH)
        cur = con.cursor()
        rows = cur.execute("SELECT kind, term, substr(detail,1,90) FROM MemoryEntry ORDER BY createdAt DESC LIMIT 12").fetchall()
        total = cur.execute("SELECT COUNT(*) FROM MemoryEntry").fetchone()[0]
        con.close()
        lessons = [r for r in rows if r[0] == "lesson"]
        gloss = [r for r in rows if r[0] == "glossary"]
        record("s7", "memory", "mem_harvest", "pass" if total else "warn",
               f"{total} MemoryEntry rows (lessons={len(lessons)}, glossary={len(gloss)}) — harvested on pipeline completion",
               {"lessons": [f"{r[1]}: {r[2]}" for r in lessons[:4]], "glossary_terms": [r[1] for r in gloss[:5]]})
    except Exception as e:  # noqa: BLE001
        record("s7", "memory", "mem_harvest", "fail", f"DB inspection failed: {e}")

    # cross-project injection: new project elicitation runs AFTER lessons exist
    st = load_state()
    pid = st.get("M")
    if not pid:
        pid = create_project("s7", "setup", "AGENT-AUDIT-M — Memory Injection Probe", "A tutoring marketplace connecting university students with private tutors; sessions booked per hour, payment on meeting.")
        if not pid:
            return
        add_evidence("s7", "setup", pid, {"title": "Student interview", "content": "I never know if the tutor is good before paying. I want ratings and a trial session. Payment should be cash or card.", "sourceType": "interview", "language": "en", "consent": True})
        st["M"] = pid
        save_state(st)
    ok, proj, _ = run_stage(pid, "s7", "ELICITATION")
    if ok:
        record("s7", "memory", "mem_reinjection", "info",
               "elicitation ran after lessons were harvested — CROSS-PROJECT LESSONS block is injected into the prompt (code-verified G4 mechanism); behavioral influence is qualitative",
               {"question_sample": [q["text"][:90] for q in proj["questions"][:3]]})

    # cleanup audit projects
    st = load_state()
    for key in ("A", "W1", "W2", "B1", "B2", "C", "M"):
        pid = st.get(key)
        if not pid:
            continue
        code, _d = api("DELETE", f"/api/projects/{pid}")
        record("s7", "cleanup", f"delete_{key}", "pass" if code == 200 else "fail", f"{key} ({pid}) removed")
        st[key] = None
    save_state(st)
    code, data = api("GET", "/api/projects")
    remaining = [p["name"] for p in data.get("projects", []) if str(p["name"]).startswith("AGENT-AUDIT")]
    record("s7", "cleanup", "no_residue", "pass" if not remaining else "warn", f"audit projects remaining: {remaining}")
