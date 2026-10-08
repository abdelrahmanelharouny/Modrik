import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

// I5 multimodal intake — voice notes: in-browser audio capture
// arrives as base64 (MediaRecorder webm/wav); the GLM ASR service
// provided by Z.ai returns a transcript that flows into evidence.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const audio = String(body.audio ?? "");
    if (!audio) {
      return NextResponse.json({ error: "Audio payload (base64) is required" }, { status: 400 });
    }
    // Cap payload at ~15MB base64 to protect the route
    if (audio.length > 20_000_000) {
      return NextResponse.json({ error: "Recording too long — keep voice notes under ~2 minutes" }, { status: 413 });
    }

    const zai = await ZAI.create();
    const result = await zai.audio.asr.create({ file_base64: audio });
    const text = (result as { text?: string }).text ?? "";

    if (!text.trim()) {
      return NextResponse.json({ error: "No speech detected in the recording" }, { status: 422 });
    }
    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err).slice(0, 400) },
      { status: 500 }
    );
  }
}
