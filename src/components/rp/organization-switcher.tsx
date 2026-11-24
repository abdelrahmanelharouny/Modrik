"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";

type OrganizationOption = { id: string; name: string; slug: string; role: string };

export function OrganizationSwitcher() {
  const { lang } = useLang();
  const ar = lang === "ar";
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((payload) => {
        if (cancelled || !payload?.authenticated) return;
        setOrganizations(Array.isArray(payload.organizations) ? payload.organizations : []);
        setActiveOrganizationId(typeof payload.organizationId === "string" ? payload.organizationId : "");
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  if (organizations.length < 2) return null;

  async function changeOrganization(nextId: string) {
    if (!nextId || nextId === activeOrganizationId || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/organization/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ organizationId: nextId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Organization switch failed");
      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Organization switch failed");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col items-end gap-0.5">
      <label htmlFor="active-organization" className="sr-only">{ar ? "المؤسسة النشطة" : "Active organization"}</label>
      <select
        id="active-organization"
        value={activeOrganizationId}
        disabled={busy}
        onChange={(event) => void changeOrganization(event.target.value)}
        aria-label={ar ? "تبديل المؤسسة" : "Switch organization"}
        className="h-9 max-w-[150px] rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary sm:max-w-[190px]"
      >
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.name} · {organization.role}
          </option>
        ))}
      </select>
      {error ? <span role="alert" className="max-w-[190px] text-right text-[10px] text-destructive">{error}</span> : null}
    </div>
  );
}
