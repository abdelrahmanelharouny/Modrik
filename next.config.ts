import type { NextConfig } from "next";

// ─────────────────────────────────────────────────────────────
// Modrik (مدرك) — Next.js configuration
//
// • output: "standalone" is used ONLY for self-hosted builds
//   (`npm run build:standalone` + `npm start`). On Vercel the
//   platform provides its own optimized target, so we defer to
//   it — shipping standalone output to Vercel is redundant and
//   can double the traced bundle.
// • serverExternalPackages keeps z-ai-web-dev-sdk out of the
//   bundler (it resolves its own transports/credentials at
//   runtime and misbehaves when inlined).
// • TypeScript build errors are not ignored. CI runs the same
//   strict compiler gate before the production build.
// ─────────────────────────────────────────────────────────────

const nextConfig: NextConfig = {
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  serverExternalPackages: ["z-ai-web-dev-sdk", "@prisma/client", "prisma"],
  reactStrictMode: false,
};

export default nextConfig;
