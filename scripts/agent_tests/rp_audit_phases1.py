# Deep Agent Audit — phase s1 (six pipeline agents + HITL gates) and s2 (instruments)
from rp_audit_core import (
    AR_RE,
    SCENARIO_A,
    api,
    add_evidence,
    create_project,
    get_project,
    load_state,
    record,
    run_stage,
    save_state,
)

AR_LEXICON = ["كثير", "سريع", "مناسب", "جيد", "إلخ", "تقريبا", "غالبا", "بسهولة", "بشكل مريح", "وغيرها", "حاجات", "كتير"]


def _artifact_exists(proj, stage):
    return any(a.get("stage") == stage for a in proj.get("artifacts", []))


def phase_s1():
    st = load_state()
    pid = st.get("A")
    if not pid:
        pid = create_project("s1", "setup", SCENARIO_A["name"], SCENARIO_A["brief"])
        if not pid:
            return
        for ev in SCENARIO_A["evidences"]:
            add_evidence("s1", "setup", pid, ev)
        st["A"] = pid
        save_state(st)

    # ── 1. ELICITATION ────────────────────────────────────────────
    ok, proj, _ = run_stage(pid, "s1", "ELICITATION")
    if not ok:
        return
    qs = proj["questions"]
    n = len(qs)
    record("s1", "elicitation", "el_q_count", "pass" if 4 <= n <= 7 else "fail",
           f"{n} questions (prompt asks for 5)")
    nonempty = all(q["text"].strip() for q in qs)
    record("s1", "elicitation", "el_nonempty", "pass" if nonempty else "fail", "all question texts non-empty")
    ac = all(isinstance(q.get("askCost"), int) and 1 <= q["askCost"] <= 5 for q in qs)
    record("s1", "elicitation", "el_askcost", "pass" if ac else "fail",
           f"askCost 1..5 on all; values={[q.get('askCost') for q in qs]}")
    fb = all(q.get("fallbackAssumption") and len(q["fallbackAssumption"]) >= 15 for q in qs)
    record("s1", "elicitation", "el_fallback", "pass" if fb else "warn",
           "every question carries a substantive fallbackAssumption")
    pr = all(q.get("priority") in ("high", "medium", "low") for q in qs)
    record("s1", "elicitation", "el_priority", "pass" if pr else "fail", f"priorities={[q.get('priority') for q in qs]}")
    arq = [q for q in qs if AR_RE.search(q["text"])]
    record("s1", "elicitation", "el_lang_mirror", "pass" if arq else "warn",
           f"{len(arq)}/{n} questions are Arabic-native (Egyptian dialect) mirroring ar-EG evidence",
           {"arabic_questions": [q["text"][:120] for q in arq]})
    rat = all((q.get("rationale") or "").strip() for q in qs)
    record("s1", "elicitation", "el_rationale", "pass" if rat else "warn", "rationale present on all")
    run = latest = (proj.get("runs") or [{}])[0]
    record("s1", "elicitation", "el_usage", "pass" if (run.get("latencyMs") or 0) > 0 and (run.get("estTokens") or 0) > 0 else "fail",
           f"observatory: latency={run.get('latencyMs')}ms tokens~{run.get('estTokens')} prompt={run.get('promptVersion')}")
    record("s1", "elicitation", "el_artifact", "pass" if _artifact_exists(proj, "ELICITATION") else "fail",
           "ELICITATION artifact snapshot saved")

    # HITL: answer 2, one Egyptian-Arabic answer, proceed-with-uncertainty on 1, leave 1 pending
    if n >= 4:
        q1, q2, q3, q4 = qs[0], qs[1], qs[2], qs[3]
        code, _d = api("PATCH", f"/api/projects/{pid}/items", {
            "kind": "question", "itemId": q1["id"],
            "data": {"answer": "Pilot covers Maadi, Nasr City and Giza only; other districts later."}})
        record("s1", "elicitation", "hitl_answer_en", "pass" if code == 200 else "fail", f"HTTP {code}")
        code, _d = api("PATCH", f"/api/projects/{pid}/items", {
            "kind": "question", "itemId": q2["id"],
            "data": {"answer": "لأ، الدفع كاش بس في المرحلة الأولى ومفيش فيزا خالص."}})
        record("s1", "elicitation", "hitl_answer_ar", "pass" if code == 200 else "fail", "Egyptian-Arabic answer recorded")
        code, _d = api("PATCH", f"/api/projects/{pid}/items", {
            "kind": "question", "itemId": q3["id"], "data": {"action": "proceed_with_uncertainty"}})
        record("s1", "elicitation", "hitl_uncertainty", "pass" if code == 200 else "fail",
               "question 3 marked proceed-with-uncertainty")
        if n > 4:
            code, _d = api("PATCH", f"/api/projects/{pid}/items", {
                "kind": "question", "itemId": qs[4]["id"],
                "data": {"answer": "Success = 80% of orders tracked without a phone call."}})
            record("s1", "elicitation", "hitl_answer_extra", "pass" if code == 200 else "fail", f"HTTP {code}")

    code, data = api("POST", f"/api/projects/{pid}/pipeline", {"action": "approve"})
    record("s1", "elicitation", "gate_approve", "pass" if code == 200 and data.get("nextStage") == "PROBLEM_SELECTION" else "fail",
           f"HTTP {code} nextStage={data.get('nextStage')}")
    proj = get_project(pid)
    skipped = [q for q in proj["questions"] if "(skipped by analyst)" in (q.get("answer") or "")]
    record("s1", "elicitation", "gate_autoskip", "pass" if skipped else "warn",
           f"{len(skipped)} pending question(s) auto-closed with auditable '(skipped by analyst)' marker")
    acts = [d["action"] for d in proj.get("decisions", [])]
    record("s1", "elicitation", "hitl_journal", "pass" if "proceed_with_uncertainty" in acts and "answered_question" in acts else "fail",
           f"journal actions include answered_question + proceed_with_uncertainty ({len(acts)} entries so far)")

    # ── 2. PROBLEM_SELECTION ──────────────────────────────────────
    ok, proj, _ = run_stage(pid, "s1", "PROBLEM_SELECTION")
    if not ok:
        return
    cs = proj["candidates"]
    record("s1", "scope", "ps_count", "pass" if 3 <= len(cs) <= 4 else "warn", f"{len(cs)} candidates")
    rng = all(1 <= c["impact"] <= 5 and 1 <= c["effort"] <= 5 for c in cs)
    record("s1", "scope", "ps_sliders", "pass" if rng else "fail",
           f"impact/effort within 1..5 ({[(c['impact'], c['effort']) for c in cs]})")
    codes_ok = all(
        all(tok.strip() in ("E1", "E2", "E3") for tok in (c["evidenceIds"] or "").split(",") if tok.strip())
        for c in cs)
    grounded = any((c["evidenceIds"] or "").strip() for c in cs)
    record("s1", "scope", "ps_evidence", "pass" if codes_ok and grounded else "warn",
           f"evidence grounding codes valid; grounded={grounded}")
    unc_q = [q for q in proj["questions"] if q["resolution"] == "proceed_with_uncertainty"]
    record("s1", "scope", "ps_ledger_respect", "info",
           f"{len(unc_q)} uncertainty assumption(s) carried; ledger injected into prompt — qualitative check: candidates treat it as provisional",
           {"assumption": (unc_q[0].get("fallbackAssumption") or "")[:150] if unc_q else None})
    record("s1", "scope", "ps_artifact", "pass" if _artifact_exists(proj, "PROBLEM_SELECTION") else "fail", "artifact snapshot")

    if len(cs) >= 2:
        api("PATCH", f"/api/projects/{pid}/items", {"kind": "candidate", "itemId": cs[1]["id"], "data": {"impact": 5, "effort": 2}})
        api("PATCH", f"/api/projects/{pid}/items", {"kind": "candidate", "itemId": cs[1]["id"], "data": {"selected": True}})
        proj = get_project(pid)
        acts = [d["action"] for d in proj["decisions"]]
        record("s1", "scope", "hitl_tune_select", "pass" if "candidate_tuned" in acts and "selected_problem" in acts else "fail",
               "human re-scored impact/effort and selected exactly one problem (journaled)")
    code, data = api("POST", f"/api/projects/{pid}/pipeline", {"action": "approve"})
    record("s1", "scope", "gate_approve", "pass" if code == 200 and data.get("nextStage") == "EXTRACTION" else "fail",
           f"HTTP {code} nextStage={data.get('nextStage')}")

    # ── 3. EXTRACTION (proposer + critic) ─────────────────────────
    ok, proj, _ = run_stage(pid, "s1", "EXTRACTION")
    if not ok:
        return
    rs = proj["requirements"]
    n0 = len(rs)
    record("s1", "extraction", "ex_count", "pass" if 8 <= n0 <= 12 else ("warn" if 13 <= n0 <= 14 else "fail"), f"{n0} requirements")
    shall = sum(1 for r in rs if r["text"].strip().lower().startswith("the system shall") or AR_RE.search(r["text"]) or "لازم" in r["text"])
    record("s1", "extraction", "ex_atomic_form", "pass" if n0 and shall / n0 >= 0.6 else "warn",
           f"{shall}/{n0} are atomic 'The system shall…' (or Arabic-native) statements")
    types_ok = all(r["type"] in ("functional", "nonfunctional", "constraint") for r in rs)
    moscow_ok = all(r["priority"] in ("Must", "Should", "Could", "Won't") for r in rs)
    record("s1", "extraction", "ex_taxonomy", "pass" if types_ok and moscow_ok else "fail",
           f"types valid={types_ok}, MoSCoW valid={moscow_ok}")
    conf_ok = all(0 <= r["confidence"] <= 100 for r in rs)
    avg_conf = round(sum(r["confidence"] for r in rs) / n0) if n0 else -1
    record("s1", "extraction", "ex_confidence", "pass" if conf_ok else "fail",
           f"confidence 0..100 on all (avg {avg_conf}) — calibration input I2")
    traces_ok = all(len(r.get("links") or []) >= 1 and all(l["evidenceCode"] in ("E1", "E2", "E3") for l in r["links"]) for r in rs)
    record("s1", "extraction", "ex_traceability", "pass" if traces_ok else "fail",
           "every requirement carries valid evidence citations (TraceLinks)")
    lang_tags = [r["language"] for r in rs]
    multi = sum(1 for t in lang_tags if t in ("ar-EG", "codeswitch"))
    record("s1", "extraction", "ex_language_tags", "pass" if multi >= 1 else "warn",
           f"{multi}/{n0} requirements keep Arabic/code-switched native language ({set(lang_tags)})")
    seq_ok = all(r["refId"] == f"REQ-{i+1:02d}" for i, r in enumerate(rs))
    record("s1", "extraction", "ex_refids", "pass" if seq_ok else "warn", f"refIds sequential: {seq_ok}")
    ver = [r["verifyStatus"] for r in rs]
    verified = sum(1 for v in ver if v in ("supported", "weak"))
    weak = sum(1 for v in ver if v == "weak")
    notes_ok = all((r.get("verifyNote") or "").strip() for r in rs if r["verifyStatus"] == "weak")
    record("s1", "extraction", "ex_critic_pass", "pass" if verified == n0 else "warn",
           f"critic verdicts: {verified}/{n0} verified ({weak} weak, {n0 - verified} unverified); weak ones carry notes={notes_ok}")
    record("s1", "extraction", "ex_artifact", "pass" if _artifact_exists(proj, "EXTRACTION") else "fail", "artifact snapshot")

    if n0 >= 2:
        api("PATCH", f"/api/projects/{pid}/items", {"kind": "requirement", "itemId": rs[0]["id"],
            "data": {"text": rs[0]["text"][:200] + " (edited by analyst audit)"}})
        code, _d = api("DELETE", f"/api/projects/{pid}/items?kind=requirement&itemId={rs[-1]['id']}")
        proj = get_project(pid)
        acts = [d["action"] for d in proj["decisions"]]
        record("s1", "extraction", "hitl_curation", "pass" if "edited_requirement" in acts and "deleted_requirement" in acts else "fail",
               "human edited one requirement and deleted another (journaled)")
    code, data = api("POST", f"/api/projects/{pid}/pipeline", {"action": "approve"})
    record("s1", "extraction", "gate_approve", "pass" if code == 200 and data.get("nextStage") == "AMBIGUITY" else "fail",
           f"HTTP {code} nextStage={data.get('nextStage')}")

    # ── 4. AMBIGUITY ──────────────────────────────────────────────
    ok, proj, _ = run_stage(pid, "s1", "AMBIGUITY")
    if not ok:
        return
    rs = proj["requirements"]
    scored = [r for r in rs if r["ambiguity"] >= 0]
    record("s1", "ambiguity", "am_all_scored", "pass" if len(scored) == len(rs) and rs else "fail",
           f"{len(scored)}/{len(rs)} requirements scored")
    rng = all(0 <= r["ambiguity"] <= 100 for r in scored)
    record("s1", "ambiguity", "am_range", "pass" if rng else "fail", "scores within 0..100")
    flagged = [r for r in scored if r["ambiguity"] >= 30]
    sug_ok = all((r.get("suggestion") or "").strip() for r in flagged) and all(not r.get("suggestion") for r in scored if r["ambiguity"] < 30)
    record("s1", "ambiguity", "am_rewrites", "pass" if sug_ok else "warn",
           f"{len(flagged)} flagged >=30 all carry measurable rewrites; sub-30 carry none")
    notes_ok = all((r.get("ambiguityNote") or "").strip() for r in flagged)
    record("s1", "ambiguity", "am_weakword_notes", "pass" if notes_ok else "warn", "flagged items cite specific weak phrases")
    ar_reqs = [r for r in scored if r["language"] in ("ar-EG", "codeswitch")]
    lex_hits = [r["refId"] for r in ar_reqs if any(w in (r.get("ambiguityNote") or "") for w in AR_LEXICON)]
    record("s1", "ambiguity", "am_arabic_lexicon", "pass" if (not ar_reqs or lex_hits) else "warn",
           f"Arabic lexicon used on {len(lex_hits)}/{len(ar_reqs)} Arabic/code-switched requirements",
           {"sample_notes": [(r["refId"], (r.get("ambiguityNote") or "")[:120]) for r in ar_reqs[:2]]})
    record("s1", "ambiguity", "am_artifact", "pass" if _artifact_exists(proj, "AMBIGUITY") else "fail", "artifact snapshot")

    worst = max(scored, key=lambda r: r["ambiguity"]) if scored else None
    if worst and worst.get("suggestion"):
        code, _d = api("PATCH", f"/api/projects/{pid}/items", {"kind": "requirement", "itemId": worst["id"], "data": {"action": "apply_suggestion"}})
        proj = get_project(pid)
        w2 = next((r for r in proj["requirements"] if r["id"] == worst["id"]), {})
        record("s1", "ambiguity", "hitl_apply_rewrite", "pass" if code == 200 and w2.get("text") == worst["suggestion"] else "fail",
               f"rewrite applied to {worst['refId']} (was ambiguity {worst['ambiguity']})")
    code, data = api("POST", f"/api/projects/{pid}/pipeline", {"action": "approve"})
    record("s1", "ambiguity", "gate_approve", "pass" if code == 200 and data.get("nextStage") == "STORIES" else "fail",
           f"HTTP {code} nextStage={data.get('nextStage')}")

    # ── 5. STORIES ────────────────────────────────────────────────
    ok, proj, _ = run_stage(pid, "s1", "STORIES")
    if not ok:
        return
    sts = proj["stories"]
    rs = proj["requirements"]
    eligible = [r for r in rs if r["priority"] != "Won't"]
    record("s1", "stories", "st_count", "pass" if len(sts) == len(eligible) else "warn",
           f"{len(sts)} stories vs {len(eligible)} eligible (non-Won't) requirements")
    narr_ok = sum(1 for s in sts if s["narrative"].lower().startswith("as a") or AR_RE.search(s["narrative"]))
    record("s1", "stories", "st_narrative", "pass" if sts and narr_ok == len(sts) else "warn",
           f"{narr_ok}/{len(sts)} follow 'As a <role>, I want…' (or Arabic-native)")
    gher = 0
    for s in sts:
        lines = [l.strip() for l in (s.get("acceptance") or "").split("\n") if l.strip()]
        if lines and any(l.lower().startswith(("given", "when", "then")) or AR_RE.search(l) for l in lines):
            gher += 1
    record("s1", "stories", "st_gherkin", "pass" if sts and gher == len(sts) else "warn",
           f"{gher}/{len(sts)} stories have Gherkin-style acceptance criteria (Given/When/Then)")
    inv_ok = all(s.get("investScore") is not None and 0 <= s["investScore"] <= 100 for s in sts)
    record("s1", "stories", "st_invest", "pass" if inv_ok and sts else "fail",
           f"INVEST scores present and in 0..100 ({[s.get('investScore') for s in sts]})")
    record("s1", "stories", "st_artifact", "pass" if _artifact_exists(proj, "STORIES") else "fail", "artifact snapshot")
    code, data = api("POST", f"/api/projects/{pid}/pipeline", {"action": "approve"})
    record("s1", "stories", "gate_approve", "pass" if code == 200 and data.get("nextStage") == "CONFLICTS" else "fail",
           f"HTTP {code} nextStage={data.get('nextStage')}")

    # ── 6. CONFLICTS + completion + memory harvest ───────────────
    ok, proj, _ = run_stage(pid, "s1", "CONFLICTS")
    if not ok:
        return
    cfs = proj["conflicts"]
    rs = proj["requirements"]
    idmap = {r["id"]: r["refId"] for r in rs}
    record("s1", "consistency", "cf_count", "pass" if len(cfs) <= 6 else "fail",
           f"{len(cfs)} conflicts detected (cap 6)")
    refs_ok = all(c["reqAId"] in idmap and c["reqBId"] in idmap and c["reqAId"] != c["reqBId"] for c in cfs)
    kinds_ok = all(c["kind"] in ("contradiction", "duplication", "overlap") for c in cfs)
    sev_ok = all(c["severity"] in ("high", "medium", "low") for c in cfs)
    sug_ok = all((c.get("suggestion") or "").strip() for c in cfs)
    record("s1", "consistency", "cf_integrity", "pass" if refs_ok and kinds_ok and sev_ok and sug_ok else "fail",
           f"refs valid={refs_ok}, kinds valid={kinds_ok}, severity valid={sev_ok}, suggestions present={sug_ok}")
    record("s1", "consistency", "cf_artifact", "pass" if _artifact_exists(proj, "CONFLICTS") else "fail", "artifact snapshot")

    for c in cfs:
        api("PATCH", f"/api/projects/{pid}/items", {"kind": "conflict", "itemId": c["id"],
            "data": {"resolution": f"AUDIT human verdict: keep A, merge wording of B ({c['kind']})."}})
    code, data = api("POST", f"/api/projects/{pid}/pipeline", {"action": "approve"})
    proj = get_project(pid)
    record("s1", "consistency", "completion", "pass" if code == 200 and proj["status"] == "complete" else "fail",
           f"pipeline complete: status={proj['status']}")
    bug = [d for d in proj["decisions"] if d["action"] == "resolved_conflict" and "undefined" in d["detail"]]
    record("s1", "consistency", "cf_journal_refs", "fail" if bug else "pass",
           "resolved_conflict journal entries render requirement refs correctly" if not bug else
           f"BUG CONFIRMED: {len(bug)} journal entries contain 'undefined' refs (items route uses nonexistent c.reqARef/reqBRef fields)",
           {"sample": bug[0]["detail"][:160] if bug else None})
    acts = [d["action"] for d in proj["decisions"]]
    record("s1", "consistency", "hitl_resolution_journal", "pass" if "resolved_conflict" in acts else "fail",
           "human conflict resolutions journaled")


def phase_s2():
    st = load_state()
    pid = st.get("A")
    if not pid:
        record("s2", "instruments", "setup", "fail", "Scenario A project id missing (run s1 first)")
        return
    proj = get_project(pid)

    # ── HEALTH (I14) ──────────────────────────────────────────────
    code, data = api("POST", f"/api/projects/{pid}/health")
    rep = data.get("report") or {}
    fields = ["summary", "strengths", "risks", "recommendations", "ambiguityDebt", "uncertaintyLedger", "conflictDigest"]
    present = all(rep.get(f) for f in fields)
    record("s2", "health", "hl_fields", "pass" if code == 200 and present else "fail",
           f"all 7 report fields present={present}")
    quantified = all(any(ch.isdigit() for ch in str(rep.get(f, ""))) for f in ("ambiguityDebt", "uncertaintyLedger", "conflictDigest"))
    record("s2", "health", "hl_quantified_debt", "pass" if quantified else "warn",
           "debt sections are quantified (contain numbers) — no magic single score",
           {"ambiguityDebt": str(rep.get("ambiguityDebt"))[:200],
            "uncertaintyLedger": str(rep.get("uncertaintyLedger"))[:200],
            "conflictDigest": str(rep.get("conflictDigest"))[:200]})
    record("s2", "health", "hl_body", "info",
           f"strengths={len(rep.get('strengths') or [])}, risks={len(rep.get('risks') or [])}, recommendations={len(rep.get('recommendations') or [])}")
    code, data = api("GET", f"/api/projects/{pid}/health")
    record("s2", "health", "hl_persistence", "pass" if code == 200 and data.get("report") else "fail",
           "latest report retrievable from stored HEALTH artifact")

    # ── DRIFT (I8) ────────────────────────────────────────────────
    signal = "The investor now requires card payments at launch — cash-only is no longer acceptable, and a PSD-compliant gateway must be integrated."
    code, data = api("POST", f"/api/projects/{pid}/drift", {"signal": signal})
    impacted = data.get("impacted", -1)
    record("s2", "drift", "dr_impact", "pass" if code == 200 and impacted >= 1 else "warn",
           f"change signal flagged {impacted} requirement(s) as impacted")
    record("s2", "drift", "dr_summary", "pass" if (data.get("summary") or "").strip() else "fail",
           f"summary: {str(data.get('summary'))[:220]}")
    proj = get_project(pid)
    flagged = [r["refId"] for r in proj["requirements"] if r["driftStatus"] == "suspected"]
    record("s2", "drift", "dr_flags_persisted", "pass" if len(flagged) == impacted else "warn",
           f"driftStatus=suspected persisted on {len(flagged)} requirement(s) {flagged}")
    code, data = api("DELETE", f"/api/projects/{pid}/drift")
    proj = get_project(pid)
    left = sum(1 for r in proj["requirements"] if r["driftStatus"] != "none")
    record("s2", "drift", "dr_clear", "pass" if code == 200 and left == 0 else "fail", f"flags cleared, {left} remaining")

    # ── COMPLIANCE (I11) — 3 packs ───────────────────────────────
    for pack, label in (("gdpr", "privacy/PDPL"), ("accessibility", "WCAG 2.2"), ("performance", "performance")):
        code, data = api("POST", f"/api/projects/{pid}/compliance", {"pack": pack})
        overall = data.get("overall")
        gaps = data.get("gaps") or []
        covered = data.get("covered") or []
        gaps_ok = all(g.get("aspect") and g.get("note") and g.get("suggestion") for g in gaps)
        record("s2", "compliance", f"cp_{pack}", "pass" if code == 200 and overall in ("pass", "partial", "fail") and gaps_ok else "fail",
               f"{label}: overall={overall}, {len(covered)} covered aspects, {len(gaps)} gaps (all with concrete suggestions={gaps_ok})",
               {"overall": overall, "gap_aspects": [g.get("aspect") for g in gaps][:6]})
    rs = proj["requirements"]
    valid_refs = {r["refId"] for r in rs}
    code, data = api("POST", f"/api/projects/{pid}/compliance", {"pack": "accessibility"})
    cov_ok = all(c.get("refId") in valid_refs for c in (data.get("covered") or []))
    record("s2", "compliance", "cp_covered_refs", "pass" if cov_ok else "warn", "covered aspects cite real requirement refIds")
    code, data = api("POST", f"/api/projects/{pid}/compliance", {"pack": "bogus_pack"})
    record("s2", "compliance", "cp_invalid_pack", "warn" if code == 200 else "pass",
           f"unknown pack silently falls back to privacy pack (HTTP {code}, overall={data.get('overall')}) — FINDING: no input validation error")

    # full snapshot for the report
    import json as _json
    import os as _os
    snap = get_project(pid)
    out = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "results", "scenario_A_snapshot.json")
    with open(out, "w") as f:
        _json.dump(snap, f, indent=2, ensure_ascii=False)
    record("s2", "instruments", "snapshot", "info", f"full Scenario-A project snapshot saved ({out})")
