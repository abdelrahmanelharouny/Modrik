"use client";

// ─────────────────────────────────────────────────────────────
// FLIGHT PATH — the animated journey rail. A marker travels the
// route as human gates pass; traversed segments pulse with the
// aurora dash-flow. UX-as-journey made literal.
// ─────────────────────────────────────────────────────────────

import { FLIGHT_PLAN } from "@/lib/registry";
import { ICONS } from "@/components/rp/icons";
import { Check, Lock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export function FlightPath({
  totalStages,
  currentIdx,
  viewingIdx,
  running,
  onSelect,
  complete,
}: {
  totalStages: number; // 6 engine stages
  currentIdx: number; // index of active stage (0..5, or 6 = debrief)
  viewingIdx: number; // index being viewed
  running: boolean;
  onSelect: (idx: number) => void;
  complete: boolean;
}) {
  const phases = FLIGHT_PLAN.slice(0, totalStages + (complete ? 1 : 0));

  return (
    <nav aria-label="Flight plan" className="w-full">
      {/* desktop rail */}
      <ol className="relative hidden items-start lg:flex" role="list">
        <svg className="pointer-events-none absolute left-0 right-0 top-[22px] h-1 w-full" aria-hidden preserveAspectRatio="none" viewBox="0 0 100 2">
          <line x1="0" y1="1" x2="100" y2="1" stroke="rgba(44,232,200,0.25)" strokeWidth="1.5" strokeDasharray="4 4" className="animate-dash-flow" vectorEffect="non-scaling-stroke" />
        </svg>
        {phases.map((ph, i) => {
          const done = complete ? i < currentIdx : i < currentIdx;
          const current = !complete && i === currentIdx;
          const locked = !complete && i > currentIdx;
          const Icon = ICONS[ph.icon] ?? Lock;
          const clickable = complete || i <= currentIdx;
          return (
            <li key={ph.code} className="relative z-10 min-w-0 flex-1">
              <button
                disabled={!clickable}
                onClick={() => clickable && onSelect(i)}
                aria-current={viewingIdx === i ? "step" : undefined}
                className="group flex w-full flex-col items-center gap-1.5 px-1 py-2 text-center"
              >
                <span
                  className={cn(
                    "relative flex h-11 w-11 items-center justify-center rounded-full border transition-all duration-300",
                    done && "border-verify/60 bg-verify/10 text-verify",
                    current && running && "border-plasma/60 bg-plasma/10 text-plasma",
                    current && !running && "border-aura bg-aura/15 text-aura shadow-[0_0_18px_rgba(44,232,200,0.35)]",
                    locked && "border-border bg-secondary/40 text-muted-foreground/50",
                    viewingIdx === i && !current && "ring-1 ring-aura/50",
                    clickable && "group-hover:border-aura/60"
                  )}
                >
                  {done ? (
                    <Check className="h-4.5 w-4.5" />
                  ) : current && running ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : locked ? (
                    <Lock className="h-3.5 w-3.5" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                  {current && !running && (
                    <span className="absolute inset-0 animate-pulse-ring rounded-full border border-aura/50" />
                  )}
                </span>
                <span className={cn("font-mono text-[9px] tracking-widest", done ? "text-verify" : current ? "text-aura" : "text-muted-foreground/60")}>
                  {ph.num}
                </span>
                <span className={cn("font-display text-xs font-semibold leading-tight", locked ? "text-muted-foreground/60" : "text-foreground")}>
                  {ph.title}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* mobile rail */}
      <ol className="flex gap-1.5 overflow-x-auto pb-1 lg:hidden" role="list">
        {phases.map((ph, i) => {
          const done = i < currentIdx;
          const current = !complete && i === currentIdx;
          const locked = !complete && i > currentIdx;
          const clickable = complete || i <= currentIdx;
          return (
            <li key={ph.code}>
              <button
                disabled={!clickable}
                onClick={() => clickable && onSelect(i)}
                className={cn(
                  "flex min-w-[76px] flex-col items-center gap-1 rounded-md border px-2 py-2 text-center",
                  done && "border-verify/40 bg-verify/5 text-verify",
                  current && "border-aura/60 bg-aura/10 text-aura",
                  locked && "border-border/60 text-muted-foreground/50",
                  viewingIdx === i && !current && !done && "ring-1 ring-aura/40"
                )}
              >
                <span className="font-mono text-[9px] tracking-widest">{ph.num}</span>
                <span className="font-display text-[11px] font-semibold leading-none">{ph.title}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* traveling marker (motion emphasis, desktop only) */}
      {currentIdx >= 0 && currentIdx < phases.length && !complete && (
        <motion.div
          className="pointer-events-none absolute -top-1 hidden lg:block"
          initial={false}
          animate={{ left: `${((currentIdx + 0.5) / phases.length) * 100}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
          aria-hidden
        >
          <span className="block h-2 w-2 -translate-x-1/2 rounded-full bg-aura shadow-[0_0_12px_rgba(44,232,200,0.8)]" />
        </motion.div>
      )}
    </nav>
  );
}
