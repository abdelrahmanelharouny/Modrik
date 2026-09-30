"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { ambiguityColor, type ProjectDTO } from "@/lib/rp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Gauge, Sparkles, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function AmbiguityStage({
  project,
  isCurrent,
  refresh,
}: {
  project: ProjectDTO;
  isCurrent: boolean;
  refresh: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [filter, setFilter] = useState<"all" | "flagged">("all");

  const applySuggestion = async (itemId: string) => {
    try {
      await api(`/api/projects/${project.id}/items`, {
        method: "PATCH",
        body: JSON.stringify({ kind: "requirement", itemId, data: { action: "apply_suggestion" } }),
      });
      await refresh();
      toast({ title: "Rewrite applied", description: "Requirement text replaced with the sharper version." });
    } catch (e) {
      toast({ title: "Could not apply rewrite", description: (e as Error).message, variant: "destructive" });
    }
  };

  const assessed = project.requirements.filter((r) => r.ambiguity >= 0);
  const flagged = assessed.filter((r) => r.ambiguity >= 30);
  const shown = filter === "flagged" ? flagged : assessed;
  const avg = assessed.length
    ? Math.round(assessed.reduce((s, r) => s + r.ambiguity, 0) / assessed.length)
    : 0;

  if (assessed.length === 0) {
    return (
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-teal-600" />
          <h3 className="font-semibold tracking-tight">Ambiguity assessment</h3>
        </div>
        <p className="mt-3 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Run the Ambiguity Agent to score every requirement and flag weak, untestable wording.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Gauge className="h-4 w-4 text-teal-600" />
        <h3 className="font-semibold tracking-tight">Ambiguity assessment</h3>
        <Badge variant="outline">avg score {avg}</Badge>
        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
          {flagged.length} flagged
        </Badge>
        <div className="ml-auto flex rounded-lg border p-0.5 text-sm">
          <button
            className={`rounded-md px-3 py-1 ${filter === "all" ? "bg-teal-600 text-white" : "text-muted-foreground"}`}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            className={`rounded-md px-3 py-1 ${filter === "flagged" ? "bg-teal-600 text-white" : "text-muted-foreground"}`}
            onClick={() => setFilter("flagged")}
          >
            Flagged
          </button>
        </div>
      </div>

      <ul className="space-y-3">
        {shown.map((r) => (
          <li key={r.id} className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">
                {r.refId}
              </Badge>
              <Badge variant="outline" className={`text-xs ${ambiguityColor(r.ambiguity)}`}>
                ambiguity {r.ambiguity}
              </Badge>
              {r.suggestion && (
                <Badge variant="outline" className="border-teal-200 bg-teal-50 text-xs font-normal text-teal-700">
                  rewrite available
                </Badge>
              )}
            </div>

            <p className="mt-2 text-sm leading-relaxed" dir="auto">
              {r.text}
            </p>

            {r.ambiguityNote && (
              <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800" dir="auto">
                <span className="font-semibold">Weak wording: </span>
                {r.ambiguityNote}
              </p>
            )}

            {r.suggestion && (
              <div className="mt-3 rounded-md border border-teal-200 bg-teal-50/60 p-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-teal-700">
                    <Sparkles className="h-3.5 w-3.5" /> Suggested rewrite
                  </span>
                  {isCurrent && (
                    <Button size="sm" variant="secondary" onClick={() => applySuggestion(r.id)}>
                      <Check className="mr-1.5 h-3.5 w-3.5" /> Apply rewrite
                    </Button>
                  )}
                </div>
                <p className="text-sm leading-relaxed text-teal-900" dir="auto">
                  {r.suggestion}
                </p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
