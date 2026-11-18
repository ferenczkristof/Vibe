import { NextRequest, NextResponse } from "next/server";

/**
 * Free, Zero-Login Expressive Singing & Neural Vocal Generator (/api/vocals).
 *
 * Tier 1: TikTok AI Singing Voices (literally sings lyrics with melody & vibrato):
 *   - en_female_f08_warmy_breeze (Dreamy Pop Female Singer)
 *   - en_female_f08_salut_damour (Warm Alto Female Singer)
 *   - en_male_m03_lobby (Soulful Tenor Male Singer)
 *   - en_male_m03_sunshine_soon (Upbeat Indie Male Singer)
 *   - en_female_ht_f08_glorious (Cinematic Choir / Operatic Singer)
 *
 * Tier 2: Pollinations OpenAI Audio (model=openai-audio, voice=nova / shimmer / onyx)
 *
 * Tier 3: Cloud Neural Voice fallback (never uses robotic desktop speechSynthesis)
 */

export type VocalSingerId =
  | "auto"
  | "en_female_f08_warmy_breeze"
  | "en_female_f08_salut_damour"
  | "en_male_m03_lobby"
  | "en_male_m03_sunshine_soon"
  | "en_female_ht_f08_glorious"
  | "openai_nova"
  | "openai_shimmer"
  | "openai_onyx";

function pickSingerForStyle(styleAndPrompt: string, seed: number): string {
  const lower = styleAndPrompt.toLowerCase();
  if (/cinematic|orchestra|epic|choir|opera|ballad/i.test(lower)) {
    return "en_female_ht_f08_glorious";
  }
  if (/male|boy|rock|trap|rap|hip hop|deep/i.test(lower)) {
    return seed % 2 === 0 ? "en_male_m03_lobby" : "en_male_m03_sunshine_soon";
  }
  if (/lofi|lo-fi|chill|acoustic|cozy|sad|piano/i.test(lower)) {
    return "en_female_f08_salut_damour";
  }
  const pool = [
    "en_female_f08_warmy_breeze",
    "en_female_f08_salut_damour",
    "en_male_m03_lobby",
    "en_male_m03_sunshine_soon",
  ];
  return pool[Math.abs(seed) % pool.length];
}

/**
 * Splits lyrics into clean singing phrases under ~220 chars each
 * so singing synthesis models sing every line with natural phrasing.
 */
function splitLyricsIntoPhrases(rawLyrics: string): string[] {
  const cleaned = rawLyrics
    .replace(/\[.*?\]/g, "") // remove [Verse], [Chorus] headers
    .replace(/[^\w\s,'?!.-]/g, " ")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const chunks: string[] = [];
  let current = "";

  for (const line of cleaned) {
    if ((current + ", " + line).length <= 200) {
      current = current ? `${current}, ${line}` : line;
    } else {
      if (current) chunks.push(current);
      current = line.slice(0, 200);
    }
  }
  if (current) chunks.push(current);
  return chunks.slice(0, 4);
}

/**
 * Calls TikTok's Singing Voice endpoints (Weilnet Worker + Gesserit mirror)
 * which return base64 MP3 audio of the singing voice model.
 */
async function synthesizeTikTokSingingChunk(
  text: string,
  voiceId: string
): Promise<Buffer | null> {
  // Mirror 1: weilnet tiktok-tts worker
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(
      "https://tiktok-tts.weilnet.workers.dev/api/generation",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: voiceId }),
        signal: controller.signal,
      }
    );
    clearTimeout(timer);

    if (res.ok) {
      const json = (await res.json()) as { data?: string | null };
      if (json.data && json.data.length > 100) {
        return Buffer.from(json.data, "base64");
      }
    }
  } catch {
    // try mirror 2
  }

  // Mirror 2: gesserit.co TikTok TTS endpoint
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch("https://gesserit.co/api/tiktok-tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: voiceId }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const json = (await res.json()) as { base64?: string; data?: string };
      const b64 = json.base64 || json.data;
      if (b64 && b64.length > 100) {
        const cleanB64 = b64.replace(/^data:audio\/\w+;base64,/, "");
        return Buffer.from(cleanB64, "base64");
      }
    }
  } catch {
    // fall through
  }

  return null;
}

/**
 * Calls Pollinations OpenAI Audio endpoint (gpt-4o-audio / openai-audio)
 */
async function synthesizePollinationsOpenAiVocal(
  lyrics: string,
  style: string,
  openAiVoice: string
): Promise<Buffer | null> {
  const cleanLyrics = lyrics.replace(/\[.*?\]/g, "").trim().slice(0, 380);
  const prompt = `Perform and sing these song lyrics with expressive musical emotion (${style}):\n\n${cleanLyrics}`;

  const urls = [
    `https://text.pollinations.ai/${encodeURIComponent(
      prompt
    )}?model=openai-audio&voice=${openAiVoice}`,
    `https://gen.pollinations.ai/audio/${encodeURIComponent(
      cleanLyrics
    )}?voice=${openAiVoice}`,
  ];

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "SunoCoverStudio/1.0" },
      });
      clearTimeout(timer);

      const contentType = res.headers.get("content-type") || "";
      if (res.ok && (contentType.includes("audio") || contentType.includes("mpeg") || contentType.includes("octet-stream"))) {
        const arr = await res.arrayBuffer();
        if (arr.byteLength > 1000) {
          return Buffer.from(arr);
        }
      }
    } catch {
      // try next URL
    }
  }
  return null;
}

/**
 * Cloud Neural Voice fallback (StreamElements Polly Neural / Google GTX)
 * so the browser NEVER falls back to robotic OS speechSynthesis.
 */
async function synthesizeCloudNeuralFallback(
  phrases: string[],
  isMale: boolean
): Promise<Buffer | null> {
  const buffers: Buffer[] = [];
  const pollyVoice = isMale ? "Matthew" : "Joanna";

  // Try StreamElements Polly Neural
  for (const phrase of phrases) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const url = `https://api.streamelements.com/kappa/v2/speech?voice=${pollyVoice}&text=${encodeURIComponent(
        phrase
      )}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const arr = await res.arrayBuffer();
        if (arr.byteLength > 500) {
          buffers.push(Buffer.from(arr));
        }
      }
    } catch {
      // ignore
    }
  }
  if (buffers.length > 0) {
    return Buffer.concat(buffers);
  }

  // Try Google Translate GTX Neural MP3
  for (const phrase of phrases) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=en&q=${encodeURIComponent(
        phrase.slice(0, 180)
      )}`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      clearTimeout(timer);
      if (res.ok) {
        const arr = await res.arrayBuffer();
        if (arr.byteLength > 500) {
          buffers.push(Buffer.from(arr));
        }
      }
    } catch {
      // ignore
    }
  }

  return buffers.length > 0 ? Buffer.concat(buffers) : null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lyrics =
    searchParams.get("lyrics") ||
    "Singing through the golden light, everything will be alright tonight";
  const style = searchParams.get("style") || "pop";
  const prompt = searchParams.get("prompt") || "";
  const seed = parseInt(searchParams.get("seed") || "1024", 10);
  const requestedSinger = (searchParams.get("singer") || "auto") as VocalSingerId;

  const phrases = splitLyricsIntoPhrases(lyrics);
  if (phrases.length === 0) {
    return NextResponse.json({ error: "No lyrics provided" }, { status: 400 });
  }

  // 1. If user explicitly picked an OpenAI voice, try Pollinations OpenAI Audio first
  if (requestedSinger.startsWith("openai_")) {
    const openAiVoice = requestedSinger.replace("openai_", "");
    const openAiAudio = await synthesizePollinationsOpenAiVocal(
      lyrics,
      `${prompt} ${style}`,
      openAiVoice
    );
    if (openAiAudio) {
      return new NextResponse(new Uint8Array(openAiAudio), {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
  }

  // 2. Try TikTok AI Singing Voices (sings lyrics with real melody & vibrato!)
  const singerVoiceId =
    requestedSinger !== "auto" && !requestedSinger.startsWith("openai_")
      ? requestedSinger
      : pickSingerForStyle(`${prompt} ${style}`, seed);

  const singingBuffers: Buffer[] = [];
  for (const phrase of phrases) {
    const chunkBuf = await synthesizeTikTokSingingChunk(phrase, singerVoiceId);
    if (chunkBuf) {
      singingBuffers.push(chunkBuf);
    } else {
      break;
    }
  }

  if (singingBuffers.length > 0) {
    const combined = Buffer.concat(singingBuffers);
    return new NextResponse(new Uint8Array(combined), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // 3. Try Pollinations OpenAI Expressive Vocal Audio (nova / shimmer / onyx)
  const fallbackOpenAiVoice = /male|boy|rock|trap|rap/i.test(`${prompt} ${style}`)
    ? "onyx"
    : "nova";
  const pollinationsVocal = await synthesizePollinationsOpenAiVocal(
    lyrics,
    `${prompt} ${style}`,
    fallbackOpenAiVoice
  );
  if (pollinationsVocal) {
    return new NextResponse(new Uint8Array(pollinationsVocal), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // 4. Try Cloud Neural Voice (Polly / Google GTX MP3)
  const isMale = /male|boy|rock|trap|rap/i.test(`${prompt} ${style}`);
  const cloudBuf = await synthesizeCloudNeuralFallback(phrases, isMale);
  if (cloudBuf) {
    return new NextResponse(new Uint8Array(cloudBuf), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  return NextResponse.json(
    { error: "Vocal synthesis unavailable" },
    { status: 503 }
  );
}
