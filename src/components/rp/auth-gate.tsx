"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { HudPanel, Eyebrow, LiveDot } from "@/components/rp/hud";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LockKeyhole, LogOut, ShieldAlert } from "lucide-react";

type AuthState = "checking" | "unconfigured" | "signed-out" | "signed-in";

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json().catch(() => ({})) }))
      .then(({ response, body }) => {
        if (!active) return;
        if (response.status === 503 || body.configured === false) setState("unconfigured");
        else setState(body.authenticated ? "signed-in" : "signed-out");
      })
      .catch(() => {
        if (active) {
          setState("signed-out");
          setError("Could not verify the current session. Check the connection and retry.");
        }
      });
    return () => { active = false; };
  }, []);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Sign in failed.");
      setPassword("");
      const session = await fetch("/api/auth/session", { cache: "no-store" });
      const status = await session.json().catch(() => ({}));
      setState(status.authenticated ? "signed-in" : "signed-out");
      if (!status.authenticated) throw new Error("Login succeeded but the session cookie could not be verified.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
      if (!response.ok) throw new Error("Could not end the session.");
      setState("signed-out");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  if (state === "signed-in") {
    return (
      <>
        {children}
        <div className="fixed bottom-4 right-4 z-[60]">
          <Button size="sm" variant="outline" onClick={signOut} disabled={busy} className="border-border/80 bg-card/95 shadow-lg backdrop-blur">
            <LogOut className="mr-2 h-3.5 w-3.5" />
            Sign out
          </Button>
        </div>
      </>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <HudPanel glow className="w-full max-w-md p-7" as="section">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-aura/40 bg-aura/10">
            {state === "unconfigured" ? <ShieldAlert className="h-5 w-5 text-signal" /> : <LockKeyhole className="h-5 w-5 text-aura" />}
          </div>
          <div>
            <Eyebrow className="flex items-center gap-2"><LiveDot tone={state === "unconfigured" ? "signal" : "aura"} /> MODRIK · OWNER ACCESS</Eyebrow>
            <h1 className="mt-1 font-display text-xl font-bold">Mission Control</h1>
          </div>
        </div>
        {state === "checking" ? (
          <p className="text-sm text-muted-foreground">Verifying secure session…</p>
        ) : state === "unconfigured" ? (
          <div className="space-y-3 text-sm">
            <p className="font-medium text-signal">Owner authentication is not configured.</p>
            <p className="leading-6 text-muted-foreground">
              The API is intentionally locked until deployment secrets are configured. Set
              <code className="mx-1 rounded bg-secondary px-1.5 py-0.5">MODRIK_ADMIN_EMAIL</code>,
              <code className="mx-1 rounded bg-secondary px-1.5 py-0.5">MODRIK_ADMIN_PASSWORD_HASH</code>
              and a random 32-byte
              <code className="mx-1 rounded bg-secondary px-1.5 py-0.5">MODRIK_AUTH_SECRET</code>.
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              Generate the password hash with the repository's documented scrypt format, and keep all values in the deployment secret store — never in source control.
            </p>
          </div>
        ) : (
          <form onSubmit={signIn} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="owner-email" className="text-xs font-medium text-muted-foreground">Owner email</label>
              <Input id="owner-email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="owner@example.com" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="owner-password" className="text-xs font-medium text-muted-foreground">Password</label>
              <Input id="owner-password" type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your owner password" />
            </div>
            {error && <p role="alert" className="rounded-md border border-coral/30 bg-coral/5 px-3 py-2 text-xs text-coral">{error}</p>}
            <Button block type="submit" disabled={busy || !email.trim() || !password}>{busy ? "Signing in…" : "Sign in securely"}</Button>
            <p className="text-center text-[11px] leading-5 text-muted-foreground">Owner-only access · HttpOnly signed session · 8-hour expiry</p>
          </form>
        )}
        {state === "signed-out" && error && <p role="alert" className="mt-3 text-xs text-coral">{error}</p>}
      </HudPanel>
    </main>
  );
}
