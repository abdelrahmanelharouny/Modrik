"use client";

// Registry icon-name → lucide component resolution, shared by
// Mission Control, FlightPath and the Debrief bay.

import {
  Radio,
  Route,
  DraftingCompass,
  Radar,
  Package,
  GitMerge,
  Telescope,
  Rocket,
  FileText,
  ListChecks,
  BookOpen,
  ScrollText,
  Github,
  KanbanSquare,
  HeartPulse,
  Wind,
  ShieldCheck,
  Waypoints,
  Languages,
  Crosshair,
} from "lucide-react";

export const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Radio,
  Route,
  DraftingCompass,
  Radar,
  Package,
  GitMerge,
  Telescope,
  Rocket,
  FileText,
  ListChecks,
  BookOpen,
  ScrollText,
  Github,
  KanbanSquare,
  HeartPulse,
  Wind,
  ShieldCheck,
  Waypoints,
  Languages,
  Crosshair,
};
