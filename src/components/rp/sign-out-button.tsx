"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const signOut = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not end the owner session.");
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Sign out failed. Check the connection and retry.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
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
    {error && <span role="alert" className="text-[10px] text-destructive">{error}</span>}
    </div>
  );
}
