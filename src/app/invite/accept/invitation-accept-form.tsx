"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n";
import { useRouter } from "next/navigation";

export function InvitationAcceptForm({ token }: { token: string }) {
  const { lang } = useLang();
  const ar = lang === "ar";
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (token) window.history.replaceState(null, "", "/invite/accept");
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setError(ar ? "رابط الدعوة غير مكتمل. اطلب رابط دعوة جديدًا من مسؤول المؤسسة." : "This invitation link is missing its token. Ask the organization administrator for a new invitation.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ token, password, displayName }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "This invitation could not be accepted");
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "This invitation could not be accepted");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <label className="grid gap-2 text-sm">
        <span>{ar ? "الاسم الظاهر " : "Display name "}<span className="text-muted-foreground">{ar ? "(اختياري)" : "(optional)"}</span></span>
        <input
          type="text"
          autoComplete="name"
          maxLength={80}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          className="h-11 rounded-lg border border-border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </label>
      <label className="grid gap-2 text-sm">
        <span>{ar ? "كلمة المرور " : "Password "}<span className="text-muted-foreground">{ar ? "للحسابات الجديدة فقط" : "new accounts only"}</span></span>
        <input
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={1024}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-11 rounded-lg border border-border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <span className="text-xs leading-5 text-muted-foreground">{ar ? "إذا كان لديك حساب مدرك بالفعل، فستظل كلمة مرورك الحالية كما هي. يجب أن تتكون كلمة مرور الحساب الجديد من 12 حرفًا على الأقل." : "If you already have a Modrik account, your existing password is kept. New accounts must choose at least 12 characters."}</span>
      </label>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <button
        type="submit"
        disabled={busy || !token}
        className="mt-2 h-11 rounded-lg bg-primary px-4 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? (ar ? "جارٍ تأمين عضويتك…" : "Securing your membership…") : (ar ? "قبول الدعوة" : "Accept invitation")}
      </button>
      <p className="text-center text-xs text-muted-foreground">
        <Link href="/login" className="underline underline-offset-4">{ar ? "العودة لتسجيل الدخول" : "Return to sign in"}</Link>
      </p>
    </form>
  );
}
