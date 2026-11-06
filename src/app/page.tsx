"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ProjectDTO, ProjectSummary } from "@/lib/rp";
import { Workspace } from "@/components/rp/workspace";
import { MissionControl } from "@/components/rp/mission-control";
import { HudPanel, Eyebrow, LiveDot } from "@/components/rp/hud";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useLang } from "@/lib/i18n";

export default function Home() {
  const { lang } = useLang();
  const ar = lang === "ar";
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [projectsLoadError, setProjectsLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [projectLoadError, setProjectLoadError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setProjectsLoadError(null);
    try {
      const data = await api<{ projects: ProjectSummary[] }>("/api/projects");
      setProjects(data.projects);
    } catch (error) {
      setProjects([]);
      setProjectsLoadError(error instanceof Error ? error.message : "Projects could not be loaded.");
    }
  }, []);

  const loadProject = useCallback(async (id: string) => {
    setProjectLoadError(null);
    const data = await api<{ project: ProjectDTO }>(`/api/projects/${id}`);
    setProject(data.project);
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const openProject = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setProject(null);
      setProjectLoadError(null);
      await loadProject(id).catch((error: unknown) => {
        setProjectLoadError(error instanceof Error ? error.message : "The project could not be loaded.");
      });
    },
    [loadProject]
  );

  const backHome = useCallback(async () => {
    setSelectedId(null);
    setProject(null);
    setProjectLoadError(null);
    await loadProjects();
  }, [loadProjects]);

  // refresh current project after any mutation
  const refresh = useCallback(async () => {
    if (selectedId) await loadProject(selectedId);
  }, [selectedId, loadProject]);

  if (selectedId !== null) {
    return (
      <WorkspaceShell
        project={project}
        projectLoadError={projectLoadError}
        retry={() => selectedId ? loadProject(selectedId) : Promise.resolve()}
        busy={busy}
        setBusy={setBusy}
        refresh={refresh}
        backHome={backHome}
      />
    );
  }

  if (projectsLoadError && projects?.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6" role="alert" aria-live="assertive">
        <HudPanel className="w-full max-w-lg p-8" as="section">
          <div className="mb-4 flex items-center gap-2 text-signal">
            <AlertTriangle className="h-5 w-5" />
            <Eyebrow>{ar ? "تعذر الاتصال بمركز التحكم" : "MISSION CONTROL CONNECTION INTERRUPTED"}</Eyebrow>
          </div>
          <h1 className="font-display text-xl font-bold">{ar ? "لم نتمكن من تحميل مشاريعك" : "Could not load your projects"}</h1>
          <p className="mt-2 break-words text-sm leading-relaxed text-muted-foreground">{projectsLoadError}</p>
          <Button onClick={() => void loadProjects()} className="mt-6 bg-aura text-primary-foreground hover:bg-aura/85">
            <RefreshCw className="mr-2 h-4 w-4" /> {ar ? "إعادة المحاولة" : "Retry"}
          </Button>
        </HudPanel>
      </div>
    );
  }

  return (
    <MissionControl
      projects={projects}
      busy={busy}
      setBusy={setBusy}
      onOpen={openProject}
      onCreated={async (id: string) => {
        await loadProjects();
        openProject(id);
      }}
      onDeleted={async () => {
        await loadProjects();
      }}
    />
  );
}

function WorkspaceShell({
  project,
  projectLoadError,
  retry,
  busy,
  setBusy,
  refresh,
  backHome,
}: {
  project: ProjectDTO | null;
  projectLoadError: string | null;
  retry: () => Promise<void>;
  busy: boolean;
  setBusy: (b: boolean) => void;
  refresh: () => Promise<void>;
  backHome: () => Promise<void>;
}) {
  const { lang } = useLang();
  const ar = lang === "ar";

  return project ? (
    <Workspace project={project} busy={busy} setBusy={setBusy} refresh={refresh} backHome={backHome} />
  ) : projectLoadError ? (
    <div className="flex min-h-screen items-center justify-center p-6" role="alert" aria-live="assertive">
      <HudPanel className="w-full max-w-lg p-8" as="section">
        <div className="mb-4 flex items-center gap-2 text-signal">
          <AlertTriangle className="h-5 w-5" />
          <Eyebrow>{ar ? "انقطع الاتصال بالمشروع" : "PROJECT CONNECTION INTERRUPTED"}</Eyebrow>
        </div>
        <h1 className="font-display text-xl font-bold">{ar ? "تعذر فتح المشروع" : "Could not open this project"}</h1>
        <p className="mt-2 break-words text-sm leading-relaxed text-muted-foreground">{projectLoadError}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => void retry()} className="bg-aura text-primary-foreground hover:bg-aura/85">
            <RefreshCw className="mr-2 h-4 w-4" /> {ar ? "إعادة المحاولة" : "Retry"}
          </Button>
          <Button variant="outline" onClick={() => void backHome()}>{ar ? "العودة لمركز التحكم" : "Back to Mission Control"}</Button>
        </div>
      </HudPanel>
    </div>
  ) : (
    <div className="flex min-h-screen items-center justify-center p-6">
      <HudPanel className="w-full max-w-md p-8" as="div">
        <Eyebrow className="mb-4 flex items-center gap-2">
          <LiveDot tone="aura" /> {ar ? "جارٍ تجهيز مساحة العمل" : "PREPARING FLIGHT DECK"}
        </Eyebrow>
        <Skeleton className="h-8 w-64 bg-secondary/70" />
        <Skeleton className="mt-3 h-4 w-80 bg-secondary/70" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-32 bg-secondary/70" />
          <Skeleton className="h-32 bg-secondary/70" />
        </div>
      </HudPanel>
    </div>
  );
}
