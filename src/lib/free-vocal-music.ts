/**
 * Free, Zero-Login / Zero-Token Suno Alternatives for Vocal Music Generation:
 * 1. Open-source full-song vocal models hosted on public Hugging Face Spaces:
 *    - ACE-Step (https://ace-step-ace-step.hf.space)
 *    - DiffRhythm (https://aslp-lab-diffrhythm.hf.space)
 * 2. Free AI Lyric Generator via Pollinations Text API (https://text.pollinations.ai)
 *    with instant local prompt-aware lyric fallback.
 */

export interface FreeVocalSongResult {
  audioUrl: string;
  lyrics: string;
  providerName: string;
  duration: number;
}

/**
 * Generates catchy song lyrics from a user's prompt using Pollinations' free keyless LLM API,
 * with an instant local fallback if offline or rate-limited.
 */
export async function generateLyricsForPrompt(
  prompt: string,
  styleTags?: string,
  existingLyrics?: string
): Promise<string> {
  if (existingLyrics && existingLyrics.trim().length > 0) {
    return existingLyrics.trim();
  }

  const systemInstruction = `Write short, catchy 6-line song lyrics (1 Verse and 1 Chorus) about: "${prompt}". Style: ${
    styleTags || "modern music"
  }. Output ONLY the lyrics with [Verse] and [Chorus] headers, no commentary.`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const url = `https://text.pollinations.ai/${encodeURIComponent(
      systemInstruction
    )}?model=openai`;

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "SunoCoverStudio/1.0" },
    });
    clearTimeout(timer);

    if (res.ok) {
      const text = (await res.text()).trim();
      if (text.length > 20 && text.length < 1500 && !text.startsWith("<!DOCTYPE")) {
        return text;
      }
    }
  } catch {
    // Fall back to local prompt-aware lyric composer
  }

  return buildLocalLyricsFromPrompt(prompt);
}

function buildLocalLyricsFromPrompt(prompt: string): string {
  const words = prompt
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !/^(with|that|from|this|make|song|music|beat|track)$/i.test(w));

  const w1 = words[0] ? words[0].toLowerCase() : "midnight";
  const w2 = words[1] ? words[1].toLowerCase() : "shadows";
  const w3 = words[2] ? words[2].toLowerCase() : "horizon";

  return `[Verse]
Caught inside the ${w1}, chasing every sound
Echoes of the ${w2} rising from the ground
Every heartbeat glowing brighter in the night
Following the rhythm into ${w3} light

[Chorus]
We are singing through the ${w1}
Dancing where the ${w2} shine
Turn the music louder now
Leave the quiet world behind`;
}

/**
 * Helper to call a Gradio 4/5 public Space without an API key or login.
 */
async function callGradioSpaceEndpoint(
  spaceBaseUrl: string,
  endpointName: string,
  dataPayload: unknown[],
  timeoutMs = 14000
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Gradio 5 /gradio_api/call/<endpoint>
    const callUrl = `${spaceBaseUrl}/gradio_api/call/${endpointName.replace(/^\//, "")}`;
    const postRes = await fetch(callUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: dataPayload }),
      signal: controller.signal,
    });

    if (!postRes.ok) {
      return null;
    }

    const postJson = (await postRes.json()) as { event_id?: string };
    if (!postJson.event_id) return null;

    // Stream SSE result from /gradio_api/call/<endpoint>/<event_id>
    const sseRes = await fetch(`${callUrl}/${postJson.event_id}`, {
      signal: controller.signal,
      headers: { Accept: "text/event-stream" },
    });

    if (!sseRes.ok || !sseRes.body) return null;

    const text = await sseRes.text();
    // Look for "event: complete\ndata: [...]"
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("event: complete") && lines[i + 1]?.startsWith("data:")) {
        const rawData = lines[i + 1].slice(5).trim();
        // Extract URL or path from JSON
        const urlMatch = rawData.match(/https?:\/\/[^\s"'<>]+?\.(?:wav|mp3|ogg|flac)/i);
        if (urlMatch) return urlMatch[0];

        const pathMatch = rawData.match(/"path"\s*:\s*"([^"]+\.(?:wav|mp3|ogg|flac))"/i);
        if (pathMatch) {
          return `${spaceBaseUrl}/gradio_api/file=${encodeURIComponent(pathMatch[1])}`;
        }
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Attempts to generate a full song with vocals using open-source, no-login Suno alternatives
 * hosted on public Hugging Face Spaces (ACE-Step and DiffRhythm).
 */
export async function tryFreeOpenSourceVocalModels(params: {
  prompt: string;
  styleTags: string;
  lyrics: string;
  instrumental: boolean;
  seed: number;
}): Promise<FreeVocalSongResult | null> {
  const tags = params.styleTags
    ? `${params.prompt}, ${params.styleTags}`
    : `${params.prompt}, vocals, full song`;

  const lyricsToUse = params.instrumental ? "[Instrumental]" : params.lyrics;

  // 1. Try ACE-Step (Open-Source Suno Alternative with Vocals)
  const aceUrl = await callGradioSpaceEndpoint(
    "https://ace-step-ace-step.hf.space",
    "text2music",
    [tags, lyricsToUse, 30, params.seed],
    12000
  );

  if (aceUrl) {
    return {
      audioUrl: aceUrl,
      lyrics: params.lyrics,
      providerName: "ACE-Step Open Vocal AI",
      duration: 30,
    };
  }

  // 2. Try DiffRhythm (End-to-End Latent Diffusion Vocal Song Generator)
  const diffUrl = await callGradioSpaceEndpoint(
    "https://aslp-lab-diffrhythm.hf.space",
    "predict",
    [lyricsToUse, tags],
    10000
  );

  if (diffUrl) {
    return {
      audioUrl: diffUrl,
      lyrics: params.lyrics,
      providerName: "DiffRhythm Vocal AI",
      duration: 30,
    };
  }

  return null;
}
