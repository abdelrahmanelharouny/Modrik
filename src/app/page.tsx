"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ProjectDTO, ProjectSummary } from "@/lib/rp";
import { Workspace } from "@/components/rp/workspace";
import { MissionControl } from "@/components/rp/mission-control";
import { HudPanel, Eyebrow, LiveDot } from "@/components/rp/hud";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const loadProjects = useCallback(async () => {
    const data = await api<{ projects: ProjectSummary[] }>("/api/projects");
    setProjects(data.projects);
  }, []);

  const loadProject = useCallback(async (id: string) => {
    const data = await api<{ project: ProjectDTO }>(`/api/projects/${id}`);
    setProject(data.project);
  }, []);

  useEffect(() => {
    loadProjects().catch(() => setProjects([]));
  }, [loadProjects]);

  const openProject = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setProject(null);
      await loadProject(id).catch(() => setSelectedId(null));
    },
    [loadProject]
  );

  const backHome = useCallback(async () => {
    setSelectedId(null);
    setProject(null);
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
        busy={busy}
        setBusy={setBusy}
        refresh={refresh}
        backHome={backHome}
      />
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
  busy,
  setBusy,
  refresh,
  backHome,
}: {
  project: ProjectDTO | null;
  busy: boolean;
  setBusy: (b: boolean) => void;
  refresh: () => Promise<void>;
  backHome: () => Promise<void>;
}) {
  return project ? (
    <Workspace project={project} busy={busy} setBusy={setBusy} refresh={refresh} backHome={backHome} />
  ) : (
    <div className="flex min-h-screen items-center justify-center p-6">
      <HudPanel className="w-full max-w-md p-8" as="div">
        <Eyebrow className="mb-4 flex items-center gap-2">
          <LiveDot tone="aura" /> PREPARING FLIGHT DECK
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
