import { NextResponse } from "next/server";
import { listProviders, resolveProviderId } from "@/lib/providers";

// Dev item 12 — provider interface status (qualitative registry data;
// no secrets, no numbers). Lets the UI show the active model honestly.
export async function GET() {
  return NextResponse.json({
    active: resolveProviderId(),
    providers: listProviders(),
  });
}
