"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Compass,
  Plus,
  Sparkles,
  Trash2,
  MoreHorizontal,
  FileText,
  ListChecks,
  BookOpen,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { STAGE_META, type Stage } from "@/lib/rp";

interface ProjectSummary {
  id: string;
  name: string;
  brief: string;
  status: string;
  currentStage: string;
  stageStatus: string;
  isDemo: boolean;
  updatedAt: string;
  _count: { evidences: number; requirements: number; stories: number };
}

export function ProjectPicker({
  projects,
  busy,
  setBusy,
  onOpen,
  onCreated,
  onDeleted,
}: {
  projects: ProjectSummary[] | null;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onOpen: (id: string) => Promise<void>;
  onCreated: (id: string) => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");

  const createProject = async () => {
    setBusy(true);
    try {
      const data = await api<{ project: { id: string } }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name, brief }),
      });
      setOpen(false);
      setName("");
      setBrief("");
      await onCreated(data.project.id);
    } catch (e) {
      toast({ title: "Could not create project", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const loadDemo = async () => {
    setBusy(true);
    try {
      const data = await api<{ projectId: string; existed: boolean }>("/api/demo", { method: "POST" });
      toast({
        title: data.existed ? "Demo project ready" : "Demo project created",
        description: "Egyptian Arabic + code-switched evidence included.",
      });
      await onCreated(data.projectId);
    } catch (e) {
      toast({ title: "Could not load demo", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const deleteProject = async (id: string) => {
    try {
      await api(`/api/projects/${id}`, { method: "DELETE" });
      await onDeleted();
      toast({ title: "Project deleted" });
    } catch (e) {
      toast({ title: "Could not delete", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-teal-50/60 to-background">
      <header className="border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600">
              <Compass className="h-5 w-5 text-white" />
            </span>
            <div>
              <div className="font-semibold leading-tight tracking-tight">RequirementPilot</div>
              <div className="text-xs text-muted-foreground">Evidence-based · Human-in-the-loop · Agentic RE</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={loadDemo} disabled={busy}>
              <Sparkles className="mr-2 h-4 w-4" /> <span className="hidden sm:inline">Load demo project</span><span className="sm:hidden">Demo</span>
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="bg-teal-600 hover:bg-teal-700" disabled={busy}>
                  <Plus className="mr-2 h-4 w-4" /> New project
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create a new project</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <Input
                    placeholder="Project name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <Textarea
                    rows={5}
                    placeholder="Project brief — what are you building, for whom, and what do you already know?"
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={createProject}
                    disabled={!name.trim() || busy}
                    className="bg-teal-600 hover:bg-teal-700"
                  >
                    Create project
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 lg:px-8">
        <div className="mb-8 max-w-2xl">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            From messy evidence to a defensible requirements baseline
          </h1>
          <p className="mt-2 leading-relaxed text-muted-foreground">
            Six agent stages — elicitation, impact-aware problem selection, grounded extraction,
            ambiguity analysis, story generation and conflict detection — each closed by a human
            approval gate you control.
          </p>
        </div>

        {projects === null ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-white/60 p-12 text-center">
            <Compass className="mx-auto h-10 w-10 text-teal-600" />
            <h2 className="mt-4 text-lg font-semibold">No projects yet</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Start from scratch, or load the demo project with Egyptian Arabic and code-switched
              stakeholder evidence to see the full pipeline in action.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="outline" onClick={loadDemo} disabled={busy}>
                <Sparkles className="mr-2 h-4 w-4" /> Load demo project
              </Button>
              <Button onClick={() => setOpen(true)} className="bg-teal-600 hover:bg-teal-700">
                <Plus className="mr-2 h-4 w-4" /> New project
              </Button>
            </div>
          </div>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => {
              const stageLabel =
                p.status === "complete" ? "Complete" : STAGE_META[p.currentStage as Stage]?.title ?? p.currentStage;
              return (
                <li
                  key={p.id}
                  className="group min-w-0 cursor-pointer rounded-xl border bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                  onClick={() => onOpen(p.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && onOpen(p.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {p.isDemo && (
                          <Badge variant="outline" className="border-teal-300 text-[10px] text-teal-700">
                            Demo
                          </Badge>
                        )}
                      </div>
                      <h3 className="mt-1 truncate font-semibold tracking-tight">{p.name}</h3>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground" dir="auto">
                        {p.brief || "No brief provided yet."}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Project menu">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-rose-600 focus:text-rose-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteProject(p.id);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" /> {p._count.evidences}
                    </span>
                    <span className="flex items-center gap-1">
                      <ListChecks className="h-3.5 w-3.5" /> {p._count.reqs}
                    </span>
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-3.5 w-3.5" /> {p._count.stories}
                    </span>
                    <Badge
                      variant="outline"
                      className={`ml-auto ${
                        p.status === "complete"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-teal-200 bg-teal-50 text-teal-700"
                      }`}
                    >
                      {stageLabel}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <footer className="mt-auto border-t bg-white/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground lg:px-8">
          <span>RequirementPilot MVP — multi-agent pipeline with human approval gates</span>
          <span>Evidence-grounded · Arabic-aware · Auditable</span>
        </div>
      </footer>
    </div>
  );
}
