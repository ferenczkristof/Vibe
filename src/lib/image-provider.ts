/**
 * Free Cover Art Generation via Pollinations.ai (zero API key required, powered by Flux).
 * Also builds a local proxy URL (/api/cover) so CORS, caching, and offline/sandboxed fallback
 * work seamlessly everywhere.
 */

export function buildVisualCoverPrompt(
  musicPrompt: string,
  styleTags?: string,
  title?: string
): string {
  const base = musicPrompt.trim();
  const stylePart = styleTags?.trim() ? `, ${styleTags.trim()} aesthetic` : "";
  const titlePart = title?.trim() ? `, inspired by "${title.trim()}"` : "";

  return `Square vinyl album cover artwork for "${base}"${stylePart}${titlePart}, cinematic lighting, ultra-detailed digital art, vibrant atmosphere, no text watermarks, 8k resolution`;
}

export function getPollinationsCoverUrl(visualPrompt: string, seed: number): string {
  const baseUrl =
    process.env.POLLINATIONS_BASE_URL || "https://image.pollinations.ai/prompt";
  const encoded = encodeURIComponent(visualPrompt);
  return `${baseUrl}/${encoded}?width=1024&height=1024&nologo=true&seed=${seed}&model=flux`;
}

export function getLocalProxyCoverUrl(
  visualPrompt: string,
  title: string,
  styleTags: string,
  seed: number
): string {
  const params = new URLSearchParams({
    prompt: visualPrompt,
    title,
    style: styleTags,
    seed: String(seed),
  });
  return `/api/cover?${params.toString()}`;
}

/**
 * Generates a high-resolution artistic SVG album cover if Pollinations.ai is unreachable
 * (e.g., when offline or inside an isolated network sandbox).
 */
export function generateArtisticSvgCover(
  title: string,
  prompt: string,
  styleTags: string,
  seed: number
): string {
  const palettes = [
    ["#0f0c29", "#302b63", "#ff007f", "#00f2fe"],
    ["#090d16", "#1e3c72", "#f857a6", "#ff5858"],
    ["#0a0f0d", "#134e5e", "#71b280", "#f7b733"],
    ["#140826", "#4b1248", "#f0c27b", "#ff4b1f"],
    ["#050811", "#1d2b64", "#f8cdda", "#38ef7d"],
  ];

  const pal = palettes[Math.abs(seed) % palettes.length];
  const angle = (seed * 37) % 360;
  const cx1 = 220 + ((seed * 13) % 580);
  const cy1 = 200 + ((seed * 29) % 420);
  const cx2 = 300 + ((seed * 53) % 450);
  const cy2 = 350 + ((seed * 71) % 400);

  const safeTitle = escapeXml(title || "AI Studio Track").slice(0, 32);
  const safeStyle = escapeXml(styleTags || "SUNO MCP × POLLINATIONS AI")
    .toUpperCase()
    .slice(0, 44);
  const safePrompt = escapeXml(prompt).slice(0, 68);

  // Waveform / equalizer bars
  let bars = "";
  for (let i = 0; i < 36; i++) {
    const h = 30 + ((Math.sin(i * 0.55 + seed) + 1) * 0.5 * 140 + ((seed * (i + 3)) % 55));
    const x = 140 + i * 21;
    const y = 620 - h / 2;
    bars += `<rect x="${x}" y="${y.toFixed(1)}" width="12" height="${h.toFixed(1)}" rx="6" fill="url(#accentGrad)" opacity="0.82" />`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="bgGrad" gradientTransform="rotate(${angle})">
      <stop offset="0%" stop-color="${pal[0]}" />
      <stop offset="55%" stop-color="${pal[1]}" />
      <stop offset="100%" stop-color="${pal[0]}" />
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${pal[2]}" />
      <stop offset="100%" stop-color="${pal[3]}" />
    </linearGradient>
    <radialGradient id="orb1" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${pal[2]}" stop-opacity="0.65" />
      <stop offset="100%" stop-color="${pal[2]}" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="orb2" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${pal[3]}" stop-opacity="0.55" />
      <stop offset="100%" stop-color="${pal[3]}" stop-opacity="0" />
    </radialGradient>
  </defs>

  <rect width="1024" height="1024" fill="url(#bgGrad)" />
  <circle cx="${cx1}" cy="${cy1}" r="420" fill="url(#orb1)" />
  <circle cx="${cx2}" cy="${cy2}" r="380" fill="url(#orb2)" />

  <!-- Concentric vinyl / studio rings -->
  <circle cx="512" cy="440" r="290" fill="none" stroke="${pal[3]}" stroke-opacity="0.16" stroke-width="2" />
  <circle cx="512" cy="440" r="220" fill="none" stroke="${pal[2]}" stroke-opacity="0.24" stroke-width="2" stroke-dasharray="12 8" />
  <circle cx="512" cy="440" r="145" fill="none" stroke="url(#accentGrad)" stroke-opacity="0.4" stroke-width="3" />

  <!-- Soundwave visualization -->
  ${bars}

  <!-- Album Typography -->
  <rect x="88" y="760" width="848" height="184" rx="24" fill="#070913" fill-opacity="0.68" stroke="#ffffff" stroke-opacity="0.14" stroke-width="2" />
  <text x="132" y="815" fill="${pal[3]}" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" letter-spacing="4">${safeStyle}</text>
  <text x="132" y="872" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="46" font-weight="800">${safeTitle}</text>
  <text x="132" y="914" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="400">${safePrompt}</text>
</svg>`;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
