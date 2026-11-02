"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";

export function PasswordResetCompleteForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/password-reset/complete", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "same-origin", body: JSON.stringify({ token, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to reset password");
      setDone(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to reset password"); }
    finally { setBusy(false); }
  }

  if (done) return <div className="grid gap-4"><p role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">Your password has been updated. All previous sessions were signed out.</p><Link href="/login" className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 font-medium text-primary-foreground">Continue to sign in</Link></div>;

  return <form onSubmit={submit} className="grid gap-4">
    <label className="grid gap-2 text-sm"><span>New password</span><input type="password" required minLength={12} maxLength={1024} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label>
    <label className="grid gap-2 text-sm"><span>Confirm new password</span><input type="password" required minLength={12} maxLength={1024} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <button type="submit" disabled={busy || !token} className="h-11 rounded-lg bg-primary px-4 font-medium text-primary-foreground disabled:opacity-60">{busy ? "Updating…" : "Update password"}</button>
  </form>;
}
