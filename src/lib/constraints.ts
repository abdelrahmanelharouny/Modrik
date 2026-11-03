// Deterministic self-audit. Runtime measurements are reported separately
// from source-level checks, and unobserved properties are never marked pass.
import { db } from "@/lib/db";
import { isEncryptedSecret } from "@/lib/security/secret-box.mjs";
import { DESIGN_TOKENS, DESIGN_SOURCE_CHECKS, DESIGN_TOKEN_SOURCE_SHA256 } from "@/lib/generated/design-tokens";
import {
  auditConsentCoverage,
  auditCredentialEncryption,
  auditDataAvailability,
  auditSourceCheck,
  nearestRankPercentile,
} from "@/lib/audit/metrics.mjs";

export { DESIGN_TOKENS };

export const CONTRAST_PAIRS: {
  fg: keyof typeof DESIGN_TOKENS | "coral/destructive";
  bg: keyof typeof DESIGN_TOKENS;
  usage: string;
  level: "AA" | "AAA";
}[] = [
  { fg: "foreground", bg: "background", usage: "body text", level: "AAA" },
  { fg: "foreground", bg: "card", usage: "panel text", level: "AAA" },
  { fg: "primaryForeground", bg: "primary", usage: "primary buttons", level: "AA" },
  { fg: "secondaryForeground", bg: "secondary", usage: "secondary chips", level: "AA" },
  { fg: "mutedForeground", bg: "card", usage: "muted labels", level: "AA" },
  { fg: "accentForeground", bg: "accent", usage: "accent chips", level: "AA" },
  { fg: "verify", bg: "card", usage: "verify status text", level: "AA" },
  { fg: "signal", bg: "card", usage: "signal status text", level: "AA" },
  { fg: "coral/destructive", bg: "card", usage: "destructive text", level: "AA" },
];

export function contrastRatio(fgHex: string, bgHex: string): number {
  const valid = (value: string) => /^#[0-9a-f]{6}$/i.test(value);
  if (!valid(fgHex) || !valid(bgHex)) {
    throw new TypeError("Contrast colors must be six-digit hex values");
  }
  const luminance = (hex: string) => {
    const values = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
    const linear = values.map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    );
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const a = luminance(fgHex);
  const b = luminance(bgHex);
  return +(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2));
}

export interface AuditCheck {
  id: string;
  pack: "wcag22" | "performance" | "pdpl";
  label: string;
  status: "pass" | "warn" | "fail" | "not-assessed";
  detail: string;
  value?: string;
}

export interface SelfAudit {
  checks: AuditCheck[];
  summary: { pass: number; warn: number; fail: number; notAssessed: number };
  generatedAt: string;
  designTokenSourceSha256: string;
}

export async function runSelfAudit(): Promise<SelfAudit> {
  const checks: AuditCheck[] = [];

  // ── WCAG contrast is computed from CSS-generated source tokens ──
  for (const pair of CONTRAST_PAIRS) {
    const fg = pair.fg === "coral/destructive"
      ? DESIGN_TOKENS.destructive
      : DESIGN_TOKENS[pair.fg];
    const bg = DESIGN_TOKENS[pair.bg];

    if (!fg || !bg) {
      checks.push({
        id: "wcag-contrast-" + pair.fg + "-" + pair.bg,
        pack: "wcag22",
        label: "Contrast " + pair.fg + " on " + pair.bg + " (" + pair.usage + ")",
        status: "fail",
        detail: "The foreground or background token was not extracted from the actual root CSS token block.",
      });
      continue;
    }

    const ratio = contrastRatio(fg, bg);
    const threshold = pair.level === "AAA" ? 7 : 4.5;
    checks.push({
      id: "wcag-contrast-" + pair.fg + "-" + pair.bg,
      pack: "wcag22",
      label: "Contrast " + pair.fg + " on " + pair.bg + " (" + pair.usage + ")",
      status: ratio >= threshold ? "pass" : ratio >= 4.5 ? "warn" : "fail",
      detail: ratio >= threshold
        ? ratio + ":1 meets " + pair.level + " threshold " + threshold + ":1"
        : ratio >= 4.5
          ? ratio + ":1 meets AA but misses " + pair.level + " threshold " + threshold + ":1"
          : ratio + ":1 fails the WCAG AA 4.5:1 text threshold",
      value: ratio + ":1",
    });
  }

  const focus = auditSourceCheck(
    DESIGN_SOURCE_CHECKS.focusVisible,
    "The actual global stylesheet includes an explicit 2px :focus-visible outline.",
    "The actual global stylesheet is missing the explicit focus-visible outline rule."
  );
  checks.push({
    id: "wcag-focus-visible",
    pack: "wcag22",
    label: "Keyboard focus visibility",
    ...focus,
  });

  const motion = auditSourceCheck(
    DESIGN_SOURCE_CHECKS.reducedMotion,
    "The actual stylesheet disables/reduces animation and transition motion under prefers-reduced-motion.",
    "The actual stylesheet is missing the reduced-motion media query or its animation override."
  );
  checks.push({
    id: "wcag-motion",
    pack: "wcag22",
    label: "Reduced-motion preference",
    ...motion,
  });

  const language = auditSourceCheck(
    DESIGN_SOURCE_CHECKS.clientLocaleSync,
    "The language provider updates document lang and dir when the selected language changes.",
    "The language provider does not update both document lang and dir."
  );
  checks.push({
    id: "wcag-lang-dir",
    pack: "wcag22",
    label: "Runtime language and RTL direction",
    ...language,
  });
  checks.push({
    id: "wcag-server-locale",
    pack: "wcag22",
    label: "Server-rendered locale",
    status: DESIGN_SOURCE_CHECKS.serverLocaleNegotiation ? "pass" : "warn",
    detail: DESIGN_SOURCE_CHECKS.serverLocaleNegotiation
      ? "The initial HTML language is negotiated before rendering."
      : "Arabic locale is applied on the client after hydration; the initial server-rendered HTML remains lang=en and may briefly be LTR.",
  });

  // ── Performance is not measured until there are real completed runs ──
  const runs = await db.pipelineRun.findMany({
    where: { status: "done", latencyMs: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { latencyMs: true },
  });
  const latencies = runs.map((run) => run.latencyMs).filter((value): value is number => value !== null);
  const p95 = nearestRankPercentile(latencies, 0.95);
  const latencyAudit = auditDataAvailability(
    latencies.length,
    p95 ?? Number.NaN,
    90_000,
    "max"
  );
  checks.push({
    id: "perf-stage-p95",
    pack: "performance",
    label: "Stage-agent latency p95",
    status: latencyAudit.status,
    detail: p95 === null
      ? "No completed stage-run latency observations are available yet."
      : "Nearest-rank p95 over " + latencies.length + " completed runs: " + (p95 / 1000).toFixed(1) + "s (budget 90s).",
    value: p95 === null ? undefined : (p95 / 1000).toFixed(1) + "s",
  });

  const costliest = await db.pipelineRun.findFirst({
    where: { estCostUsd: { not: null } },
    orderBy: { estCostUsd: "desc" },
    select: { estCostUsd: true },
  });
  const costAudit = auditDataAvailability(
    costliest ? 1 : 0,
    costliest?.estCostUsd ?? Number.NaN,
    0.05,
    "max"
  );
  checks.push({
    id: "perf-run-cost",
    pack: "performance",
    label: "Per-run estimated cost",
    status: costAudit.status,
    detail: costliest
      ? "Highest recorded heuristic cost estimate is $" + (costliest.estCostUsd ?? 0).toFixed(4) + " (budget $0.05). Token cost is estimated, not provider-billed usage."
      : "No run-cost observations are available yet.",
    value: costliest ? "$" + (costliest.estCostUsd ?? 0).toFixed(4) : undefined,
  });

  checks.push({
    id: "perf-degradation",
    pack: "performance",
    label: "Graceful degradation under provider failure",
    status: "not-assessed",
    detail: "Transient retry classification and runtime response validation are implemented; production fault-injection and multi-provider failover have not been measured by this runtime audit.",
  });

  // ── Data-protection signals are explicit and non-legal ──
  const [evidenceCount, consented] = await Promise.all([
    db.evidence.count(),
    db.evidence.count({ where: { consent: true, origin: { not: "synthetic" } } }),
  ]);
  const consentAudit = auditConsentCoverage(evidenceCount, consented);
  checks.push({
    id: "pdpl-ai-processing-permission",
    pack: "pdpl",
    label: "Evidence AI-processing permission",
    status: consentAudit.status,
    detail: consentAudit.detail,
    value: consentAudit.ratio === null ? undefined : Math.round(consentAudit.ratio * 100) + "%",
  });

  // Project deletion cascades are wired, but this must not be mistaken for
  // a tested legal retention/erasure programme. In particular, the journal
  // currently cascades with the project and no immutable archive is claimed.
  checks.push({
    id: "pdpl-erasure",
    pack: "pdpl",
    label: "Retention and erasure verification",
    status: "not-assessed",
    detail: "Project deletion and database cascades exist, but retention policy, backup erasure, legal holds and preservation/export of decision history have not been independently verified.",
  });

  const integrationRows = await db.integration.findMany({
    select: { config: true },
  });
  const credentials = integrationRows.map((row) => {
    try {
      const config = JSON.parse(row.config) as Record<string, unknown>;
      return { encrypted: isEncryptedSecret(config.token) };
    } catch {
      return { encrypted: false };
    }
  });
  const credentialAudit = auditCredentialEncryption(credentials);
  checks.push({
    id: "pdpl-credentials",
    pack: "pdpl",
    label: "Integration credential encryption at rest",
    status: credentialAudit.status,
    detail: credentialAudit.detail,
    value: credentialAudit.total
      ? credentialAudit.encrypted + "/" + credentialAudit.total + " encrypted"
      : undefined,
  });

  checks.push({
    id: "pdpl-residency",
    pack: "pdpl",
    label: "External model data residency",
    status: "not-assessed",
    detail: "A local-provider option exists, but provider endpoint ownership, runtime network path, jurisdiction, contractual safeguards and backup locations are not established by this source check.",
  });

  const summary = {
    pass: checks.filter((check) => check.status === "pass").length,
    warn: checks.filter((check) => check.status === "warn").length,
    fail: checks.filter((check) => check.status === "fail").length,
    notAssessed: checks.filter((check) => check.status === "not-assessed").length,
  };
  return {
    checks,
    summary,
    generatedAt: new Date().toISOString(),
    designTokenSourceSha256: DESIGN_TOKEN_SOURCE_SHA256,
  };
}
