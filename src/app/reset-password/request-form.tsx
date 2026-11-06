"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n";

export function PasswordResetRequestForm() {
  const { lang } = useLang();
  const ar = lang === "ar";
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setSent(false);
    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "same-origin", body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to request password recovery");
      setSent(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to request password recovery"); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="grid gap-4">
    <label className="grid gap-2 text-sm"><span>{ar ? "البريد الإلكتروني" : "Email address"}</span><input type="email" required maxLength={254} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {sent ? <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">{ar ? "إذا كان هناك حساب نشط بهذا البريد، فستُرسل إليه تعليمات الاستعادة." : "If an active account matches that address, recovery instructions will be sent."}</p> : null}
    <button type="submit" disabled={busy} className="h-11 rounded-lg bg-primary px-4 font-medium text-primary-foreground disabled:opacity-60">{busy ? (ar ? "جارٍ الإرسال…" : "Sending…") : (ar ? "إرسال رسالة الاستعادة" : "Send recovery email")}</button>
    <Link href="/login" className="text-center text-sm text-muted-foreground hover:text-primary">{ar ? "العودة لتسجيل الدخول" : "Back to sign in"}</Link>
  </form>;
}
