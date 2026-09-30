"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { severityColor, type ProjectDTO } from "@/lib/rp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GitMerge, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function ConflictsStage({
  project,
  isCurrent,
  refresh,
}: {
  project: ProjectDTO;
  isCurrent: boolean;
  refresh: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const reqById = new Map(project.requirements.map((r) => [r.id, r]));

  const resolve = async (itemId: string) => {
    const resolution = resolutions[itemId];
    if (!resolution?.trim()) {
      toast({
        title: "Resolution required",
        description: "Write how this conflict should be resolved before marking it resolved.",
        variant: "destructive",
      });
      return;
    }
    try {
      await api(`/api/projects/${project.id}/items`, {
        method: "PATCH",
        body: JSON.stringify({ kind: "conflict", itemId, data: { resolution } }),
      });
      await refresh();
      toast({ title: "Conflict resolved" });
    } catch (e) {
      toast({ title: "Could not resolve", description: (e as Error).message, variant: "destructive" });
    }
  };

  const open = project.conflicts.filter((c) => c.status === "open");

  if (project.conflicts.length === 0) {
    return (
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <GitMerge className="h-4 w-4 text-teal-600" />
          <h3 className="font-semibold tracking-tight">Consistency check</h3>
        </div>
        <p className="mt-3 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Run the Consistency Agent to cross-check requirements for contradictions, duplications and overlaps.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <GitMerge className="h-4 w-4 text-teal-600" />
        <h3 className="font-semibold tracking-tight">Consistency check</h3>
        <Badge variant="outline">{project.conflicts.length} findings</Badge>
        <Badge
          variant="outline"
          className={open.length === 0 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}
        >
          {open.length} open
        </Badge>
      </div>

      <ul className="space-y-3">
        {project.conflicts.map((c) => {
          const a = reqById.get(c.reqAId);
          const b = reqById.get(c.reqBId);
          const resolved = c.status === "resolved";
          return (
            <li key={c.id} className={`rounded-xl border bg-white p-5 shadow-sm ${resolved ? "opacity-75" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-xs font-normal">
                  {c.kind}
                </Badge>
                <Badge variant="outline" className={`text-xs ${severityColor(c.severity)}`}>
                  {c.severity}
                </Badge>
                {resolved && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> resolved
                  </span>
                )}
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {[a, b].map((r, i) => (
                  <div key={i} className="rounded-lg border bg-slate-50/60 p-3">
                    <span className="font-mono text-xs text-muted-foreground">{r?.refId}</span>
                    <p className="mt-1 text-sm leading-relaxed" dir="auto">
                      {r?.text}
                    </p>
                  </div>
                ))}
              </div>

              <p className="mt-3 text-sm leading-relaxed" dir="auto">
                {c.description}
              </p>

              {c.suggestion && !resolved && (
                <p className="mt-2 rounded-md border border-teal-200 bg-teal-50/60 px-3 py-2 text-xs text-teal-800" dir="auto">
                  <span className="font-semibold">Agent suggestion: </span>
                  {c.suggestion}
                </p>
              )}

              {resolved ? (
                <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800" dir="auto">
                  <span className="font-semibold">Resolution: </span>
                  {c.resolution}
                </p>
              ) : (
                isCurrent && (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      rows={2}
                      dir="auto"
                      placeholder="How should this conflict be resolved? (e.g. REQ-04 wins, REQ-07 is dropped)"
                      value={resolutions[c.id] ?? ""}
                      onChange={(e) => setResolutions((r) => ({ ...r, [c.id]: e.target.value }))}
                    />
                    <Button size="sm" variant="secondary" onClick={() => resolve(c.id)}>
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Mark resolved
                    </Button>
                  </div>
                )
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
