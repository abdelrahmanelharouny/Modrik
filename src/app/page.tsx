"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ProjectDTO } from "@/lib/rp";
import { Workspace } from "@/components/rp/workspace";
import { ProjectPicker } from "@/components/rp/project-picker";
import { Skeleton } from "@/components/ui/skeleton";

interface ProjectSummary {
  id: string;
  name: string;
  currentStage: string;
  stageStatus: string;
  status: string;
  isDemo: boolean;
  updatedAt: string;
  _count: { evidences: number; requirements: number; stories: number };
}

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
    <ProjectPicker
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
    <div className="min-h-screen bg-gradient-to-b from-teal-50/60 to-background p-6 lg:p-10">
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-4 w-96" />
        <div className="grid gap-4 pt-6 md:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    </div>
  );
}
