#!/usr/bin/env python3
# ─────────────────────────────────────────────────────────────
# RequirementPilot — arbench-v2 benchmark bank builder (dev item 13)
#
# Expands the original 10-fixture arbench-v1 to a 120-scenario bank:
#   8 categories × 5 domains × 3 evidence-mix variants = 120
#   6 gold artifact types (requirements_json, question_utility_json,
#   conflict_pairs_json, ambiguity_scores_json, exec_scenarios_json,
#   trace_matrix_csv)
#
# Hand-authored Egyptian-Arabic / code-switch seeds; deterministic
# assembly (no LLM) so the bank is reproducible and citable.
# Output: bench/scenarios/*.json + bench/manifest.json + stats table.
# ─────────────────────────────────────────────────────────────
import json
import os
import csv
import io

BASE = "/home/z/my-project/bench"
SCEN_DIR = os.path.join(BASE, "scenarios")
os.makedirs(SCEN_DIR, exist_ok=True)

# ── Domain knowledge cores ────────────────────────────────────
DOMAINS = {
    "food_market": {
        "label": "Home-cooking marketplace",
        "brief_en": "A Cairo marketplace app where home cooks sell fresh meals to nearby customers; orders, payouts and reviews in one place.",
        "stakeholders": ["home cook", "customer", "delivery runner"],
        "ar_interview": (
            "منى: أنا بطبخ أكل بلدي من البيت وبيعته للجيران بس. عايزة تطبيق يعرض أكلاتي اليومية "
            "والزباين يطلبوا من التطبيق على طول. المشكلة إن في ناس بتطلب وبتنسى، ومحتاجة أعرف مين "
            "اللي لسه مادفعش. وكمان لو الطلب متأخر عايزة الزبون يعرف قبل ما يزعل."
        ),
        "codeswitch_meeting": (
            "Meeting notes: اللاجتبويشن الجديد لازم يكون خفيف — first screen يعرض أكلات النهاردة بس. "
            "الـ payout ه يكون weekly، والعمولة بـ 5% بس. ولازم الـ reviews تكون verified بعد توصيل فعلٍ."
        ),
        "requirements": [
            ("The system shall let a home cook publish a daily menu with quantities before 10:00.", "functional", "Must"),
            ("The system shall show each order's payment state (pending/paid) to the cook.", "functional", "Must"),
            ("The system shall notify the customer when an order is delayed by more than 15 minutes.", "functional", "Must"),
            ("The system shall verify a review only after the corresponding delivery is confirmed.", "functional", "Should"),
            ("The system shall compute a 5% platform commission on each completed payout.", "functional", "Must"),
            ("Cooked-food listings shall expire automatically at 23:59 the same day.", "constraint", "Should"),
        ],
        "weak_reqs": [
            ("The system shall handle orders quickly.", 85, "vague quantifier 'quickly' — no latency bound"),
            ("The app shall be user-friendly for cooks.", 90, "subjective 'user-friendly' — untestable"),
            ("The system shall support many customers.", 75, "unbounded scale 'many'"),
        ],
        "conflict_pair": (
            "The system shall keep each cook's full address visible to customers for delivery.",
            "The system shall hide the cook's exact home address and only reveal a pickup zone.",
            "contradiction", "value", "delivery traceability vs cook privacy",
        ),
        "exec": {
            "given": "A cook published 3 meals; a customer ordered meal #2 and paid online.",
            "when": "The customer cancels 2 minutes after payment.",
            "then_defined": "The order becomes cancelled and the payment enters refund processing.",
            "then_undefined": "The cook's daily published quantity for meal #2 is restored.",
        },
        "question_gold": [
            ("إزاي هنحدد مناطق التوصيل اللي بتخدميها؟", 4),
            ("لو الطلب اترجع، مين بيتحمل cost الشحن؟", 5),
        ],
    },
    "clinic": {
        "label": "Clinic appointment booking",
        "brief_en": "A booking system for a chain of clinics: slots, follow-ups, insurance verification and reminders.",
        "stakeholders": ["patient", "doctor", "receptionist"],
        "ar_interview": (
            "د. أحمد: المواعيد اللي بتتلغي آخر لحظة بتضيّرنا أكتر من حاجة. محتاج المريض يأكد قبلها بساعتين "
            "وإلا الكرسي يروح لغيره. وكمان العيادة بتشتغل بفيزيائية وكارت تأمين، فلازم النظام يعرف يفرّق "
            "بينهم من أول الشاشة. والانتظار محتاج يبقى مرتب مش فوضى زي دلوقتي."
        ),
        "codeswitch_meeting": (
            "Reception workflow: الـ insurance verification لازم تتم قبل الـ check-in — otherwise الـ patient "
            "هيفضل واقف. الـ no-show policy: بعد تأكدين دون حضور، الـ slot التالي يحتاج prepayment."
        ),
        "requirements": [
            ("The system shall release an unconfirmed slot to other patients 2 hours before the appointment.", "functional", "Must"),
            ("The system shall distinguish insurance-funded from cash-paying patients at intake.", "functional", "Must"),
            ("The system shall require prepayment for a patient with two recent no-shows.", "functional", "Should"),
            ("The system shall verify insurance eligibility before check-in is possible.", "functional", "Must"),
            ("The system shall present the waiting queue position in real time.", "functional", "Could"),
            ("Medical records shall be retained for 10 years per health regulations.", "constraint", "Must"),
        ],
        "weak_reqs": [
            ("The system shall send reminders appropriately.", 80, "vague 'appropriately' — timing/channel unspecified"),
            ("Booking shall be fast.", 85, "vague 'fast' — no latency target"),
            ("The interface shall be clear for elderly patients.", 78, "subjective 'clear' — untestable"),
        ],
        "conflict_pair": (
            "The system shall auto-assign the shortest-queue doctor for walk-ins.",
            "The system shall let the patient choose any available doctor regardless of queue.",
            "contradiction", "value", "throughput vs patient autonomy",
        ),
        "exec": {
            "given": "Dr. Salma has 3 open slots; a patient with two no-shows books one.",
            "when": "The patient submits the booking without paying.",
            "then_defined": "The booking is held pending prepayment.",
            "then_undefined": "How long the pending prepayment is held before auto-release.",
        },
        "question_gold": [
            ("لو التأمين مرفوض في نفس اللحظة، الميعاد بيتلغي ولا بيتحول كاش؟", 5),
            ("إزاي بنحسب الـ no-show لو المريض اتأخر ربع ساعة بس؟", 4),
        ],
    },
    "lms": {
        "label": "University learning management",
        "brief_en": "A lightweight LMS for a university department: assignments, plagiarism checks, gradebook and attendance.",
        "stakeholders": ["student", "instructor", "TA"],
        "ar_interview": (
            "أ. سارة: الطلبة بيسلموا الـ assignments على واتساب وضياع كبير. عايزة نظام ياخد التسليم ويرفض "
            "اللي بعد الـ deadline تلقائيًا، بس عندي استثناءات طبية فمحتاجة أقدر أتجاوز الرفض بنفسي. "
            "وكمان التشابه في الحلول بقت مشكلة، محتاجة تقرير يشوف ده قبل ما أسلّم الدرجات."
        ),
        "codeswitch_meeting": (
            "Gradebook rules: الـ late penalty هي 10% per day بحد أقصى 3 أيام، وبعدها الـ submission بيتقفل. "
            "الـ plagiarism report لازم يبقى visible للـ TA قبل الـ grading flow يبدأ."
        ),
        "requirements": [
            ("The system shall refuse assignment submissions after the deadline unless an instructor overrides.", "functional", "Must"),
            ("The system shall apply a 10%-per-day late penalty capped at 3 days.", "functional", "Must"),
            ("The system shall surface a similarity report to the TA before grading starts.", "functional", "Should"),
            ("The system shall record attendance from a QR check-in per session.", "functional", "Could"),
            ("The system shall let an instructor override a rejected submission with a reason note.", "functional", "Must"),
            ("Grades shall be exportable as CSV compatible with the faculty registry.", "constraint", "Must"),
        ],
        "weak_reqs": [
            ("The system shall grade assignments efficiently.", 82, "vague 'efficiently' — no bound"),
            ("The dashboard shall be nice-looking.", 88, "subjective 'nice-looking'"),
            ("The system shall handle peak load well.", 76, "unbounded 'peak load well'"),
        ],
        "conflict_pair": (
            "The system shall reject all late submissions automatically.",
            "The system shall accept medical-excused submissions without penalty at any time.",
            "contradiction", "precedence", "automatic rejection vs documented exception flow",
        ),
        "exec": {
            "given": "An assignment closed 4 days ago; a student submits now with a medical note.",
            "when": "The instructor approves the exception override.",
            "then_defined": "The submission is accepted and recorded with the override reason.",
            "then_undefined": "Whether the 30% capped late penalty still applies after the override.",
        },
        "question_gold": [
            ("لو الطالب سلّم متأخر وبعدين جهيز إعفاء طبي، الرصيد بيرجع إزاي؟", 4),
            ("مين اللي يقدر يعدّل الـ deadline بعد ما يكون اتعلن؟", 3),
        ],
    },
    "rideshare": {
        "label": "Ride-sharing for campuses",
        "brief_en": "A ride-sharing service limited to university campuses: matched carpools, safety checks and capped fares.",
        "stakeholders": ["rider", "driver", "campus safety office"],
        "ar_interview": (
            "كريم: بننقل الطلبة من المدينة للجامعة والزحمة قتلتنا. محتاجين matching سريع صباحًا وكل عربية "
            "لازم تتسجل عند أمن الجامعة. المشكلة إن الفلوس بتتأخر، وعايزين حد أقصى للأجرة عشان نفضل أرخص "
            "من المواصلات الخاصة. والبنات محتاجين خيار إن السواق بنت."
        ),
        "codeswitch_meeting": (
            "Ops sync: الـ fare cap اللي هو 25 EGP للرحلة الواحدة non-negotiable — marketing already promised it. "
            "الـ matching window في الصبح هو 20 دقيقة، ولو مفيش match الـ rider بيتحول لـ waitlist."
        ),
        "requirements": [
            ("The system shall cap any single-ride fare at 25 EGP.", "constraint", "Must"),
            ("The system shall match riders within a 20-minute morning window, else move them to a waitlist.", "functional", "Must"),
            ("The system shall allow riders to filter for female drivers.", "functional", "Should"),
            ("The system shall verify each driver's campus safety-office registration before activation.", "functional", "Must"),
            ("The system shall settle driver earnings within 48 hours of trip completion.", "functional", "Should"),
            ("Trip history shall be anonymised after 90 days for privacy.", "constraint", "Could"),
        ],
        "weak_reqs": [
            ("Matching shall happen quickly in the morning.", 84, "vague 'quickly' — window already defined elsewhere"),
            ("The app shall feel safe for riders.", 89, "subjective 'feel safe' — untestable"),
            ("The system shall scale as the campus grows.", 72, "unbounded growth claim"),
        ],
        "conflict_pair": (
            "The system shall cap fares at 25 EGP per ride.",
            "The system shall allow surge pricing during peak hours to guarantee driver supply.",
            "contradiction", "constraint", "regulatory-like cap vs market balancing",
        ),
        "exec": {
            "given": "A rider requests at 07:55 inside the morning window; no driver matches by 08:15.",
            "when": "The window closes without a match.",
            "then_defined": "The rider is moved to the waitlist automatically.",
            "then_undefined": "Whether the rider is notified and with what message.",
        },
        "question_gold": [
            ("لو السواق ألغى بعد ما الراكب استلمت تأكيد، مين بيتعوض؟", 5),
            ("إزاي نتأكد إن تسجيل أمن الجامعة مازال ساري كل ترم؟", 4),
        ],
    },
    "freelance_pay": {
        "label": "Freelance payment escrow",
        "brief_en": "An escrow-style payment platform for Egyptian freelancers: milestones, dispute windows and tax receipts.",
        "stakeholders": ["freelancer", "client", "accountant"],
        "ar_interview": (
            "هبة: بشتغل ديزاين مع عملاء برّه والتحويل بيضيع وسط. محتاج escrow بحيث العميل يودّع قبل ما أبدأ، "
            "وأنا أستلم على مراحل milestones. لو حصل خلاف، في window نقدر نتفاوض فيه. والضرايب… محتاجة "
            "إيصالات مرتبة في آخر السنة بدل ما أدور على كل حاجة."
        ),
        "codeswitch_meeting": (
            "Finance rules: الـ dispute window هو 14 يوم من الـ milestone delivery، وبعدها الـ escrow بيتحرر "
            "تلقائيًا. الـ tax receipt لازم يتولد PDF فيه الـ tax ID بتاع الفري لانسر."
        ),
        "requirements": [
            ("The system shall hold client funds in escrow before work starts.", "functional", "Must"),
            ("The system shall release milestone funds 14 days after delivery unless disputed.", "functional", "Must"),
            ("The system shall generate a PDF tax receipt containing the freelancer's tax ID per payout.", "functional", "Must"),
            ("The system shall allow either party to open a dispute within the window.", "functional", "Should"),
            ("The system shall show both parties the same milestone status at all times.", "functional", "Should"),
            ("Payout data shall be resident on servers located in Egypt.", "constraint", "Must"),
        ],
        "weak_reqs": [
            ("The system shall process payments reliably.", 80, "vague 'reliably' — needs quantification"),
            ("Disputes shall be resolved fairly.", 92, "subjective 'fairly' — outside system scope"),
            ("The platform shall support many currencies.", 70, "unbounded 'many' — list required"),
        ],
        "conflict_pair": (
            "The system shall auto-release escrowed funds 14 days after delivery.",
            "The system shall keep funds frozen until a human reviews any dispute, however long it takes.",
            "contradiction", "scale", "deterministic release clock vs unbounded review time",
        ),
        "exec": {
            "given": "A milestone was delivered 13 days ago; the client opened a dispute.",
            "when": "The 14-day clock elapses during the open dispute.",
            "then_defined": "The release is paused while the dispute is open.",
            "then_undefined": "What happens to the clock if the dispute is withdrawn 20 days later.",
        },
        "question_gold": [
            ("لو العميل فتح dispute واتسحب، الـ 14 يوم بيبدأوا من الأول؟", 5),
            ("الإيصال الضريبي محتاج يطلع بالعربي ولا بالإنجليزي ولا الاتنين؟", 3),
        ],
    },
}

# ── Category generators ───────────────────────────────────────

def gold_requirements(d):
    return {
        "type": "requirements_json",
        "payload": {
            "requirements": [
                {"refId": f"REQ-{i+1:02d}", "text": t, "type": ty, "priority": p}
                for i, (t, ty, p) in enumerate(d["requirements"])
            ]
        },
    }

def gold_question_utility(d):
    qs = [
        {
            "text": q,
            "askCost": c,
            "utility": {
                "infoGain": min(5, c + 1),
                "impact": 4,
                "uncertainty": 4,
                "risk": min(5, c + 1),
                "askCost": c,
                "utility": (min(5, c + 1) * 4 * 4 * min(5, c + 1)) / c,
            },
        }
        for q, c in d["question_gold"]
    ]
    return {"type": "question_utility_json", "payload": {"questions": qs}}

def gold_conflict(d):
    a, b, kind, tax, why = d["conflict_pair"]
    return {
        "type": "conflict_pairs_json",
        "payload": {
            "conflicts": [
                {
                    "reqARef": "REQ-01",
                    "reqBRef": "REQ-02",
                    "kind": kind,
                    "taxonomy": tax,
                    "why": why,
                    "implications_only": True,
                }
            ]
        },
    }

def gold_ambiguity(d):
    return {
        "type": "ambiguity_scores_json",
        "payload": {
            "assessments": [
                {"refId": f"REQ-{i+1:02d}", "text": t, "score": s, "issue": note, "expected_action": "rewrite"}
                for i, (t, s, note) in enumerate(d["weak_reqs"])
            ]
        },
    }

def gold_exec(d):
    return {
        "type": "exec_scenarios_json",
        "payload": {
            "scenarios": [
                {"given": d["exec"]["given"], "when": d["exec"]["when"], "then": d["exec"]["then_defined"], "resolution": "defined"},
                {"given": d["exec"]["given"], "when": d["exec"]["when"], "then": d["exec"]["then_undefined"], "resolution": "undefined",
                 "expect": "UNDEFINED recorded as a discovery with a clarifying question"},
            ]
        },
    }

def gold_trace_matrix(d):
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(["requirement_ref", "evidence_code", "grounding_strength"])
    for i, (t, ty, p) in enumerate(d["requirements"][:4]):
        w.writerow([f"REQ-{i+1:02d}", "E1", "explicit" if i % 2 == 0 else "implied"])
        w.writerow([f"REQ-{i+1:02d}", "E2", "implied"])
    return {"type": "trace_matrix_csv", "payload": buf.getvalue()}

# Evidence-mix variants: (evidence spec, language tag set, difficulty)
VARIANTS = {
    1: {
        "mix": ["ar_interview", "codeswitch_meeting"],
        "langs": ["ar-EG", "codeswitch"],
        "difficulty": "hard",
        "note": "Arabic-native + code-switch — the dialect-heavy core of arbench",
    },
    2: {
        "mix": ["doc_a", "doc_b"],
        "langs": ["en"],
        "difficulty": "medium",
        "note": "English documents only",
    },
    3: {
        "mix": ["ar_interview", "doc_b"],
        "langs": ["ar-EG", "en"],
        "difficulty": "medium",
        "note": "Mixed Arabic interview + English document",
    },
}

DOCS = {
    "doc_a": {"title": "Product one-pager", "body": "Scope: pilot with 50 users. Success: 80% of target workflows completed in-app without phone support. Constraints: launch before the semester starts; no stored card data."},
    "doc_b": {"title": "Ops constraints memo", "body": "Budget covers one engineer and one designer for 3 months. All data must stay on local hosting. Support channel is WhatsApp-first; email secondary."},
}

def make_evidence(dkey, d, mix):
    evs = []
    n = 0
    for m in mix:
        n += 1
        code = f"E{n}"
        if m == "ar_interview":
            evs.append({"code": code, "title": "Stakeholder interview (Egyptian Arabic)", "sourceType": "interview", "language": "ar-EG", "content": d["ar_interview"], "consent": True})
        elif m == "codeswitch_meeting":
            evs.append({"code": code, "title": "Weekly sync notes (code-switched)", "sourceType": "meeting", "language": "codeswitch", "content": d["codeswitch_meeting"], "consent": True})
        else:
            doc = DOCS[m]
            evs.append({"code": code, "title": doc["title"], "sourceType": "document", "language": "en", "content": doc["body"], "consent": False})
    return evs

# Category → gold builder + task framing
CATEGORIES = {
    "extraction":     {"gold": gold_requirements,  "task": "extract atomic, grounded requirements"},
    "elicitation":    {"gold": gold_question_utility, "task": "plan high-utility clarifying questions"},
    "ambiguity":      {"gold": gold_ambiguity,     "task": "score and repair ambiguous statements"},
    "conflict":       {"gold": gold_conflict,      "task": "detect and classify requirement conflicts"},
    "traceability":   {"gold": gold_trace_matrix,  "task": "build the evidence trace matrix"},
    "executability":  {"gold": gold_exec,          "task": "simulate executability and surface UNDEFINED discoveries"},
    "dialect_ar_eg":  {"gold": gold_question_utility, "task": "produce native Egyptian-Arabic interview questions"},
    "codeswitch":     {"gold": gold_requirements,  "task": "extract requirements preserving code-switched language"},
}

count = 0
manifest = []
for cat, cfg in CATEGORIES.items():
    for dkey, d in DOMAINS.items():
        for vi, vspec in VARIANTS.items():
            count += 1
            sid = f"arb2-{cat}-{dkey}-v{vi}"
            gold = cfg["gold"](d)
            scenario = {
                "id": sid,
                "category": cat,
                "task": cfg["task"],
                "domain": d["label"],
                "languages": vspec["langs"],
                "difficulty": vspec["difficulty"],
                "brief": d["brief_en"],
                "evidence": make_evidence(dkey, d, vspec["mix"]),
                "gold": gold,
                "notes": vspec["note"],
            }
            with open(os.path.join(SCEN_DIR, f"{sid}.json"), "w", encoding="utf-8") as f:
                json.dump(scenario, f, ensure_ascii=False, indent=1)
            manifest.append({
                "id": sid, "category": cat, "domain": d["label"],
                "languages": vspec["langs"], "difficulty": vspec["difficulty"],
                "gold_type": gold["type"],
            })

# ── Manifest + stats ─────────────────────────────────────────
manifest_path = os.path.join(BASE, "manifest.json")
with open(manifest_path, "w", encoding="utf-8") as f:
    json.dump({"name": "arbench-v2", "scenario_count": len(manifest), "scenarios": manifest}, f, ensure_ascii=False, indent=1)

from collections import Counter
cats = Counter(m["category"] for m in manifest)
langs = Counter(l for m in manifest for l in m["languages"])
golds = Counter(m["gold_type"] for m in manifest)

print(f"arbench-v2 built: {len(manifest)} scenarios in {SCEN_DIR}")
print("\nPer category:")
for k, v in sorted(cats.items()):
    print(f"  {k:15s} {v}")
print("\nPer language tag:")
for k, v in sorted(langs.items()):
    print(f"  {k:12s} {v}")
print("\nPer gold artifact type:")
for k, v in sorted(golds.items()):
    print(f"  {k:24s} {v}")
