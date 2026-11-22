# Vibe — AI Vocal Music & Cover Art Studio

A full-stack & static-compatible Next.js web application that takes a prompt or short description, generates a custom music track with **AI Singing Vocals & Lyrics** (no login or API key required), renders matching album cover art via **Pollinations.ai (Flux)**, and lets you play/keep tracks in a persistent on-page studio player or download the `.wav` audio and cover artwork.

## Features
- **Prompt-to-Song & Cover Art:** Enter a short description, optional title, style tags, and instrumental toggle.
- **Expressive AI Singing Vocals (Zero Login):** Supports multiple singing voice models (`Warm Breeze`, `Salut d'Amour`, `Soulful Tenor`, `Sunshine Soon`, `Glorious Choir`, `OpenAI Nova`, `OpenAI Onyx`) plus open-source vocal models (`ACE-Step` / `DiffRhythm`) and optional `https://api.suno.com/mcp` integration.
- **Free Cover Art Generation:** Uses Pollinations.ai (`https://image.pollinations.ai/prompt/...`) with an offline-safe high-res SVG album cover fallback.
- **100% GitHub Pages & Local Dev Compatible:** Runs both as a full Next.js server (`npm run dev`) and as a pure client-side static export on **GitHub Pages** via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

