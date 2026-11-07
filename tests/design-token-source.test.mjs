import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const css = readFileSync("src/app/globals.css", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");
const i18n = readFileSync("src/lib/i18n.tsx", "utf8");
const generated = readFileSync("src/lib/generated/design-tokens.ts", "utf8");
const rootBlock = /:root\s*\{([^}]*)\}/s.exec(css)?.[1];

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

function generatedObject(name) {
  const prefix = "export const " + name + " = ";
  const start = generated.indexOf(prefix);
  assert.ok(start >= 0, name + " should be generated");
  const bodyStart = start + prefix.length;
  const bodyEnd = generated.indexOf(" as const;", bodyStart);
  assert.ok(bodyEnd > bodyStart, name + " should contain a JSON object");
  return JSON.parse(generated.slice(bodyStart, bodyEnd));
}

function cssToken(block, name) {
  const line = block.split("\n").find((entry) => entry.trim().startsWith(name + ":"));
  return line?.split(":").slice(1).join(":").trim().replace(/;$/, "").toLowerCase();
}

test("generated WCAG color tokens match the live :root CSS values", () => {
  assert.ok(rootBlock, ":root token block exists");
  const generatedTokens = generatedObject("DESIGN_TOKENS");
  for (const [alias, cssName] of Object.entries(aliases)) {
    const value = cssToken(rootBlock, cssName);
    assert.ok(value, "CSS token " + cssName + " exists");
    assert.equal(generatedTokens[alias], value, alias + " stays synchronized");
  }
});

test("generated CSS source hash matches the actual root token block", () => {
  const expected = createHash("sha256").update(rootBlock).digest("hex");
  const line = generated.split("\n").find((entry) => entry.startsWith("export const DESIGN_TOKEN_SOURCE_SHA256 = "));
  assert.ok(line, "generated token source hash should be present");
  const actual = line.split('"')[1];
  assert.equal(actual, expected);
});

test("focus-visible and reduced-motion rules exist in the real stylesheet", () => {
  assert.ok(css.includes(":focus-visible"));
  assert.ok(css.includes("outline: 2px solid var(--ring)"));
  assert.ok(css.includes("@media (prefers-reduced-motion: reduce)"));
  assert.ok(css.includes("animation-duration: 0.01ms !important"));
});

test("language and RTL are switched on the client; server locale remains explicit", () => {
  assert.ok(layout.includes('<html lang="en"'));
  assert.ok(i18n.includes("document.documentElement.lang = lang"));
  assert.ok(i18n.includes('document.documentElement.dir = lang === "ar"'));
});
