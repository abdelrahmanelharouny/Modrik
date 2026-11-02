"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not end the owner session.");
      router.replace("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={signOut}
      disabled={busy}
      aria-label="Sign out"
      className="px-2"
    >
      <LogOut className="mr-1.5 h-3.5 w-3.5" />
      <span className="hidden sm:inline">{busy ? "Signing out…" : "Sign out"}</span>
    </Button>
  );
}
