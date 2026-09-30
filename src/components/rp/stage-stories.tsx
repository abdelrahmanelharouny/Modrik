"use client";

import { api } from "@/lib/api";
import { type ProjectDTO } from "@/lib/rp";
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";

export function StoriesStage({
  project,
  isCurrent: _isCurrent,
  refresh: _refresh,
}: {
  project: ProjectDTO;
  isCurrent: boolean;
  refresh: () => Promise<void>;
}) {
  void api;
  const reqById = new Map(project.requirements.map((r) => [r.id, r]));

  if (project.stories.length === 0) {
    return (
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-teal-600" />
          <h3 className="font-semibold tracking-tight">Generated user stories</h3>
        </div>
        <p className="mt-3 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Run the Story Agent to turn approved requirements into user stories with acceptance criteria.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-teal-600" />
        <h3 className="font-semibold tracking-tight">Generated user stories</h3>
        <span className="text-sm text-muted-foreground">{project.stories.length} stories</span>
      </div>

      <ul className="space-y-3">
        {project.stories.map((s) => {
          const req = reqById.get(s.requirementId);
          return (
            <li key={s.id} className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">
                  {s.refId}
                </Badge>
                <Badge variant="outline" className="text-xs font-normal">
                  from {req?.refId ?? "—"}
                </Badge>
                {s.investScore !== null && s.investScore !== undefined && (
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      s.investScore >= 70
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : s.investScore >= 50
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-rose-200 bg-rose-50 text-rose-700"
                    }`}
                  >
                    INVEST {s.investScore}
                  </Badge>
                )}
                {s.status === "approved" && (
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-xs font-normal text-emerald-700">
                    approved
                  </Badge>
                )}
              </div>

              <h4 className="mt-2 font-medium tracking-tight" dir="auto">
                {s.title}
              </h4>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground" dir="auto">
                {s.narrative}
              </p>

              {s.acceptance && (
                <div className="mt-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Acceptance criteria
                  </span>
                  <ul className="mt-1.5 space-y-1">
                    {s.acceptance.split("\n").filter(Boolean).map((ac, i) => (
                      <li key={i} className="flex gap-2 text-sm" dir="auto">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                        <span>{ac}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {s.investNote && <p className="mt-3 text-xs italic text-muted-foreground">{s.investNote}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
