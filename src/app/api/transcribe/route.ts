import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

// I5 multimodal intake — voice notes: in-browser audio capture
// arrives as base64 (MediaRecorder webm/wav); the GLM ASR service
// returns a transcript that flows into evidence.
//
// Audit hardening: the live audit caught Arabic voice notes being
// transcribed into an unrelated script (Hangul). The route now accepts an
// optional expectedLanguage, retries once on a script mismatch, and returns
// a warning flag so the UI can ask the human to review before saving.

const ARABIC_RE = /[\u0600-\u06FF]/;
const CJK_RE = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/;

function scriptOf(text: string): "arabic" | "latin" | "other" {
  if (ARABIC_RE.test(text)) return "arabic";
  const letters = text.replace(/[^A-Za-z]/g, "").length;
  if (letters >= Math.max(3, text.replace(/\s/g, "").length * 0.5)) return "latin";
  if (CJK_RE.test(text)) return "other";
  return "other";
}

function expectsArabic(expectedLanguage: string): boolean {
  return expectedLanguage.startsWith("ar") || expectedLanguage === "ar-EG" || expectedLanguage === "codeswitch";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const audio = String(body.audio ?? "");
    const expectedLanguage = String(body.expectedLanguage ?? "").trim();
    if (!audio) {
      return NextResponse.json({ error: "Audio payload (base64) is required" }, { status: 400 });
    }
    // Cap payload at ~15MB base64 to protect the route
    if (audio.length > 20_000_000) {
      return NextResponse.json({ error: "Recording too long — keep voice notes under ~2 minutes" }, { status: 413 });
    }

    const zai = await ZAI.create();
    const transcribe = async () => {
      const result = await zai.audio.asr.create({ file_base64: audio });
      return ((result as { text?: string }).text ?? "").trim();
    };

    let text = await transcribe();
    if (!text.trim()) {
      return NextResponse.json({ error: "No speech detected in the recording" }, { status: 422 });
    }

    let warning: string | null = null;
    if (expectedLanguage) {
      const script = scriptOf(text);
      const mismatch =
        (expectsArabic(expectedLanguage) && script !== "arabic") ||
        (!expectsArabic(expectedLanguage) && script === "other");
      if (mismatch) {
        // one retry — transient misdetection
        text = await transcribe();
        const script2 = scriptOf(text);
        const stillMismatched =
          text.trim().length > 0 &&
          ((expectsArabic(expectedLanguage) && script2 !== "arabic") ||
            (!expectsArabic(expectedLanguage) && script2 === "other"));
        if (stillMismatched) {
          warning =
            "The transcript script does not match the expected language of this evidence. Please review or re-record before saving.";
        }
      }
    }

    return NextResponse.json({ text, warning });
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err).slice(0, 400) },
      { status: 500 }
    );
  }
}
