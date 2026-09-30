"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { LANG_LABEL, type ProjectDTO } from "@/lib/rp";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Plus, Trash2, MessageCircleQuestion, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function ElicitationStage({
  project,
  isCurrent,
  refresh,
}: {
  project: ProjectDTO;
  isCurrent: boolean;
  refresh: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState("interview");
  const [language, setLanguage] = useState("en");
  const [content, setContent] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const addEvidence = async () => {
    if (!title.trim() || !content.trim()) return;
    try {
      await api(`/api/projects/${project.id}/evidence`, {
        method: "POST",
        body: JSON.stringify({ title, sourceType, language, content }),
      });
      setTitle("");
      setContent("");
      setOpen(false);
      await refresh();
      toast({ title: "Evidence added", description: "The agent will ground its output in this source." });
    } catch (e) {
      toast({ title: "Could not add evidence", description: (e as Error).message, variant: "destructive" });
    }
  };

  const removeEvidence = async (id: string) => {
    try {
      await api(`/api/projects/${project.id}/evidence?evidenceId=${id}`, { method: "DELETE" });
      await refresh();
    } catch (e) {
      toast({ title: "Could not remove evidence", description: (e as Error).message, variant: "destructive" });
    }
  };

  const saveAnswer = async (itemId: string, answer: string) => {
    try {
      await api(`/api/projects/${project.id}/items`, {
        method: "PATCH",
        body: JSON.stringify({ kind: "question", itemId, data: { answer } }),
      });
      await refresh();
    } catch (e) {
      toast({ title: "Could not save answer", description: (e as Error).message, variant: "destructive" });
    }
  };

  const langColor = (l: string) =>
    l === "ar-EG"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : l === "codeswitch"
        ? "border-teal-200 bg-teal-50 text-teal-700"
        : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <div className="space-y-6">
      {/* evidence library */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold tracking-tight">Evidence library</h3>
            <p className="text-sm text-muted-foreground">
              Interviews, documents and meeting notes the agents must ground every output in.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700">
                <Plus className="mr-1.5 h-4 w-4" /> Add evidence
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add evidence source</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <Input
                  placeholder="Source title (e.g. Interview with Um Karim)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Select value={sourceType} onValueChange={setSourceType}>
                    <SelectTrigger aria-label="Source type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="interview">Interview</SelectItem>
                      <SelectItem value="document">Document</SelectItem>
                      <SelectItem value="meeting">Meeting</SelectItem>
                      <SelectItem value="survey">Survey</SelectItem>
                      <SelectItem value="observation">Observation</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger aria-label="Language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="ar-EG">Egyptian Arabic</SelectItem>
                      <SelectItem value="codeswitch">Code-switched</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  rows={6}
                  placeholder="Paste transcript, notes or document excerpt… (Arabic and code-switched text are welcome)"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={addEvidence}
                  disabled={!title.trim() || !content.trim()}
                  className="bg-teal-600 hover:bg-teal-700"
                >
                  Add source
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {project.evidences.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No evidence yet. Add at least one source — agents refuse to hallucinate without grounding.
          </p>
        ) : (
          <ul className="max-h-96 space-y-3 overflow-y-auto pr-1">
            {project.evidences.map((ev) => (
              <li key={ev.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge variant="outline" className="shrink-0 border-teal-300 bg-teal-50 font-mono text-teal-700">
                      {ev.code}
                    </Badge>
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-medium" dir="auto">
                      {ev.title}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline" className="font-normal">
                      {ev.sourceType}
                    </Badge>
                    <Badge variant="outline" className={langColor(ev.language)}>
                      {LANG_LABEL[ev.language] ?? ev.language}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-rose-600"
                      onClick={() => removeEvidence(ev.id)}
                      aria-label={`Remove ${ev.title}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground" dir="auto">
                  {ev.content}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* clarifying questions */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <MessageCircleQuestion className="h-4 w-4 text-teal-600" />
          <h3 className="font-semibold tracking-tight">Clarifying questions</h3>
          <span className="text-sm text-muted-foreground">
            {project.questions.filter((q) => q.answered).length}/{project.questions.length} answered
          </span>
        </div>

        {project.questions.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Run the Questioner Agent to generate questions from your brief and evidence.
          </p>
        ) : (
          <ul className="space-y-4">
            {project.questions.map((q, i) => (
              <li key={q.id} className="rounded-lg border p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">Q{i + 1}</span>
                  <Badge
                    variant="outline"
                    className={
                      q.priority === "high"
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : q.priority === "low"
                          ? "border-slate-200 text-slate-500"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                    }
                  >
                    {q.priority}
                  </Badge>
                  {q.answered && (
                    <span className="flex items-center gap-1 text-xs text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" /> answered
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium" dir="auto">
                  {q.text}
                </p>
                {q.rationale && (
                  <p className="mt-1 text-xs italic text-muted-foreground" dir="auto">
                    Why: {q.rationale}
                  </p>
                )}
                <Textarea
                  rows={2}
                  className="mt-3"
                  dir="auto"
                  placeholder="Your answer (the agent reads this in later stages)…"
                  defaultValue={q.answer ?? ""}
                  disabled={!isCurrent}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v !== (q.answer ?? "")) saveAnswer(q.id, v);
                  }}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                />
                {isCurrent && answers[q.id] !== undefined && answers[q.id] !== (q.answer ?? "") && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-2"
                    onClick={() => saveAnswer(q.id, answers[q.id])}
                  >
                    Save answer
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
