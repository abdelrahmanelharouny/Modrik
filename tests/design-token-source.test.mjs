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
  const marker = "export const " + name + " = ";
  const start = generated.indexOf(marker);
  assert.ok(start >= 0, name + " should be generated");
  const objectStart = generated.indexOf("{", start + marker.length);
  const objectEnd = generated.indexOf(" as const;", objectStart);
  assert.ok(objectStart >= 0 && objectEnd > objectStart, name + " should contain an object");
  return JSON.parse(generated.slice(objectStart, objectEnd));
}

test("generated WCAG color tokens match the live :root CSS values", () => {
  assert.ok(rootBlock, ":root token block exists");
  const generatedTokens = generatedObject("DESIGN_TOKENS");
  for (const [alias, cssName] of Object.entries(aliases)) {
    const value = new RegExp(cssName + "\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;").exec(rootBlock)?.[1];
    assert.ok(value, "CSS token " + cssName + " exists");
    assert.equal(generatedTokens[alias], value.toLowerCase(), alias + " stays synchronized");
  }
});

test("generated CSS source hash matches the actual root token block", () => {
  const expected = createHash("sha256").update(rootBlock).digest("hex");
  const match = /DESIGN_TOKEN_SOURCE_SHA256 = "([a-f0-9]{64})"/.exec(generated);
  assert.ok(match, "generated token source hash should be present");
  assert.equal(match[1], expected);
});

test("focus-visible and reduced-motion rules exist in the real stylesheet", () => {
  assert.match(css, /:where\([^}]+\):focus-visible\s*\{[^}]*outline:\s*2px\s+solid\s+var\(--ring\)/s);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /animation-duration:\s*0\.01ms\s*!important/);
});

test("language and RTL are switched on the client; server locale remains explicit", () => {
  assert.match(layout, /<html lang="en"/);
  assert.match(i18n, /document\.documentElement\.lang\s*=\s*lang/);
  assert.match(i18n, /document\.documentElement\.dir\s*=\s*lang\s*===\s*"ar"/);
});
