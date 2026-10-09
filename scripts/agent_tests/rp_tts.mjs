// Generate test audio clips for the ASR (voice-note intake) agent audit.
// Usage: node rp_tts.mjs
import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";
import path from "path";

const OUT = path.dirname(new URL(import.meta.url).pathname);

const CLIPS = [
  {
    file: "tts_en.wav",
    text:
      "The system shall notify the shopkeeper within thirty seconds " +
      "when a new customer order arrives.",
  },
  {
    file: "tts_ar.wav",
    text:
      "عايزة التطبيق يبعتلي إشعار أول ما الطلب الجديد يوصل، ويكون بالعربي وواضح.",
  },
];

async function main() {
  const zai = await ZAI.create();
  for (const clip of CLIPS) {
    try {
      const res = await zai.audio.tts.create({
        input: clip.text,
        response_format: "wav",
      });
      // SDK returns the raw fetch Response — read it as a binary buffer
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(path.join(OUT, clip.file), buf);
      console.log(`OK ${clip.file} ${buf.length} bytes`);
    } catch (e) {
      console.error(`TTS ${clip.file} failed: ${String(e).slice(0, 300)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
