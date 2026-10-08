"use client";

// PHASE 03 · AIRFRAME — grounded requirement extraction with
// critic-verifier verdicts, confidence numbers and evidence chips.

import { useState } from "react";
import { api } from "@/lib/api";
import { LANG_LABEL, type ProjectDTO } from "@/lib/rp";
import { HudPanel, Chip, SectionHead, EmptyBay, type Tone } from "@/components/rp/hud";
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
import { DraftingCompass, Pencil, Trash2, Link2, BadgeCheck, BadgeAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PRIO_TONE: Record<string, Tone> = { Must: "coral", Should: "signal", Could: "aura", "Won't": "muted" };
const VERIF_TONE: Record<string, Tone> = { supported: "verify", weak: "signal", unverified: "muted" };

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
  const weakCount = project.requirements.filter((r) => r.verifyStatus === "weak").length;

  if (project.requirements.length === 0) {
    return (
      <HudPanel className="p-6">
        <SectionHead icon={DraftingCompass} title="Extracted requirements" blurb="Atomic, evidence-grounded requirements." />
        <EmptyBay>Run the Extraction Agent to pull atomic, evidence-grounded requirements from your sources.</EmptyBay>
      </HudPanel>
    );
  }

  return (
    <section className="space-y-4">
      <SectionHead
        icon={DraftingCompass}
        title="Extracted requirements"
        blurb="Proposer extracts, Critic verifies — confidence numbers included. You arbitrate every verdict."
        right={
          <>
            <Chip tone="aura">{project.requirements.length} items</Chip>
            {weakCount > 0 && <Chip tone="signal">{weakCount} weak verification</Chip>}
          </>
        }
      />

      <ul className="space-y-3">
        {project.requirements.map((r) => (
          <li key={r.id} className="hud-panel rounded-lg p-4 transition-colors hover:border-aura/30">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-aura/40 bg-aura/5 font-mono text-xs text-aura">
                  {r.refId}
                </Badge>
                <Chip tone={PRIO_TONE[r.priority] ?? "muted"}>{r.priority}</Chip>
                <Chip tone="muted" mono={false}>{r.type}</Chip>
                {r.language !== "en" && (
                  <Chip tone="signal" mono={false}>{LANG_LABEL[r.language] ?? r.language}</Chip>
                )}
                {r.confidence >= 0 && (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    conf <span className={r.confidence >= 70 ? "text-verify" : r.confidence >= 50 ? "text-signal" : "text-coral"}>{r.confidence}%</span>
                  </span>
                )}
                {r.verifyStatus !== "unverified" && (
                  <Chip tone={VERIF_TONE[r.verifyStatus] ?? "muted"}>
                    {r.verifyStatus === "supported" ? <BadgeCheck className="h-3 w-3" /> : <BadgeAlert className="h-3 w-3" />}
                    {r.verifyStatus}
                  </Chip>
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
                    className="h-7 w-7 text-muted-foreground hover:text-coral"
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

            {r.verifyNote && (
              <p className="mt-2 rounded-md bg-secondary/50 px-3 py-1.5 text-xs italic text-muted-foreground" dir="auto">
                Critic: {r.verifyNote}
              </p>
            )}

            {r.links.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 text-aura/70" />
                {r.links.map((l) => (
                  <Badge
                    key={l.evidenceCode}
                    variant="outline"
                    className="border-aura/30 bg-aura/5 font-mono text-xs font-normal text-aura"
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
            <DialogTitle className="font-display">Edit {editing?.refId}</DialogTitle>
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
            <Button onClick={saveEdit} className="bg-aura text-primary-foreground hover:bg-aura/85">
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
