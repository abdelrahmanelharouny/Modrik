"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { LANG_LABEL, priorityColor, type ProjectDTO } from "@/lib/rp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListChecks, Pencil, Trash2, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function ExtractionStage({
  project,
  isCurrent,
  refresh,
}: {
  project: ProjectDTO;
  isCurrent: boolean;
  refresh: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<ProjectDTO["requirements"][number] | null>(null);
  const [draft, setDraft] = useState("");
  const [draftPriority, setDraftPriority] = useState("Should");
  const [draftType, setDraftType] = useState("functional");

  const patch = async (itemId: string, data: Record<string, unknown>) => {
    try {
      await api(`/api/projects/${project.id}/items`, {
        method: "PATCH",
        body: JSON.stringify({ kind: "requirement", itemId, data }),
      });
      await refresh();
    } catch (e) {
      toast({ title: "Update failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const remove = async (itemId: string) => {
    try {
      await api(`/api/projects/${project.id}/items?kind=requirement&itemId=${itemId}`, {
        method: "DELETE",
      });
      await refresh();
    } catch (e) {
      toast({ title: "Delete failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const openEdit = (r: ProjectDTO["requirements"][number]) => {
    setEditing(r);
    setDraft(r.text);
    setDraftPriority(r.priority);
    setDraftType(r.type);
  };

  const saveEdit = async () => {
    if (!editing) return;
    await patch(editing.id, { text: draft, priority: draftPriority, type: draftType });
    setEditing(null);
  };

  const evidenceTitles = new Map(project.evidences.map((e) => [e.code, e.title]));

  if (project.requirements.length === 0) {
    return (
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-teal-600" />
          <h3 className="font-semibold tracking-tight">Extracted requirements</h3>
        </div>
        <p className="mt-3 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Run the Extraction Agent to pull atomic, evidence-grounded requirements from your sources.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-teal-600" />
        <h3 className="font-semibold tracking-tight">Extracted requirements</h3>
        <span className="text-sm text-muted-foreground">{project.requirements.length} items</span>
      </div>

      <ul className="space-y-3">
        {project.requirements.map((r) => (
          <li key={r.id} className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">
                  {r.refId}
                </Badge>
                <Badge variant="outline" className={`text-xs ${priorityColor(r.priority)}`}>
                  {r.priority}
                </Badge>
                <Badge variant="outline" className="text-xs font-normal">
                  {r.type}
                </Badge>
                {r.language !== "en" && (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-xs font-normal text-amber-800">
                    {LANG_LABEL[r.language] ?? r.language}
                  </Badge>
                )}
                {r.status === "approved" && (
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-xs font-normal text-emerald-700">
                    approved
                  </Badge>
                )}
              </div>
              {isCurrent && (
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)} aria-label={`Edit ${r.refId}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-rose-600"
                    onClick={() => remove(r.id)}
                    aria-label={`Delete ${r.refId}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>

            <p className="mt-2 text-sm leading-relaxed" dir="auto">
              {r.text}
            </p>

            {r.links.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                {r.links.map((l) => (
                  <Badge
                    key={l.evidenceCode}
                    variant="outline"
                    className="border-teal-200 bg-teal-50 font-mono text-xs font-normal text-teal-700"
                    title={`${evidenceTitles.get(l.evidenceCode) ?? ""} — ${l.note ?? ""}`}
                  >
                    {l.evidenceCode}
                  </Badge>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit {editing?.refId}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Textarea rows={4} dir="auto" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Select value={draftPriority} onValueChange={setDraftPriority}>
                <SelectTrigger aria-label="Priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Must">Must</SelectItem>
                  <SelectItem value="Should">Should</SelectItem>
                  <SelectItem value="Could">Could</SelectItem>
                  <SelectItem value="Won't">Won&apos;t</SelectItem>
                </SelectContent>
              </Select>
              <Select value={draftType} onValueChange={setDraftType}>
                <SelectTrigger aria-label="Type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="functional">functional</SelectItem>
                  <SelectItem value="nonfunctional">non-functional</SelectItem>
                  <SelectItem value="constraint">constraint</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} className="bg-teal-600 hover:bg-teal-700">
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
