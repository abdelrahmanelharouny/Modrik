"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function InvitationAcceptForm({ token }: { token: string }) {
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
      setError("This invitation link is missing its token. Ask the organization administrator for a new invitation.");
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
        <span>Display name <span className="text-muted-foreground">(optional)</span></span>
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
        <span>Password <span className="text-muted-foreground">(new accounts only)</span></span>
        <input
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={1024}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-11 rounded-lg border border-border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <span className="text-xs leading-5 text-muted-foreground">If you already have a Modrik account, your existing password is kept. New accounts must choose at least 12 characters.</span>
      </label>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <button
        type="submit"
        disabled={busy || !token}
        className="mt-2 h-11 rounded-lg bg-primary px-4 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Securing your membership…" : "Accept invitation"}
      </button>
      <p className="text-center text-xs text-muted-foreground">
        <Link href="/login" className="underline underline-offset-4">Return to sign in</Link>
      </p>
    </form>
  );
}
