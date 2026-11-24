"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLang } from "@/lib/i18n";

type OrganizationOption = { id: string; name: string; slug: string; role: string };

export function LoginForm() {
  const { lang, toggle } = useLang();
  const ar = lang === "ar";
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, ...(organizationId ? { organizationId } : {}) }),
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 409 && payload.requiresOrganizationSelection && Array.isArray(payload.organizations)) {
        setOrganizations(payload.organizations);
        setOrganizationId("");
        setError(ar ? "حسابك مرتبط بأكثر من مؤسسة. اختَر مساحة العمل للمتابعة." : "Your account belongs to multiple organizations. Choose a workspace to continue.");
        return;
      }
      if (!response.ok) throw new Error(payload.error || (ar ? "تعذر تسجيل الدخول" : "Unable to sign in"));
      setOrganizations([]);
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : (ar ? "تعذر تسجيل الدخول" : "Unable to sign in"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} dir={ar ? "rtl" : "ltr"} lang={ar ? "ar" : "en"} className="grid gap-4">
      <div className="flex justify-end"><button type="button" onClick={toggle} aria-label={ar ? "تغيير اللغة إلى الإنجليزية" : "Switch language to Arabic"} className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary">{ar ? "English" : "العربية"}</button></div>
      <label className="grid gap-2 text-sm">
        <span>{ar ? "البريد الإلكتروني" : "Email"}</span>
        <input
          type="email"
          autoComplete="username"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-11 rounded-lg border border-border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </label>
      <label className="grid gap-2 text-sm">
        <span>{ar ? "كلمة المرور" : "Password"}</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          maxLength={1024}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-11 rounded-lg border border-border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </label>
      {organizations.length > 1 ? (
        <label className="grid gap-2 text-sm">
          <span>{ar ? "مساحة العمل" : "Workspace"}</span>
          <select
            required
            value={organizationId}
            onChange={(event) => setOrganizationId(event.target.value)}
            className="h-11 rounded-lg border border-border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="">{ar ? "اختَر المؤسسة" : "Choose an organization"}</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name} · {organization.role}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end -mt-1">
        <Link href="/reset-password" className="text-xs text-primary underline-offset-4 hover:underline">{ar ? "نسيت كلمة المرور؟" : "Forgot password?"}</Link>
      </div>
      <button
        type="submit"
        disabled={busy || (organizations.length > 1 && !organizationId)}
        className="mt-2 h-11 rounded-lg bg-primary px-4 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? (ar ? "جارٍ تسجيل الدخول…" : "Signing in…") : (ar ? "تسجيل الدخول" : "Sign in")}
      </button>
    </form>
  );
}
