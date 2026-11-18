import { NextRequest, NextResponse } from "next/server";
import {
  deriveTrackTitle,
  generateTrackViaSunoMcp,
} from "@/lib/suno-mcp";
import {
  buildVisualCoverPrompt,
  getLocalProxyCoverUrl,
  getPollinationsCoverUrl,
} from "@/lib/image-provider";
import {
  generateLyricsForPrompt,
  tryFreeOpenSourceVocalModels,
} from "@/lib/free-vocal-music";
import { buildCompositionSpec } from "@/lib/wav-synth";
import { GenerateRequest, Track } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateRequest;
    const prompt = (body.prompt || "").trim();

    if (!prompt) {
      return NextResponse.json(
        { error: "Please enter a song prompt or short description." },
        { status: 400 }
      );
    }

    const seed = Math.floor(100000 + Math.random() * 900000);
    const title = (body.title || "").trim() || deriveTrackTitle(prompt);
    const rawStyleTags = (body.styleTags || "").trim();
    const instrumental = Boolean(body.instrumental);

    // 1. Auto-generate song lyrics when vocals are enabled (free via Pollinations LLM + local fallback)
    const lyrics = instrumental
      ? ""
      : await generateLyricsForPrompt(prompt, rawStyleTags, body.customLyrics);

    const spec = buildCompositionSpec(prompt, rawStyleTags, seed);
    const vocalBadge = instrumental ? "Instrumental" : "AI Vocals + Choir";
    const displayStyleTags =
      rawStyleTags ||
      `${spec.bpm} BPM • ${spec.scale} • ${spec.leadTimbre} • ${vocalBadge}`;

    // 2. Build Cover Art URLs (Pollinations.ai + local proxy with fallback)
    const visualPrompt = buildVisualCoverPrompt(prompt, rawStyleTags, title);
    const remoteCoverUrl = getPollinationsCoverUrl(visualPrompt, seed);
    const coverUrl = getLocalProxyCoverUrl(
      visualPrompt,
      title,
      displayStyleTags,
      seed
    );

    let audioUrl = "";
    let duration = 20;
    let source: "suno-mcp" | "open-vocal-ai" | "demo-synth" = "open-vocal-ai";
    let mcpNotice: string | undefined;

    // 3. Tier A: If user supplied a Suno MCP token, try Suno MCP first
    const hasExplicitToken = Boolean(
      (body.mcpToken && body.mcpToken.trim()) ||
        (process.env.SUNO_MCP_TOKEN && process.env.SUNO_MCP_TOKEN.trim())
    );

    if (hasExplicitToken && !body.forceMock) {
      try {
        const mcpResult = await generateTrackViaSunoMcp({
          prompt,
          title,
          styleTags: rawStyleTags || undefined,
          instrumental,
          customLyrics: lyrics || undefined,
          mcpToken: body.mcpToken,
        });
        audioUrl = mcpResult.audioUrl;
        duration = mcpResult.duration;
        source = "suno-mcp";
      } catch {
        // Proceed to keyless open-source vocal AI
      }
    }

    // 4. Tier B: Try Free, No-Login Open-Source Suno Alternatives (ACE-Step & DiffRhythm on Hugging Face)
    if (!audioUrl && !body.forceMock) {
      const openVocalResult = await tryFreeOpenSourceVocalModels({
        prompt,
        styleTags: rawStyleTags,
        lyrics,
        instrumental,
        seed,
      });

      if (openVocalResult) {
        audioUrl = openVocalResult.audioUrl;
        duration = openVocalResult.duration;
        source = "open-vocal-ai";
        mcpNotice = `Generated full vocal song via ${openVocalResult.providerName} (Free, No Login).`;
      }
    }

    // 5. Tier C: Guaranteed Instant Vocaloid Formant Singer + Multi-Instrument Synth + Live Neural Voice
    if (!audioUrl) {
      const audioParams = new URLSearchParams({
        prompt,
        style: rawStyleTags,
        seed: String(seed),
        vocals: instrumental ? "0" : "1",
      });
      audioUrl = `/api/mock-audio?${audioParams.toString()}`;
      duration = 20;
      source = "demo-synth";
      mcpNotice = instrumental
        ? `Composed custom ${spec.bpm} BPM ${spec.scale} instrumental (${spec.leadTimbre} + ${spec.drumGroove}).`
        : `Composed custom ${spec.bpm} BPM ${spec.scale} track with Formant Vocaloid Choir + AI Neural Voice Lyrics (No Login Required).`;
    }

    const track: Track = {
      id: `trk_${Date.now()}_${seed}`,
      title,
      prompt,
      visualPrompt,
      styleTags: displayStyleTags,
      instrumental,
      customLyrics: lyrics || undefined,
      audioUrl,
      coverUrl,
      remoteCoverUrl,
      duration,
      createdAt: new Date().toISOString(),
      source,
      mcpNotice,
      seed,
    };

    return NextResponse.json({ track });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
