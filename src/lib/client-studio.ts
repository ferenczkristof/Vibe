"use client";

import { GenerateRequest, Track } from "./types";
import { buildCompositionSpec, synthesizeWavBuffer } from "./wav-synth";
import {
  buildVisualCoverPrompt,
  generateArtisticSvgCover,
  getPollinationsCoverUrl,
} from "./image-provider";
import { generateLyricsForPrompt } from "./free-vocal-music";

function deriveTitleClient(prompt: string): string {
  const cleaned = prompt
    .replace(/[^\w\s-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 2 &&
        !/^(and|the|with|for|that|from|about|song|track|music)$/i.test(w)
    )
    .slice(0, 4);

  if (cleaned.length === 0) return "Untitled Studio Song";
  return cleaned
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Generates a playable Blob URL (audio/wav) directly in the browser
 * so playback and downloads work on static hosts like GitHub Pages.
 */
export function createBrowserWavBlobUrl(
  prompt: string,
  styleTags: string,
  seed: number,
  withVocals: boolean
): string {
  const wavBytes = synthesizeWavBuffer(prompt, styleTags, seed, withVocals);
  const blob = new Blob([wavBytes.buffer as ArrayBuffer], { type: "audio/wav" });
  return URL.createObjectURL(blob);
}

export function createSvgCoverDataUrl(
  title: string,
  prompt: string,
  styleTags: string,
  seed: number
): string {
  const svg = generateArtisticSvgCover(title, prompt, styleTags, seed);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Full client-side track generator used automatically when deployed to GitHub Pages
 * (or when Next.js server API routes are not running).
 */
export async function generateTrackClientSide(
  input: GenerateRequest
): Promise<Track> {
  const prompt = (input.prompt || "").trim();
  const seed = Math.floor(100000 + Math.random() * 900000);
  const title = (input.title || "").trim() || deriveTitleClient(prompt);
  const rawStyleTags = (input.styleTags || "").trim();
  const instrumental = Boolean(input.instrumental);

  const lyrics = instrumental
    ? ""
    : await generateLyricsForPrompt(prompt, rawStyleTags, input.customLyrics);

  const spec = buildCompositionSpec(prompt, rawStyleTags, seed);
  const vocalBadge = instrumental ? "Instrumental" : "AI Singing Vocals";
  const displayStyleTags =
    rawStyleTags ||
    `${spec.bpm} BPM • ${spec.scale} • ${spec.leadTimbre} • ${vocalBadge}`;

  const visualPrompt = buildVisualCoverPrompt(prompt, rawStyleTags, title);
  const remoteCoverUrl = getPollinationsCoverUrl(visualPrompt, seed);

  const audioUrl = createBrowserWavBlobUrl(
    prompt,
    rawStyleTags,
    seed,
    !instrumental
  );

  return {
    id: `trk_${Date.now()}_${seed}`,
    title,
    prompt,
    visualPrompt,
    styleTags: displayStyleTags,
    instrumental,
    customLyrics: lyrics || undefined,
    audioUrl,
    coverUrl: remoteCoverUrl,
    remoteCoverUrl,
    duration: 20,
    createdAt: new Date().toISOString(),
    source: "demo-synth",
    mcpNotice: instrumental
      ? `Composed custom ${spec.bpm} BPM ${spec.scale} instrumental (${spec.leadTimbre} + ${spec.drumGroove}).`
      : `Composed custom ${spec.bpm} BPM ${spec.scale} track with AI Singing Vocals & Lyrics.`,
    seed,
  };
}

function pickClientSinger(styleAndPrompt: string, seed: number): string {
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

function splitLyricsClient(rawLyrics: string): string[] {
  const cleaned = rawLyrics
    .replace(/\[.*?\]/g, "")
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

function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.replace(/^data:audio\/\w+;base64,/, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

/**
 * Fetches AI Singing Vocals directly in the browser (works on GitHub Pages without /api/vocals).
 */
export async function resolveClientVocalAudioUrl(
  track: Track,
  requestedSinger: string
): Promise<string | null> {
  const lyrics = track.customLyrics || track.prompt;
  const phrases = splitLyricsClient(lyrics);
  if (phrases.length === 0) return null;

  // 1. If OpenAI voice selected, use Pollinations OpenAI Audio URL directly
  if (requestedSinger.startsWith("openai_")) {
    const voice = requestedSinger.replace("openai_", "");
    const clean = lyrics.replace(/\[.*?\]/g, "").trim().slice(0, 350);
    return `https://text.pollinations.ai/${encodeURIComponent(
      `Sing these lyrics with musical emotion: ${clean}`
    )}?model=openai-audio&voice=${voice}`;
  }

  // 2. Try TikTok Singing Voice CORS endpoints directly from browser
  const voiceId =
    requestedSinger !== "auto"
      ? requestedSinger
      : pickClientSinger(`${track.prompt} ${track.styleTags}`, track.seed || 1024);

  const mp3Parts: BlobPart[] = [];
  for (const phrase of phrases) {
    let chunkBytes: Uint8Array | null = null;
    try {
      const res = await fetch(
        "https://tiktok-tts.weilnet.workers.dev/api/generation",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: phrase, voice: voiceId }),
        }
      );
      if (res.ok) {
        const json = (await res.json()) as { data?: string };
        if (json.data && json.data.length > 100) {
          chunkBytes = base64ToUint8Array(json.data);
        }
      }
    } catch {
      // try fallback mirror
    }

    if (!chunkBytes) {
      try {
        const res = await fetch("https://gesserit.co/api/tiktok-tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: phrase, voice: voiceId }),
        });
        if (res.ok) {
          const json = (await res.json()) as { base64?: string; data?: string };
          const b64 = json.base64 || json.data;
          if (b64 && b64.length > 100) {
            chunkBytes = base64ToUint8Array(b64);
          }
        }
      } catch {
        // ignore
      }
    }

    if (chunkBytes) {
      mp3Parts.push(chunkBytes.buffer as ArrayBuffer);
    } else {
      break;
    }
  }

  if (mp3Parts.length > 0) {
    const blob = new Blob(mp3Parts, { type: "audio/mpeg" });
    return URL.createObjectURL(blob);
  }

  // 3. Fallback to Pollinations OpenAI Audio URL
  const clean = lyrics.replace(/\[.*?\]/g, "").trim().slice(0, 350);
  return `https://text.pollinations.ai/${encodeURIComponent(
    `Sing these lyrics with musical emotion: ${clean}`
  )}?model=openai-audio&voice=nova`;
}
