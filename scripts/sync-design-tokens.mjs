#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cssPath = join(root, "src", "app", "globals.css");
const layoutPath = join(root, "src", "app", "layout.tsx");
const i18nPath = join(root, "src", "lib", "i18n.tsx");
const outputPath = join(root, "src", "lib", "generated", "design-tokens.ts");

const css = readFileSync(cssPath, "utf8");
const layout = readFileSync(layoutPath, "utf8");
const i18n = readFileSync(i18nPath, "utf8");
const rootBlock = /:root\s*\{([^}]*)\}/s.exec(css)?.[1];
if (!rootBlock) throw new Error("Could not find :root CSS token block");

const aliases = {
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  cardForeground: "--card-foreground",
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  secondary: "--secondary",
  secondaryForeground: "--secondary-foreground",
  mutedForeground: "--muted-foreground",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  destructive: "--destructive",
  verify: "--verify",
  signal: "--signal",
  plasma: "--plasma",
  aura: "--aura",
};

const tokens = {};
for (const [alias, variable] of Object.entries(aliases)) {
  const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const value = new RegExp(escaped + "\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;").exec(rootBlock)?.[1];
  if (!value) throw new Error("Missing hex token " + variable + " in :root");
  tokens[alias] = value.toLowerCase();
}

const checks = {
  focusVisible: /:where\([^}]+\):focus-visible\s*\{[^}]*outline:\s*2px\s+solid\s+var\(--ring\)/s.test(css),
  reducedMotion: /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css) &&
    /animation-duration:\s*0\.01ms\s*!important/.test(css),
  clientLocaleSync: /document\.documentElement\.lang\s*=\s*lang/.test(i18n) &&
    /document\.documentElement\.dir\s*=\s*lang\s*===\s*"ar"\s*\?\s*"rtl"\s*:\s*"ltr"/.test(i18n),
  serverLocaleNegotiation: /<html[^>]*lang=\{/.test(layout),
};

const hash = createHash("sha256").update(rootBlock).digest("hex");
const content = [
  "// AUTO-GENERATED from src/app/globals.css by scripts/sync-design-tokens.mjs.",
  "// Do not edit by hand; the CI/build synchronizer is the source of truth.",
  "export const DESIGN_TOKENS = " + JSON.stringify(tokens, null, 2) + " as const;",
  "export const DESIGN_SOURCE_CHECKS = " + JSON.stringify(checks, null, 2) + " as const;",
  'export const DESIGN_TOKEN_SOURCE_SHA256 = "' + hash + '";',
  "",
].join("\n");

writeFileSync(outputPath, content, "utf8");
console.log("Synchronized " + Object.keys(tokens).length + " design tokens (" + hash.slice(0, 12) + ")");
