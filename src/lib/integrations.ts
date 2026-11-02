// ─────────────────────────────────────────────────────────────
// Modrik (مدرك) — TRACKER INTEGRATIONS (open requirement 2)
//
// GitHub Issues + Jira bidirectional sync adapters.
//
//  PUSH:  approved requirements → tracker issues (labels carry
//         MoSCoW + verification state; bodies carry evidence
//         citations + acceptance criteria). SyncMap rows keep the
//         bidirectional trace (localLabel ↔ externalKey).
//  PULL:  tracker issues → candidate records shown to the human,
//         who decides what becomes evidence or requirements
//         (human-in-the-loop: nothing imports itself).
//  SYNC-BACK: local edits re-push a comment/update to the mapped
//         external issue when the requirement text changed.
//
// Credentials arrive at RUNTIME through the Integration table or
// environment fallbacks — never hardcoded, never returned in full.
// ─────────────────────────────────────────────────────────────
import { db } from "@/lib/db";
import { logDecision } from "@/lib/journal";
import { decryptSecret, encryptSecret } from "@/lib/security/secret-box.mjs";
import { buildJiraUrl, validateJiraBaseUrl } from "@/lib/security/jira-url.mjs";
import { makeSyncKey, makeSyncMarker } from "@/lib/integrations/sync-key.mjs";


interface SyncReservationInput {
  projectId: string;
  kind: "github" | "jira";
  localItemId: string;
  localLabel: string;
  title: string;
  requirementId?: string;
  storyId?: string;
}

async function acquireSyncReservation(input: SyncReservationInput): Promise<{ id: string; syncKey: string; acquired: boolean }> {
  const syncKey = makeSyncKey(input.projectId, input.kind, input.localItemId);
  let row = await db.syncMap.findUnique({ where: { idempotencyKey: syncKey }, select: { id: true, direction: true } });

  if (!row) {
    try {
      const created = await db.syncMap.create({
        data: {
          projectId: input.projectId,
          kind: input.kind,
          direction: "pending",
          requirementId: input.requirementId,
          storyId: input.storyId,
          localLabel: input.localLabel,
          externalKey: "PENDING",
          externalUrl: "",
          title: input.title.slice(0, 200),
          idempotencyKey: syncKey,
        },
        select: { id: true, direction: true },
      });
      row = created;
    } catch (error) {
      // Two requests may race to create the same reservation. The unique
      // idempotency key elects one row; the loser reads the winner's row.
      row = await db.syncMap.findUnique({ where: { idempotencyKey: syncKey }, select: { id: true, direction: true } });
      if (!row) throw error;
    }
  }

  if (row.direction === "pushed") return { id: row.id, syncKey, acquired: false };
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + 2 * 60 * 1000);
  const claimed = await db.syncMap.updateMany({
    where: {
      id: row.id,
      direction: { not: "pushed" },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
    },
    data: {
      direction: "creating",
      leaseExpiresAt,
      externalKey: "PENDING",
      externalUrl: "",
      syncedAt: now,
    },
  });
  return { id: row.id, syncKey, acquired: claimed.count === 1 };
}

async function completeSyncReservation(
  reservationId: string,
  externalKey: string,
  externalUrl: string,
  title: string
): Promise<void> {
  await db.syncMap.update({
    where: { id: reservationId },
    data: {
      direction: "pushed",
      externalKey,
      externalUrl,
      title: title.slice(0, 200),
      leaseExpiresAt: null,
      syncedAt: new Date(),
    },
  });
}

async function failSyncReservation(reservationId: string): Promise<void> {
  try {
    await db.syncMap.update({
      where: { id: reservationId },
      data: { direction: "failed", leaseExpiresAt: null },
    });
  } catch {
    // Keep the original tracker error; the lease eventually expires if even
    // this recovery write cannot complete.
  }
}

// ── Credential resolution ────────────────────────────────────

export interface GithubConfig {
  token: string;
  owner: string;
  repo: string;
}

export interface JiraConfig {
  baseUrl: string;
  email: string;
  token: string;
  projectKey: string;
}

async function loadConfig(projectId: string, kind: "github" | "jira"): Promise<GithubConfig | JiraConfig | null> {
  const row = await db.integration.findFirst({ where: { projectId, kind }, orderBy: { createdAt: "desc" } });
  if (row) {
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(row.config) as Record<string, unknown>;
    } catch {
      throw new Error(`Saved ${kind} configuration is corrupt. Re-save the integration before retrying.`);
    }
    // Do not silently fall back to deployment credentials when ciphertext is
    // corrupt or the encryption key is wrong; that would target another account.
    if (typeof config.token === "string") config.token = decryptSecret(config.token);
    if (kind === "github") {
      const owner = String(config.owner ?? "");
      const repo = String(config.repo ?? "");
      if (!/^[A-Za-z0-9-]{1,39}$/.test(owner) ||
          !/^[A-Za-z0-9_.-]{1,100}$/.test(repo) || repo === "." || repo === "..") {
        throw new Error("Saved GitHub owner/repository values are invalid; re-save the integration.");
      }
    } else {
      if (typeof config.baseUrl !== "string") throw new Error("Saved Jira base URL is missing");
      validateJiraBaseUrl(config.baseUrl);
    }
    return config as unknown as GithubConfig | JiraConfig;
  }
  // Environment fallback (deployment-level credentials, university lab / demo)
  if (kind === "github" && process.env.RP_GITHUB_TOKEN && process.env.RP_GITHUB_OWNER && process.env.RP_GITHUB_REPO) {
    return { token: process.env.RP_GITHUB_TOKEN, owner: process.env.RP_GITHUB_OWNER, repo: process.env.RP_GITHUB_REPO };
  }
  if (
    kind === "jira" &&
    process.env.RP_JIRA_BASE_URL &&
    process.env.RP_JIRA_EMAIL &&
    process.env.RP_JIRA_TOKEN &&
    process.env.RP_JIRA_PROJECT_KEY
  ) {
    return {
      baseUrl: process.env.RP_JIRA_BASE_URL,
      email: process.env.RP_JIRA_EMAIL,
      token: process.env.RP_JIRA_TOKEN,
      projectKey: process.env.RP_JIRA_PROJECT_KEY,
    };
  }
  return null;
}

function mask(v: string): string {
  if (!v) return "";
  return v.length <= 6 ? "••••" : `${v.slice(0, 3)}••••${v.slice(-3)}`;
}

export async function maskedStatus(projectId: string) {
  const gh = await loadConfig(projectId, "github");
  const jr = await loadConfig(projectId, "jira");
  return {
    github: gh
      ? { configured: true, owner: (gh as GithubConfig).owner, repo: (gh as GithubConfig).repo, token: mask((gh as GithubConfig).token) }
      : { configured: false },
    jira: jr
      ? {
          configured: true,
          baseUrl: (jr as JiraConfig).baseUrl,
          projectKey: (jr as JiraConfig).projectKey,
          email: mask((jr as JiraConfig).email),
          token: mask((jr as JiraConfig).token),
        }
      : { configured: false },
  };
}

// ── GitHub adapter ───────────────────────────────────────────

const GH_API = "https://api.github.com";

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function requirementBody(r: {
  refId: string;
  text: string;
  type: string;
  priority: string;
  verifyStatus: string;
  confidence: number;
  ambiguity: number;
  links: { evidenceCode: string }[];
}): string {
  const lines = [
    `**Requirement:** ${r.text}`,
    "",
    `| Attribute | Value |`,
    `| --- | --- |`,
    `| Ref | ${r.refId} |`,
    `| Type | ${r.type} |`,
    `| MoSCoW | ${r.priority} |`,
    `| Verification | ${r.verifyStatus} |`,
    `| Confidence | ${r.confidence >= 0 ? r.confidence : "n/a"} |`,
    `| Ambiguity | ${r.ambiguity >= 0 ? r.ambiguity : "not assessed"} |`,
    "",
    r.links.length ? `**Grounded in evidence:** ${r.links.map((l) => l.evidenceCode).join(", ")}` : "**Grounded in evidence:** none — needs grounding",
    "",
    "---",
    "_Generated by Modrik (مدرك) — evidence-based, human-in-the-loop requirements engineering._",
  ];
  return lines.join("\n");
}

export async function githubPush(projectId: string): Promise<{ pushed: { refId: string; issue: number; url: string }[]; skipped: number }> {
  const cfg = (await loadConfig(projectId, "github")) as GithubConfig | null;
  if (!cfg) throw new Error("GitHub not configured — save a token, owner and repo first");
  const reqs = await db.requirement.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
    include: { links: true, syncMaps: { where: { kind: "github" } } },
  });
  const pushed: { refId: string; issue: number; url: string }[] = [];
  let skipped = 0;

  for (const requirement of reqs) {
    if (requirement.syncMaps.some((map) => map.direction === "pushed")) {
      skipped += 1;
      continue;
    }

    const reservation = await acquireSyncReservation({
      projectId,
      kind: "github",
      localItemId: requirement.id,
      localLabel: requirement.refId,
      requirementId: requirement.id,
      title: requirement.text,
    });
    if (!reservation.acquired) {
      skipped += 1;
      continue;
    }

    const marker = makeSyncMarker(reservation.syncKey);
    try {
      // A prior request may have created the issue but lost its response or
      // failed before persisting SyncMap. Search before creating another issue.
      const query = new URLSearchParams({
        q: `repo:${cfg.owner}/${cfg.repo} is:issue in:body ${marker}`,
        per_page: "5",
      });
      const searchResponse = await fetch(`${GH_API}/search/issues?${query.toString()}`, {
        headers: ghHeaders(cfg.token),
        signal: AbortSignal.timeout(30_000),
      });
      if (!searchResponse.ok) {
        throw new Error(`GitHub idempotency lookup failed (HTTP ${searchResponse.status}): ${(await searchResponse.text()).slice(0, 200)}`);
      }
      const searchData = await searchResponse.json() as {
        items?: { number: number; html_url: string; body?: string | null }[];
      };
      let issue = searchData.items?.find((item) => item.body?.includes(marker));

      if (!issue) {
        const response = await fetch(`${GH_API}/repos/${cfg.owner}/${cfg.repo}/issues`, {
          method: "POST",
          headers: ghHeaders(cfg.token),
          body: JSON.stringify({
            title: `[${requirement.refId}] ${requirement.text.slice(0, 120)}`,
            body: `${requirementBody(requirement)}\n\nModrik sync reference: ${marker}`,
            labels: [
              `moscow:${requirement.priority.toLowerCase()}`,
              `verify:${requirement.verifyStatus}`,
              `type:${requirement.type}`,
              "modrik",
            ],
          }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) {
          throw new Error(`GitHub push failed for ${requirement.refId} (HTTP ${response.status}): ${(await response.text()).slice(0, 200)}`);
        }
        issue = await response.json() as { number: number; html_url: string; body?: string | null };
      }

      await completeSyncReservation(reservation.id, String(issue.number), issue.html_url, requirement.text);
      pushed.push({ refId: requirement.refId, issue: issue.number, url: issue.html_url });
    } catch (error) {
      await failSyncReservation(reservation.id);
      throw error;
    }
  }

  await logDecision(projectId, "LIFECYCLE", "system", "github_push", `Pushed/recovered ${pushed.length} requirement(s) to GitHub Issues (${cfg.owner}/${cfg.repo}); ${skipped} already mapped or currently claimed.`);
  return { pushed, skipped };
}

export async function githubPull(projectId: string, limit = 20): Promise<{ issues: { key: string; title: string; state: string; url: string; body: string }[] }> {
  const cfg = (await loadConfig(projectId, "github")) as GithubConfig | null;
  if (!cfg) throw new Error("GitHub not configured — save a token, owner and repo first");
  const res = await fetch(`${GH_API}/repos/${cfg.owner}/${cfg.repo}/issues?state=open&per_page=${limit}`, {
    headers: ghHeaders(cfg.token),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`GitHub pull failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const issues = (await res.json()) as { number: number; title: string; state: string; html_url: string; body: string | null; pull_request?: unknown }[];
  const rows = issues
    .filter((i) => !i.pull_request) // PRs are not requirement candidates
    .map((i) => ({ key: `#${i.number}`, title: i.title, state: i.state, url: i.html_url, body: (i.body ?? "").slice(0, 2000) }));
  await logDecision(projectId, "LIFECYCLE", "system", "github_pull", `Pulled ${rows.length} open issue(s) from GitHub for human review.`);
  return { issues: rows };
}

// ── Jira adapter (Cloud REST v3) ─────────────────────────────

function jiraAuth(cfg: JiraConfig): string {
  return Buffer.from(`${cfg.email}:${cfg.token}`).toString("base64");
}

function jiraDescription(r: { refId: string; text: string; priority: string; verifyStatus: string; links: { evidenceCode: string }[]; acceptance?: string }): object {
  const content: object[] = [
    { type: "paragraph", content: [{ type: "text", text: `Requirement: ${r.text}` }] },
    { type: "paragraph", content: [{ type: "text", text: `Ref: ${r.refId} · MoSCoW: ${r.priority} · Verification: ${r.verifyStatus}` }] },
  ];
  if (r.links.length) {
    content.push({ type: "paragraph", content: [{ type: "text", text: `Evidence: ${r.links.map((l) => l.evidenceCode).join(", ")}` }] });
  }
  if (r.acceptance) {
    for (const line of r.acceptance.split("\n").filter(Boolean).slice(0, 8)) {
      content.push({ type: "paragraph", content: [{ type: "text", text: `• ${line}` }] });
    }
  }
  content.push({ type: "paragraph", content: [{ type: "text", text: "Generated by Modrik (مدرك)." }] });
  return { type: "doc", version: 1, content };
}

export async function jiraPush(projectId: string): Promise<{ pushed: { label: string; key: string; url: string }[]; skipped: number }> {
  const cfg = (await loadConfig(projectId, "jira")) as JiraConfig | null;
  if (!cfg) throw new Error("Jira not configured — save baseUrl, email, token and projectKey first");
  const stories = await db.userStory.findMany({
    where: { projectId },
    include: {
      requirement: { include: { links: true } },
      syncMaps: { where: { kind: "jira" } },
    },
  });
  const pushed: { label: string; key: string; url: string }[] = [];
  let skipped = 0;

  for (const story of stories) {
    // The map belongs to the story, not its parent requirement: one
    // requirement may legitimately produce several independently tracked stories.
    if (story.syncMaps.some((map) => map.direction === "pushed")) {
      skipped += 1;
      continue;
    }

    const reservation = await acquireSyncReservation({
      projectId,
      kind: "jira",
      localItemId: story.id,
      localLabel: story.refId,
      storyId: story.id,
      requirementId: story.requirement.id,
      title: story.title,
    });
    if (!reservation.acquired) {
      skipped += 1;
      continue;
    }

    const marker = makeSyncMarker(reservation.syncKey);
    try {
      const searchResponse = await fetch(buildJiraUrl(cfg.baseUrl, "rest/api/3/search"), {
        method: "POST",
        headers: {
          Authorization: `Basic ${jiraAuth(cfg)}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jql: `project = ${cfg.projectKey} AND labels = "${marker}" ORDER BY created DESC`,
          maxResults: 5,
          fields: ["summary"],
        }),
        signal: AbortSignal.timeout(30_000),
        redirect: "manual",
      });
      if (!searchResponse.ok) {
        throw new Error(`Jira idempotency lookup failed (HTTP ${searchResponse.status}): ${(await searchResponse.text()).slice(0, 200)}`);
      }
      const searchData = await searchResponse.json() as { issues?: { key: string }[] };
      let issueKey = searchData.issues?.[0]?.key;

      if (!issueKey) {
        const response = await fetch(buildJiraUrl(cfg.baseUrl, "rest/api/3/issue"), {
          method: "POST",
          headers: {
            Authorization: `Basic ${jiraAuth(cfg)}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fields: {
              project: { key: cfg.projectKey },
              summary: `[${story.refId}] ${story.title.slice(0, 160)}`,
              issuetype: { name: "Task" },
              description: jiraDescription({
                refId: story.requirement.refId,
                text: story.requirement.text,
                priority: story.requirement.priority,
                verifyStatus: story.requirement.verifyStatus,
                links: story.requirement.links,
                acceptance: story.acceptance,
              }),
              labels: [
                `moscow-${story.requirement.priority.toLowerCase()}`,
                "modrik",
                marker,
              ],
            },
          }),
          signal: AbortSignal.timeout(30_000),
          redirect: "manual",
        });
        if (!response.ok) {
          throw new Error(`Jira push failed for ${story.refId} (HTTP ${response.status}): ${(await response.text()).slice(0, 200)}`);
        }
        const created = await response.json() as { key: string };
        issueKey = created.key;
      }

      const url = buildJiraUrl(cfg.baseUrl, `browse/${encodeURIComponent(issueKey)}`);
      await completeSyncReservation(reservation.id, issueKey, url, story.title);
      pushed.push({ label: story.refId, key: issueKey, url });
    } catch (error) {
      await failSyncReservation(reservation.id);
      throw error;
    }
  }

  await logDecision(projectId, "LIFECYCLE", "system", "jira_push", `Pushed/recovered ${pushed.length} story(s) to Jira (${cfg.projectKey}); ${skipped} already mapped or currently claimed.`);
  return { pushed, skipped };
}

export async function jiraPull(projectId: string, limit = 20): Promise<{ issues: { key: string; title: string; state: string; url: string; body: string }[] }> {
  const cfg = (await loadConfig(projectId, "jira")) as JiraConfig | null;
  if (!cfg) throw new Error("Jira not configured — save baseUrl, email, token and projectKey first");
  const jql = `project = ${cfg.projectKey} ORDER BY created DESC`;
  const res = await fetch(buildJiraUrl(cfg.baseUrl, `rest/api/3/search?maxResults=${encodeURIComponent(String(limit))}`), {
    method: "POST",
    headers: {
      Authorization: `Basic ${jiraAuth(cfg)}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jql, fields: ["summary", "status", "description"] }),
    signal: AbortSignal.timeout(30_000),
    redirect: "manual",
  });
  if (!res.ok) {
    throw new Error(`Jira pull failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    issues: { key: string; fields: { summary: string; status: { name: string }; description?: object } }[];
  };
  const rows = (data.issues ?? []).map((i) => ({
    key: i.key,
    title: i.fields.summary,
    state: i.fields.status?.name ?? "unknown",
    url: buildJiraUrl(cfg.baseUrl, `browse/${encodeURIComponent(i.key)}`),
    body: JSON.stringify(i.fields.description ?? {}).slice(0, 2000),
  }));
  await logDecision(projectId, "LIFECYCLE", "system", "jira_pull", `Pulled ${rows.length} issue(s) from Jira (${cfg.projectKey}) for human review.`);
  return { issues: rows };
}

// ── Connection tests (used by the config dialog) ─────────────

export async function testConnection(projectId: string, kind: "github" | "jira"): Promise<{ ok: boolean; detail: string }> {
  const cfg = (await loadConfig(projectId, kind));
  if (!cfg) return { ok: false, detail: "Not configured" };
  try {
    if (kind === "github") {
      const c = cfg as GithubConfig;
      const res = await fetch(`${GH_API}/repos/${c.owner}/${c.repo}`, { headers: ghHeaders(c.token), signal: AbortSignal.timeout(20_000) });
      return res.ok
        ? { ok: true, detail: `${c.owner}/${c.repo} reachable` }
        : { ok: false, detail: `HTTP ${res.status} — ${(await res.text()).slice(0, 160)}` };
    }
    const c = cfg as JiraConfig;
    const res = await fetch(buildJiraUrl(c.baseUrl, "rest/api/3/myself"), {
      headers: { Authorization: `Basic ${jiraAuth(c)}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
      redirect: "manual",
    });
    return res.ok
      ? { ok: true, detail: `${c.projectKey} at ${c.baseUrl} reachable` }
      : { ok: false, detail: `HTTP ${res.status} — ${(await res.text()).slice(0, 160)}` };
  } catch (err) {
    return { ok: false, detail: String(err instanceof Error ? err.message : err).slice(0, 160) };
  }
}

// ── Save config (server-side only; response is masked) ───────

export async function saveConfig(projectId: string, kind: "github" | "jira", config: Record<string, string>) {
  const clean =
    kind === "github"
      ? { token: String(config.token ?? "").trim(), owner: String(config.owner ?? "").trim(), repo: String(config.repo ?? "").trim() }
      : {
          baseUrl: String(config.baseUrl ?? "").trim(),
          email: String(config.email ?? "").trim(),
          token: String(config.token ?? "").trim(),
          projectKey: String(config.projectKey ?? "").trim().toUpperCase(),
        };

  if (kind === "github") {
    const github = clean as GithubConfig;
    if (!github.token || !/^[A-Za-z0-9-]{1,39}$/.test(github.owner) ||
        !/^[A-Za-z0-9_.-]{1,100}$/.test(github.repo) || github.repo === "." || github.repo === "..") {
      throw new Error("GitHub configuration requires a token and valid owner/repository names");
    }
  } else {
    const jira = clean as JiraConfig;
    validateJiraBaseUrl(jira.baseUrl);
    if (!jira.email || !jira.token || !/^[A-Z][A-Z0-9_]{0,9}$/.test(jira.projectKey)) {
      throw new Error("Jira configuration requires an email, token and valid project key");
    }
  }

  const encrypted = { ...clean, token: clean.token ? encryptSecret(clean.token) : "" };
  await db.integration.create({ data: { projectId, kind, config: JSON.stringify(encrypted) } });
  await logDecision(projectId, "LIFECYCLE", "human", "integration_config", `${kind} credentials saved (masked: ${kind === "github" ? `${clean.owner && (clean as GithubConfig).owner}/${(clean as GithubConfig).repo}` : (clean as JiraConfig).projectKey}).`);
  return maskedStatus(projectId);
}

export async function listSyncMaps(projectId: string) {
  const rows = await db.syncMap.findMany({ where: { projectId }, orderBy: { syncedAt: "desc" }, take: 50 });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    direction: r.direction,
    localLabel: r.localLabel,
    externalKey: r.externalKey,
    externalUrl: r.externalUrl,
    title: r.title,
    syncedAt: r.syncedAt,
  }));
}
