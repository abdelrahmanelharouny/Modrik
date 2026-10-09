"use client";

// ─────────────────────────────────────────────────────────────
// NIGHTFLIGHT HUD primitives — the shared visual vocabulary of
// the Mission Control flight deck (panels, telemetry, meters,
// radar, reveals). All values rendered here come from props fed
// by live APIs — nothing static.
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useInView, useMotionValue, useSpring } from "framer-motion";
import { cn } from "@/lib/utils";

// ── tone system ──────────────────────────────────────────────
export type Tone = "aura" | "plasma" | "signal" | "verify" | "coral" | "muted";

export const TONE_TEXT: Record<Tone, string> = {
  aura: "text-aura",
  plasma: "text-plasma",
  signal: "text-signal",
  verify: "text-verify",
  coral: "text-coral",
  muted: "text-muted-foreground",
};

export const TONE_BORDER: Record<Tone, string> = {
  aura: "border-aura/40",
  plasma: "border-plasma/40",
  signal: "border-signal/40",
  verify: "border-verify/40",
  coral: "border-coral/40",
  muted: "border-border",
};

export const TONE_BG: Record<Tone, string> = {
  aura: "bg-aura/10 text-aura",
  plasma: "bg-plasma/10 text-plasma",
  signal: "bg-signal/10 text-signal",
  verify: "bg-verify/10 text-verify",
  coral: "bg-coral/10 text-coral",
  muted: "bg-muted text-muted-foreground",
};

// ── corner brackets ──────────────────────────────────────────
export function Corners({ className }: { className?: string }) {
  const base = "pointer-events-none absolute h-2.5 w-2.5 border-aura/50 transition-all duration-300";
  return (
    <span aria-hidden className={cn("pointer-events-none absolute inset-0", className)}>
      <span className={cn(base, "left-0 top-0 border-l-2 border-t-2")} />
      <span className={cn(base, "right-0 top-0 border-r-2 border-t-2")} />
      <span className={cn(base, "bottom-0 left-0 border-b-2 border-l-2")} />
      <span className={cn(base, "bottom-0 right-0 border-b-2 border-r-2")} />
    </span>
  );
}

// ── HUD panel ────────────────────────────────────────────────
export function HudPanel({
  children,
  className,
  glow = false,
  corners = true,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  corners?: boolean;
  as?: "section" | "div" | "article" | "aside";
}) {
  return (
    <Tag
      className={cn(
        "hud-panel relative rounded-lg",
        glow && "hud-glow",
        className
      )}
    >
      {corners && <Corners />}
      {children}
    </Tag>
  );
}

// ── eyebrow label ────────────────────────────────────────────
export function Eyebrow({ children, className, tone = "aura" }: { children: ReactNode; className?: string; tone?: Tone }) {
  return (
    <span
      className={cn(
        "font-mono text-[10px] font-medium uppercase tracking-[0.28em]",
        TONE_TEXT[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

// ── live dot ─────────────────────────────────────────────────
export function LiveDot({ tone = "verify", className }: { tone?: Tone; className?: string }) {
  const color =
    tone === "verify" ? "bg-verify" : tone === "signal" ? "bg-signal" : tone === "plasma" ? "bg-plasma" : tone === "coral" ? "bg-coral" : "bg-aura";
  return (
    <span className={cn("relative inline-flex h-2 w-2", className)}>
      <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", color)} />
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", color)} />
    </span>
  );
}

// ── animated count-up (telemetry numbers) ────────────────────
export function CountUp({
  value,
  className,
  duration = 1.1,
}: {
  value: number;
  className?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-24px" });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { duration: duration * 1000, bounce: 0 });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (inView) mv.set(value);
  }, [inView, value, mv]);

  useEffect(() => {
    const unsub = spring.on("change", (v) => setDisplay(Math.round(v)));
    return () => unsub();
  }, [spring]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {display}
    </span>
  );
}

// ── meter ────────────────────────────────────────────────────
export function Meter({
  value,
  max = 100,
  tone = "aura",
  className,
}: {
  value: number;
  max?: number;
  tone?: Tone;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const bar =
    tone === "verify"
      ? "bg-verify"
      : tone === "signal"
        ? "bg-signal"
        : tone === "plasma"
          ? "bg-plasma"
          : tone === "coral"
            ? "bg-coral"
            : "bg-aura";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-secondary", className)} role="presentation">
      <motion.div
        className={cn("h-full rounded-full", bar)}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

// ── status chip ──────────────────────────────────────────────
export function Chip({
  children,
  tone = "muted",
  className,
  mono = true,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  mono?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-wider",
        mono && "font-mono uppercase",
        TONE_BORDER[tone],
        TONE_BG[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

// ── radar sweep (hero instrument) ────────────────────────────
export function RadarSweep({
  size = 320,
  blips = [],
  onBlipClick,
  className,
}: {
  size?: number;
  blips?: { angle: number; radius: number; label?: string; tone?: Tone; onClick?: () => void }[];
  onBlipClick?: (i: number) => void;
  className?: string;
}) {
  const c = size / 2;
  const r = c - 10;
  const toneColor = (t: Tone = "aura") =>
    t === "verify" ? "#3ddc97" : t === "signal" ? "#ffb454" : t === "plasma" ? "#a78bfa" : t === "coral" ? "#ff6b7a" : "#2ce8c8";

  return (
    <div className={cn("relative", className)} style={{ width: size, height: size }} role="img" aria-label="Fleet radar">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0">
        <defs>
          <linearGradient id="sweepGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2ce8c8" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#2ce8c8" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[1, 0.72, 0.45, 0.2].map((k, i) => (
          <circle key={i} cx={c} cy={c} r={r * k} fill="none" stroke="rgba(44,232,200,0.16)" strokeWidth="1" />
        ))}
        <line x1={c} y1={c - r} x2={c} y2={c + r} stroke="rgba(44,232,200,0.12)" strokeWidth="1" />
        <line x1={c - r} y1={c} x2={c + r} y2={c} stroke="rgba(44,232,200,0.12)" strokeWidth="1" />
        {/* rotating sweep */}
        <g className="animate-radar-sweep" style={{ transformOrigin: `${c}px ${c}px` }}>
          <path d={`M ${c} ${c} L ${c} ${c - r} A ${r} ${r} 0 0 1 ${c + r * 0.77} ${c - r * 0.64} Z`} fill="url(#sweepGrad)" opacity={0.55} />
          <line x1={c} y1={c} x2={c} y2={c - r} stroke="#2ce8c8" strokeWidth="1.4" opacity={0.85} />
        </g>
        {/* blips */}
        {blips.map((b, i) => {
          const a = (b.angle * Math.PI) / 180;
          const x = c + b.radius * r * Math.cos(a);
          const y = c + b.radius * r * Math.sin(a);
          return (
            <g key={i} onClick={() => (b.onClick ? b.onClick() : onBlipClick?.(i))} className={b.onClick || onBlipClick ? "cursor-pointer" : undefined}>
              <circle cx={x} cy={y} r="10" fill={toneColor(b.tone)} opacity={0.14}>
                <animate attributeName="r" values="6;14;6" dur="2.6s" repeatCount="indefinite" begin={`${i * 0.45}s`} />
              </circle>
              <circle cx={x} cy={y} r="3.4" fill={toneColor(b.tone)} />
              {b.label && (
                <text x={x + 8} y={y - 6} fill="rgba(230,238,245,0.75)" fontSize="8.5" fontFamily="var(--font-jbmono), monospace" className="uppercase">
                  {b.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <span className="scanlines pointer-events-none absolute inset-0 rounded-full" />
    </div>
  );
}

// ── entrance reveal ──────────────────────────────────────────
export function Reveal({
  children,
  delay = 0,
  y = 18,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

// ── empty bay ────────────────────────────────────────────────
export function EmptyBay({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-border/80 bg-secondary/30 px-6 py-8 text-center text-sm text-muted-foreground",
        className
      )}
    >
      {children}
    </div>
  );
}

// ── section head ─────────────────────────────────────────────
export function SectionHead({
  icon: Icon,
  title,
  blurb,
  right,
  tone = "aura",
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  blurb?: string;
  right?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {Icon && <Icon className={cn("h-4 w-4", TONE_TEXT[tone])} />}
          <h3 className="font-display text-base font-semibold tracking-tight">{title}</h3>
        </div>
        {blurb && <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>}
      </div>
      {right && <div className="flex shrink-0 flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}
