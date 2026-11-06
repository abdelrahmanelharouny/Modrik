"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n";
import { ArrowLeft, Copy, Link2, MailPlus, RefreshCw, ShieldCheck, Users, X } from "lucide-react";

type Invitation = {
  id: string;
  email: string;
  role: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

const roles = ["viewer", "reviewer", "approver", "engineer", "admin"];

export function MembersManager() {
  const { lang, toggle } = useLang();
  const ar = lang === "ar";
  const tx = (en: string, arabic: string) => ar ? arabic : en;
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [inviteUrl, setInviteUrl] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/invitations", { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(response.status === 403 ? tx("Only organization owners and administrators can manage invitations.","يمكن لمالكي المؤسسة والمسؤولين فقط إدارة الدعوات.") : payload.error || tx("Unable to load invitations","تعذر تحميل الدعوات"));
      setInvitations(payload.invitations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : tx("Unable to load invitations","تعذر تحميل الدعوات"));
    } finally {
      setLoading(false);
    }
  }, [ar]);

  useEffect(() => { void load(); }, [load]);

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    setInviteUrl("");
    try {
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, role }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to create invitation");
      setInviteUrl(payload.inviteUrl);
      setEmail("");
      setNotice(tx("Invitation created. Copy the link now; the raw token will not be shown again.","تم إنشاء الدعوة. انسخ الرابط الآن؛ لن يظهر الرمز مرة أخرى."));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create invitation");
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvitation(invitationId: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/invitations/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ invitationId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to revoke invitation");
      setNotice(tx("Invitation revoked.","تم إلغاء الدعوة."));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to revoke invitation");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setNotice(tx("Invitation link copied.","تم نسخ رابط الدعوة."));
    } catch {
      setError(tx("Clipboard access was blocked. Select and copy the invitation link manually.","تعذر الوصول إلى الحافظة. حدد رابط الدعوة وانسخه يدويًا."));
    }
  }

  return (
    <main dir={ar ? "rtl" : "ltr"} lang={ar ? "ar" : "en"} className="mx-auto min-h-screen w-full max-w-5xl px-4 py-10 text-foreground sm:px-6">
      <div className="mb-8 flex items-center justify-between gap-4">
        <button type="button" onClick={toggle} className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground">{ar ? "English" : "العربية"}</button>
        <div>
          <Link href="/" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-primary">
            <ArrowLeft className="h-4 w-4" /> {tx("Mission Control","مركز التحكم")}
          </Link>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-primary">{tx("Workspace governance","حوكمة مساحة العمل")}</p>
          <h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold"><Users className="h-7 w-7 text-primary" /> {tx("Members & invitations","الأعضاء والدعوات")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{tx("Invite collaborators with least-privilege roles, track their status, and revoke links before they are used.","ادعُ المتعاونين بأقل الصلاحيات اللازمة، وتابع حالة الدعوات، وألغِ الروابط قبل استخدامها.")}</p>
        </div>
        <button onClick={() => void load()} disabled={loading || busy} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> {tx("Refresh","تحديث")}
        </button>
      </div>

      <section className="mb-8 rounded-2xl border border-border bg-card p-5 shadow-lg sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10"><MailPlus className="h-5 w-5 text-primary" /></span>
          <div>
            <h2 className="font-semibold">{tx("Create an invitation","إنشاء دعوة")}</h2>
            <p className="text-xs text-muted-foreground">{tx("Single-use link · expires in 7 days · owner role cannot be assigned","رابط لمرة واحدة · ينتهي خلال 7 أيام · لا يمكن منح دور المالك")}</p>
          </div>
        </div>
        <form onSubmit={createInvitation} className="grid gap-3 sm:grid-cols-[1fr_190px_auto]">
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">{tx("Email address","البريد الإلكتروني")}</span>
            <input type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="collaborator@company.com" className="h-11 rounded-lg border border-border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary" />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">{tx("Organization role","دور العضو")}</span>
            <select value={role} onChange={(event) => setRole(event.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary">
              {roles.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}
            </select>
          </label>
          <button type="submit" disabled={busy || !email.trim()} className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
            <MailPlus className="h-4 w-4" /> {busy ? tx("Creating…","جارٍ الإنشاء…") : tx("Create link","إنشاء رابط")}
          </button>
        </form>
        {inviteUrl ? (
          <div className="mt-5 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><Link2 className="h-4 w-4" /> One-time invitation link</div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input readOnly value={inviteUrl} aria-label={tx("Invitation URL","رابط الدعوة")} className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-xs" />
              <button onClick={() => void copyLink()} type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-primary/40 px-3 text-sm hover:bg-primary/10"><Copy className="h-4 w-4" /> Copy link</button>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{tx("Share this through a trusted channel. Modrik does not send invitation emails in this release. The link is shown only once.","شارك الرابط عبر قناة موثوقة. لا يرسل مدرك رسائل الدعوة بالبريد في هذا الإصدار، ويُعرض الرابط مرة واحدة فقط.")}</p>
          </div>
        ) : null}
      </section>

      {error ? <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      {notice ? <p role="status" className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-primary">{notice}</p> : null}

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold">{tx("Invitation activity","سجل الدعوات")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{invitations.length} {tx("most recent invitations","أحدث الدعوات")}</p>
          </div>
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        {loading ? <p className="p-6 text-sm text-muted-foreground">{tx("Loading invitations…","جارٍ تحميل الدعوات…")}</p> : invitations.length === 0 ? (
          <div className="p-10 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">{tx("No invitations yet","لا توجد دعوات بعد")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{tx("Create a link to bring your first collaborator into this workspace.","أنشئ رابطًا لإضافة أول متعاون إلى مساحة العمل.")}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {invitations.map((invitation) => (
              <article key={invitation.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{invitation.email}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{ar ? ({ viewer: "مشاهد", reviewer: "مراجع", approver: "معتمد", engineer: "مهندس", admin: "مسؤول" }[invitation.role] ?? invitation.role) : invitation.role} · {ar ? "تاريخ الإنشاء" : "Created"} {new Date(invitation.createdAt).toLocaleDateString()} · {ar ? "ينتهي" : "Expires"} {new Date(invitation.expiresAt).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full border px-2.5 py-1 text-xs capitalize ${invitation.status === "pending" ? "border-primary/40 bg-primary/10 text-primary" : invitation.status === "accepted" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-border bg-secondary text-muted-foreground"}`}>{ar ? ({ pending: "قيد الانتظار", accepted: "مقبولة", revoked: "ملغاة", expired: "منتهية" }[invitation.status] ?? invitation.status) : invitation.status}</span>
                  {invitation.status === "pending" ? (
                    <button type="button" disabled={busy} onClick={() => void revokeInvitation(invitation.id)} aria-label={`${ar ? "إلغاء دعوة " : "Revoke invitation for "}${invitation.email}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-muted-foreground hover:border-destructive/50 hover:text-destructive disabled:opacity-50">
                      <X className="h-3.5 w-3.5" /> Revoke
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <p className="mt-5 text-xs leading-5 text-muted-foreground">{tx("Security note: invitation tokens are never stored in plaintext. Acceptance activates membership atomically and starts a new organization-scoped session.","ملاحظة أمنية: لا تُخزَّن رموز الدعوات كنص صريح. يؤدي قبول الدعوة إلى تفعيل العضوية ذريًا وبدء جلسة جديدة مرتبطة بالمؤسسة.")}</p>
    </main>
  );
}
