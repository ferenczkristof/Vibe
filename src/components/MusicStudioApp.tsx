"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Disc3,
  Download,
  Image as ImageIcon,
  Loader2,
  Mic,
  MicOff,
  Music,
  Pause,
  Play,
  PlusCircle,
  Radio,
  RefreshCw,
  Settings,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  Wand2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { McpStatusResponse, Track } from "@/lib/types";
import {
  createBrowserWavBlobUrl,
  createSvgCoverDataUrl,
  generateTrackClientSide,
  resolveClientVocalAudioUrl,
} from "@/lib/client-studio";

const STORAGE_KEY = "suno_pollinations_studio_tracks_v4";
const TOKEN_STORAGE_KEY = "suno_mcp_oauth_token_v1";

const DEFAULT_STARTER_TRACKS: Track[] = [
  {
    id: "trk_starter_acoustic_pop",
    title: "Golden Hour Acoustic",
    prompt:
      "Warm acoustic guitar and piano indie song with heartfelt vocals and a gentle sunny afternoon groove",
    visualPrompt:
      'Square vinyl album cover artwork for "Warm acoustic guitar and piano indie song with heartfelt vocals and a gentle sunny afternoon groove", warm golden hour lighting, acoustic indie aesthetic, 8k',
    styleTags: "108 BPM • major-pentatonic • pluck-guitar • AI Singing Vocals",
    instrumental: false,
    customLyrics: `[Verse]
Sunlight falling through the open door
Footsteps dancing on the wooden floor
Strumming every chord until the evening fades
Walking through the memories that we have made

[Chorus]
Stay right here inside the golden light
Everything is gonna be alright
Sing it loud and let the melody fly
Underneath the painted summer sky`,
    audioUrl:
      "/api/mock-audio?prompt=acoustic+guitar+sunny+indie+pop+piano&style=acoustic+indie&seed=551234&vocals=1",
    coverUrl:
      "https://image.pollinations.ai/prompt/Square%20vinyl%20album%20cover%20for%20Golden%20Hour%20Acoustic%20warm%20sunset%20guitar?width=1024&height=1024&nologo=true&seed=551234&model=flux",
    remoteCoverUrl:
      "https://image.pollinations.ai/prompt/Square%20vinyl%20album%20cover%20for%20Golden%20Hour%20Acoustic%20warm%20sunset%20guitar?width=1024&height=1024&nologo=true&seed=551234&model=flux",
    duration: 20,
    createdAt: new Date().toISOString(),
    source: "demo-synth",
    seed: 551234,
  },
  {
    id: "trk_starter_lofi",
    title: "Rainy Tokyo Coffeehouse",
    prompt:
      "Warm cozy lo-fi chillhop beats with Rhodes electric piano chords on a rainy afternoon",
    visualPrompt:
      'Square vinyl album cover artwork for "Warm cozy lo-fi chillhop beats with Rhodes electric piano chords on a rainy afternoon", lo-fi chillhop aesthetic, anime window rain, warm lamp light',
    styleTags: "80 BPM • dorian • fm-epiano • AI Singing Vocals",
    instrumental: false,
    customLyrics: `[Verse]
Raindrops tapping softly on the window pane
Warm cup of coffee in the afternoon rain
Pages turning slowly while the city sleeps
Every quiet memory that the music keeps

[Chorus]
Stay a little longer in the golden glow
Let the gentle rhythm take it nice and slow`,
    audioUrl:
      "/api/mock-audio?prompt=lofi+chill+rain+rhodes+coffeehouse&style=lofi+chill&seed=319842&vocals=1",
    coverUrl:
      "https://image.pollinations.ai/prompt/Square%20vinyl%20album%20cover%20for%20Rainy%20Tokyo%20Coffeehouse%20cozy%20lofi%20anime%20window?width=1024&height=1024&nologo=true&seed=319842&model=flux",
    remoteCoverUrl:
      "https://image.pollinations.ai/prompt/Square%20vinyl%20album%20cover%20for%20Rainy%20Tokyo%20Coffeehouse%20cozy%20lofi%20anime%20window?width=1024&height=1024&nologo=true&seed=319842&model=flux",
    duration: 20,
    createdAt: new Date().toISOString(),
    source: "demo-synth",
    seed: 319842,
  },
];

const QUICK_PROMPTS = [
  {
    label: "Heavy Rock Anthem (Vocals)",
    prompt:
      "Aggressive overdriven electric guitar rock song with powerful vocals, heavy punchy drums, and driving bass",
    style: "rock, electric guitar, distortion, 145 bpm",
    title: "Voltage Overdrive",
  },
  {
    label: "Dark Trap 808 (Rap/Vocals)",
    prompt:
      "Hard-hitting dark trap song with booming 808 sub bass, hypnotic vocal flow, eerie bell melody, and fast hi-hat rolls",
    style: "trap, 808 bass, dark bells, 140 bpm",
    title: "Shadow Phantom",
  },
  {
    label: "8-Bit Boss Battle",
    prompt:
      "Fast retro 8-bit chiptune arcade boss battle song with frantic square wave arpeggios and cyber vocals",
    style: "8-bit, chiptune, retro game, 152 bpm",
    title: "Pixel Dungeon Boss",
  },
  {
    label: "Cozy Lo-Fi Song",
    prompt:
      "Relaxing lo-fi hip hop song with soft dreamy vocals, jazzy electric piano chords, warm sub bass, and rain vinyl crackle",
    style: "lo-fi, chillhop, jazzy rhodes, 80 bpm",
    title: "Velvet Raindrops",
  },
  {
    label: "Cinematic Ballad",
    prompt:
      "Emotional cinematic orchestral strings and sad piano ballad with angelic choir vocals and deep taiko percussion",
    style: "cinematic, orchestral strings,female vocals, 76 bpm",
    title: "Last Starfall",
  },
  {
    label: "Jungle Drum & Bass",
    prompt:
      "High-speed liquid drum and bass breakbeat anthem with soaring vocal hooks and lush atmospheric pads",
    style: "dnb, breakbeat, jungle, 170 bpm",
    title: "Velocity Protocol",
  },
];

function formatSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export default function MusicStudioApp() {
  // Composer state
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [styleTags, setStyleTags] = useState("");
  const [instrumental, setInstrumental] = useState(false);
  const [customLyrics, setCustomLyrics] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Generation progress state
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioStepStatus, setAudioStepStatus] = useState<
    "idle" | "working" | "done" | "error"
  >("idle");
  const [coverStepStatus, setCoverStepStatus] = useState<
    "idle" | "working" | "done" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // MCP Settings & Status
  const [mcpStatus, setMcpStatus] = useState<McpStatusResponse | null>(null);
  const [mcpToken, setMcpToken] = useState("");
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isCheckingMcp, setIsCheckingMcp] = useState(false);

  // Track Library & Active Player State
  const [tracks, setTracks] = useState<Track[]>(DEFAULT_STARTER_TRACKS);
  const [currentTrackId, setCurrentTrackId] = useState<string>(
    DEFAULT_STARTER_TRACKS[0].id
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(20);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [neuralVoiceEnabled, setNeuralVoiceEnabled] = useState(true);
  const [selectedSinger, setSelectedSinger] = useState<string>("auto");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const vocalAudioRef = useRef<HTMLAudioElement | null>(null);

  const currentTrack =
    tracks.find((t) => t.id === currentTrackId) || tracks[0] || null;

  const buildVocalStreamUrl = (track: Track, singerOverride?: string) => {
    const params = new URLSearchParams({
      lyrics: track.customLyrics || track.prompt,
      prompt: track.prompt,
      style: track.styleTags,
      seed: String(track.seed || 1024),
      singer: singerOverride || selectedSinger,
    });
    return `/api/vocals?${params.toString()}`;
  };

  // Hydrate saved tracks & token from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Track[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTracks(parsed);
          setCurrentTrackId(parsed[0].id);
        }
      }
      const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (savedToken) {
        setMcpToken(savedToken);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  // Persist tracks to localStorage whenever updated
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tracks));
    } catch {
      // ignore quota errors
    }
  }, [tracks]);

  // Synchronized AI Singing Voice Stream (works both via /api/vocals and directly in browser on GitHub Pages)
  const triggerNeuralVocals = async (track: Track, singerOverride?: string) => {
    const vAudio = vocalAudioRef.current;
    if (!vAudio) return;

    vAudio.pause();

    if (
      !neuralVoiceEnabled ||
      isMuted ||
      track.instrumental ||
      !track.customLyrics ||
      track.source !== "demo-synth"
    ) {
      return;
    }

    const singerToUse = singerOverride || selectedSinger;
    const vocalKey = `${track.id}_${singerToUse}`;

    if (vAudio.getAttribute("data-vocal-key") !== vocalKey) {
      const resolvedUrl = await resolveClientVocalAudioUrl(track, singerToUse);
      if (!resolvedUrl) return;
      vAudio.src = resolvedUrl;
      vAudio.setAttribute("data-vocal-key", vocalKey);
      vAudio.load();
    } else {
      vAudio.currentTime = 0;
    }

    vAudio.volume = Math.min(1, volume * 0.95);
    vAudio.play().catch(() => {
      // ignore autoplay block if any
    });
  };

  const stopNeuralVocals = () => {
    if (vocalAudioRef.current) {
      vocalAudioRef.current.pause();
    }
  };

  useEffect(() => {
    return () => stopNeuralVocals();
  }, []);

  // Check Suno MCP Status on mount
  const fetchMcpStatus = async (tokenOverride?: string) => {
    setIsCheckingMcp(true);
    try {
      const tokenToUse = tokenOverride !== undefined ? tokenOverride : mcpToken;
      const res = await fetch("/api/mcp-status", {
        headers: tokenToUse ? { "x-suno-mcp-token": tokenToUse } : {},
      });
      if (res.ok) {
        const data = (await res.json()) as McpStatusResponse;
        setMcpStatus(data);
      }
    } catch {
      // ignore network error
    } finally {
      setIsCheckingMcp(false);
    }
  };

  useEffect(() => {
    fetchMcpStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync audio element when currentTrack changes (with client-side WAV synthesis fallback for GitHub Pages)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    const currentSrc = audio.getAttribute("data-track-id");
    if (currentSrc !== currentTrack.id) {
      audio.pause();
      stopNeuralVocals();

      let playableUrl = currentTrack.audioUrl;
      if (playableUrl.startsWith("/api/mock-audio")) {
        playableUrl = createBrowserWavBlobUrl(
          currentTrack.prompt,
          currentTrack.styleTags,
          currentTrack.seed || 1024,
          !currentTrack.instrumental
        );
      }

      audio.src = playableUrl;
      audio.setAttribute("data-track-id", currentTrack.id);
      audio.load();
      setCurrentTime(0);
      setDuration(currentTrack.duration || 20);
      if (isPlaying) {
        audio
          .play()
          .then(() => {
            setIsPlaying(true);
            triggerNeuralVocals(currentTrack);
          })
          .catch(() => setIsPlaying(false));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack, isPlaying]);

  // Sync volume & mute
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
    if (vocalAudioRef.current) {
      vocalAudioRef.current.volume = isMuted ? 0 : Math.min(1, volume * 0.95);
    }
    if (isMuted) stopNeuralVocals();
  }, [volume, isMuted]);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    if (isPlaying) {
      audio.pause();
      stopNeuralVocals();
      setIsPlaying(false);
    } else {
      audio
        .play()
        .then(() => {
          setIsPlaying(true);
          triggerNeuralVocals(currentTrack);
        })
        .catch(() => setIsPlaying(false));
    }
  };

  const selectAndPlayTrack = (track: Track) => {
    if (currentTrack?.id === track.id) {
      togglePlayPause();
      return;
    }
    setCurrentTrackId(track.id);
    setIsPlaying(true);
  };

  const handlePrevTrack = () => {
    if (tracks.length === 0) return;
    const idx = tracks.findIndex((t) => t.id === currentTrack?.id);
    const prevIdx = idx <= 0 ? tracks.length - 1 : idx - 1;
    setCurrentTrackId(tracks[prevIdx].id);
    setIsPlaying(true);
  };

  const handleNextTrack = () => {
    if (tracks.length === 0) return;
    const idx = tracks.findIndex((t) => t.id === currentTrack?.id);
    const nextIdx = idx < 0 || idx >= tracks.length - 1 ? 0 : idx + 1;
    setCurrentTrackId(tracks[nextIdx].id);
    setIsPlaying(true);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const handleDeleteTrack = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTracks((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (currentTrackId === id && next.length > 0) {
        setCurrentTrackId(next[0].id);
        setIsPlaying(false);
        stopNeuralVocals();
      }
      return next;
    });
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      setErrorMessage("Please enter a prompt or short description for your song.");
      return;
    }

    setErrorMessage(null);
    setIsGenerating(true);
    setAudioStepStatus("working");
    setCoverStepStatus("working");

    try {
      let newTrack: Track | null = null;

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: prompt.trim(),
            title: title.trim() || undefined,
            styleTags: styleTags.trim() || undefined,
            instrumental,
            customLyrics: customLyrics.trim() || undefined,
            mcpToken: mcpToken.trim() || undefined,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.track) {
            newTrack = data.track;
          }
        }
      } catch {
        // Running on static host (GitHub Pages) — fall back to browser-side engine
      }

      if (!newTrack) {
        newTrack = await generateTrackClientSide({
          prompt: prompt.trim(),
          title: title.trim() || undefined,
          styleTags: styleTags.trim() || undefined,
          instrumental,
          customLyrics: customLyrics.trim() || undefined,
        });
      }

      setCoverStepStatus("done");
      setAudioStepStatus("done");

      setTracks((prev) => [newTrack, ...prev]);
      setCurrentTrackId(newTrack.id);
      setIsPlaying(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Generation failed.";
      setErrorMessage(msg);
      setAudioStepStatus("error");
      setCoverStepStatus("error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadAudio = (track: Track, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const safeTitle = track.title.replace(/[^a-zA-Z0-9_-]/g, "_") || "track";
    const blobUrl = createBrowserWavBlobUrl(
      track.prompt,
      track.styleTags,
      track.seed || 1024,
      !track.instrumental
    );
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `${safeTitle}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadCover = async (track: Track, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const safeTitle = track.title.replace(/[^a-zA-Z0-9_-]/g, "_") || "cover";
    try {
      const res = await fetch(track.remoteCoverUrl || track.coverUrl);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${safeTitle}-cover.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }
    } catch {
      // Fall back to SVG cover download
    }
    const svgUrl = createSvgCoverDataUrl(
      track.title,
      track.prompt,
      track.styleTags,
      track.seed || 1024
    );
    const a = document.createElement("a");
    a.href = svgUrl;
    a.download = `${safeTitle}-cover.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="min-h-screen flex flex-col pb-32 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/40 via-[#070912] to-[#05060b]">
      {/* Hidden HTML5 Audio Engines (Backing Music + AI Singing Voice Stream) */}
      <audio ref={vocalAudioRef} preload="auto" />
      <audio
        ref={audioRef}
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (
            audioRef.current &&
            Number.isFinite(audioRef.current.duration) &&
            audioRef.current.duration > 0
          ) {
            setDuration(audioRef.current.duration);
          }
        }}
        onEnded={() => {
          setIsPlaying(false);
          stopNeuralVocals();
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => {
          setIsPlaying(false);
          stopNeuralVocals();
        }}
      />

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#070912]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-500 via-fuchsia-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-rose-500/20">
              <Disc3 className="w-6 h-6 text-white animate-[spin_10s_linear_infinite]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">
                  AI Vocal Music & Cover Studio
                </h1>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  No Login / Free Vocals
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                ACE-Step / DiffRhythm / Vocaloid Choir + Pollinations AI Cover Art
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <select
              aria-label="Select AI Singing Voice"
              value={selectedSinger}
              onChange={(e) => {
                const nextSinger = e.target.value;
                setSelectedSinger(nextSinger);
                if (isPlaying && currentTrack) {
                  triggerNeuralVocals(currentTrack, nextSinger);
                }
              }}
              className="rounded-lg text-xs font-medium bg-slate-900 border border-white/15 text-slate-200 px-2.5 py-1.5 outline-none focus:border-rose-500"
            >
              <option value="auto">🎤 Singer: Auto-Match Genre</option>
              <option value="en_female_f08_warmy_breeze">
                🎤 Warm Breeze (Female Pop Singer)
              </option>
              <option value="en_female_f08_salut_damour">
                🎤 Salut d&apos;Amour (Female Indie/Alto Singer)
              </option>
              <option value="en_male_m03_lobby">
                🎤 Soulful Tenor (Male Melodic Singer)
              </option>
              <option value="en_male_m03_sunshine_soon">
                🎤 Sunshine Soon (Male Upbeat Singer)
              </option>
              <option value="en_female_ht_f08_glorious">
                🎤 Glorious Choir (Cinematic Singer)
              </option>
              <option value="openai_nova">
                🎙️ OpenAI Nova (Expressive Female)
              </option>
              <option value="openai_onyx">
                🎙️ OpenAI Onyx (Deep Male)
              </option>
            </select>

            <button
              type="button"
              onClick={() => {
                setNeuralVoiceEnabled((v) => {
                  const next = !v;
                  if (!next) stopNeuralVocals();
                  else if (isPlaying && currentTrack) triggerNeuralVocals(currentTrack);
                  return next;
                });
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                neuralVoiceEnabled
                  ? "bg-rose-500/20 border-rose-500/40 text-rose-200"
                  : "bg-white/5 border-white/10 text-slate-400"
              }`}
              title="Toggle AI Singing Voice layer"
            >
              {neuralVoiceEnabled ? (
                <Mic className="w-3.5 h-3.5 text-rose-400" />
              ) : (
                <MicOff className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span className="hidden sm:inline">
                Vocals: {neuralVoiceEnabled ? "ON" : "OFF"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 transition"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
              <span className="hidden md:inline">Keyless Vocal AI Active</span>
              <Settings className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Prompt Composer (5 cols) */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-rose-400" />
                <h2 className="text-base font-semibold text-white">
                  Create Song (with Voice) & Cover Art
                </h2>
              </div>
              <span className="text-xs text-emerald-400 font-medium">
                Zero Login
              </span>
            </div>

            {/* Quick Idea Pills */}
            <div className="mb-4">
              <p className="text-xs font-medium text-slate-400 mb-2">
                Try an instant vocal genre preset:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PROMPTS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setPrompt(preset.prompt);
                      setStyleTags(preset.style);
                      setTitle(preset.title);
                    }}
                    className="text-xs px-2.5 py-1 rounded-full bg-white/5 hover:bg-rose-500/20 hover:text-rose-200 border border-white/10 hover:border-rose-500/40 text-slate-300 transition"
                  >
                    + {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleGenerate} className="space-y-4">
              <div>
                <label
                  htmlFor="song-prompt"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5"
                >
                  Song Prompt / Short Description *
                </label>
                <textarea
                  id="song-prompt"
                  rows={4}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the song mood, topic, instruments, and vocal style... AI lyrics, singing vocals, music, and album cover art will all be generated automatically!"
                  className="w-full rounded-xl bg-slate-950/80 border border-white/15 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="track-title"
                    className="block text-xs font-medium text-slate-300 mb-1"
                  >
                    Track Title (Optional)
                  </label>
                  <input
                    id="track-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Auto-named if blank"
                    className="w-full rounded-xl bg-slate-950/80 border border-white/15 focus:border-rose-500 px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="style-tags"
                    className="block text-xs font-medium text-slate-300 mb-1"
                  >
                    Musical Style (Optional)
                  </label>
                  <input
                    id="style-tags"
                    type="text"
                    value={styleTags}
                    onChange={(e) => setStyleTags(e.target.value)}
                    placeholder="Auto-detected from prompt"
                    className="w-full rounded-xl bg-slate-950/80 border border-white/15 focus:border-rose-500 px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none"
                  />
                </div>
              </div>

              {/* Instrumental & Custom Lyrics Toggle */}
              <div className="flex items-center justify-between pt-1">
                <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={instrumental}
                    onChange={(e) => setInstrumental(e.target.checked)}
                    className="w-4 h-4 rounded accent-rose-500"
                  />
                  <span className="text-xs font-medium text-slate-300">
                    Instrumental Only (disable vocals & lyrics)
                  </span>
                </label>

                {!instrumental && (
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="text-xs text-rose-400 hover:text-rose-300 font-medium"
                  >
                    {showAdvanced
                      ? "Hide Custom Lyrics"
                      : "+ Write Own Lyrics (Optional)"}
                  </button>
                )}
              </div>

              {showAdvanced && !instrumental && (
                <div>
                  <label
                    htmlFor="custom-lyrics"
                    className="block text-xs font-medium text-slate-300 mb-1"
                  >
                    Custom Lyrics (Leave blank to auto-write lyrics with AI)
                  </label>
                  <textarea
                    id="custom-lyrics"
                    rows={3}
                    value={customLyrics}
                    onChange={(e) => setCustomLyrics(e.target.value)}
                    placeholder="[Verse]&#10;Walking through the neon glow...&#10;[Chorus]&#10;We are electric tonight..."
                    className="w-full rounded-xl bg-slate-950/80 border border-white/15 focus:border-rose-500 px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none"
                  />
                </div>
              )}

              {errorMessage && (
                <div className="rounded-xl bg-rose-500/15 border border-rose-500/30 p-3 flex items-start gap-2.5 text-xs text-rose-200">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isGenerating}
                className="w-full py-3 px-4 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-rose-500 via-fuchsia-600 to-indigo-600 hover:from-rose-400 hover:via-fuchsia-500 hover:to-indigo-500 disabled:opacity-60 shadow-lg shadow-rose-500/25 flex items-center justify-center gap-2 transition cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Composing Vocals, Music & Cover Art...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate Vocal Song & Cover Picture</span>
                  </>
                )}
              </button>
            </form>

            {/* Parallel Pipeline Status Indicator */}
            {(isGenerating || audioStepStatus === "done") && (
              <div className="mt-5 pt-4 border-t border-white/10 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 flex items-center gap-2.5">
                  {audioStepStatus === "working" ? (
                    <Loader2 className="w-4 h-4 text-rose-400 animate-spin shrink-0" />
                  ) : audioStepStatus === "done" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <Music className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">
                      Vocal & Music AI
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {audioStepStatus === "working"
                        ? "Writing lyrics & vocals..."
                        : "Ready in player"}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 flex items-center gap-2.5">
                  {coverStepStatus === "working" ? (
                    <Loader2 className="w-4 h-4 text-fuchsia-400 animate-spin shrink-0" />
                  ) : coverStepStatus === "done" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <ImageIcon className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">
                      Pollinations AI Cover
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {coverStepStatus === "working"
                        ? "Rendering artwork..."
                        : "Artwork rendered"}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Featured Now Playing Stage + Persistent Library (7 cols) */}
        <section className="lg:col-span-7 flex flex-col gap-6">
          {/* Active Track Showcase Card */}
          {currentTrack && (
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-xl p-6 shadow-2xl">
              <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
                {/* Album Cover Art Showcase */}
                <div className="relative group w-56 h-56 sm:w-60 sm:h-60 rounded-2xl overflow-hidden border border-white/15 shadow-2xl shrink-0 bg-slate-950">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={currentTrack.coverUrl}
                    alt={currentTrack.title}
                    onError={(e) => {
                      const img = e.currentTarget;
                      img.onerror = null;
                      img.src = createSvgCoverDataUrl(
                        currentTrack.title,
                        currentTrack.prompt,
                        currentTrack.styleTags,
                        currentTrack.seed || 1024
                      );
                    }}
                    className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                  />
                  <button
                    type="button"
                    onClick={togglePlayPause}
                    aria-label={isPlaying ? "Pause track" : "Play track"}
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                  >
                    <div className="w-14 h-14 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-xl">
                      {isPlaying ? (
                        <Pause className="w-6 h-6" />
                      ) : (
                        <Play className="w-6 h-6 ml-0.5" />
                      )}
                    </div>
                  </button>
                </div>

                {/* Track Info, Lyrics & Download Actions */}
                <div className="flex-1 min-w-0 flex flex-col justify-between text-center sm:text-left">
                  <div>
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        {currentTrack.source === "open-vocal-ai"
                          ? "ACE-Step / DiffRhythm Vocal AI"
                          : currentTrack.source === "suno-mcp"
                          ? "Suno MCP Track"
                          : currentTrack.instrumental
                          ? "Studio Instrumental"
                          : "Vocaloid Choir + Neural Voice"}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                        Pollinations AI Cover
                      </span>
                    </div>

                    <h2 className="text-2xl font-bold text-white truncate">
                      {currentTrack.title}
                    </h2>
                    <p className="text-xs font-medium text-rose-300/90 mt-0.5">
                      {currentTrack.styleTags}
                    </p>

                    <p className="text-xs text-slate-300 mt-2.5 line-clamp-2 leading-relaxed bg-white/[0.03] border border-white/5 rounded-xl p-2.5">
                      “{currentTrack.prompt}”
                    </p>

                    {currentTrack.customLyrics && !currentTrack.instrumental && (
                      <div className="mt-2.5 rounded-xl bg-slate-950/70 border border-white/10 p-3 text-left max-h-28 overflow-y-auto">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
                            AI Generated Lyrics (Sung on Play)
                          </span>
                        </div>
                        <pre className="text-xs text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
                          {currentTrack.customLyrics}
                        </pre>
                      </div>
                    )}

                    {currentTrack.mcpNotice && (
                      <p className="text-[11px] text-emerald-300/90 mt-2">
                        {currentTrack.mcpNotice}
                      </p>
                    )}
                  </div>

                  {/* Action Buttons: Play & Downloads */}
                  <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                    <button
                      type="button"
                      onClick={togglePlayPause}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-rose-500 hover:bg-rose-400 text-white shadow-lg shadow-rose-500/25 transition cursor-pointer"
                    >
                      {isPlaying ? (
                        <>
                          <Pause className="w-4 h-4" />
                          <span>Pause Song</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          <span>Play Song with Vocals</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleDownloadAudio(currentTrack, e)}
                      className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 border border-white/15 text-white transition cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-rose-400" />
                      <span>Download Music</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleDownloadCover(currentTrack, e)}
                      className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 transition cursor-pointer"
                    >
                      <ImageIcon className="w-4 h-4 text-indigo-400" />
                      <span>Download Cover Art</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Persistent On-Page Music Library */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-xl p-6 shadow-2xl flex-1">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-semibold text-white">
                  Saved Studio Playlist ({tracks.length})
                </h3>
              </div>
              <span className="text-xs text-slate-400">
                Kept automatically on this page
              </span>
            </div>

            {tracks.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-white/10 rounded-xl">
                <PlusCircle className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <p className="text-sm text-slate-300 font-medium">
                  No tracks in your library yet
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Enter a prompt on the left to generate your first song and cover art.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {tracks.map((trk) => {
                  const isCurrent = currentTrack?.id === trk.id;
                  return (
                    <div
                      key={trk.id}
                      onClick={() => selectAndPlayTrack(trk)}
                      className={`group flex items-center gap-3.5 p-3 rounded-xl border transition cursor-pointer ${
                        isCurrent
                          ? "bg-rose-500/10 border-rose-500/40"
                          : "bg-white/[0.02] hover:bg-white/[0.06] border-white/10"
                      }`}
                    >
                      <div className="relative w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-slate-950 border border-white/10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={trk.coverUrl}
                          alt={trk.title}
                          onError={(e) => {
                            const img = e.currentTarget;
                            img.onerror = null;
                            img.src = createSvgCoverDataUrl(
                              trk.title,
                              trk.prompt,
                              trk.styleTags,
                              trk.seed || 1024
                            );
                          }}
                          className="w-full h-full object-cover"
                        />
                        <div
                          className={`absolute inset-0 bg-black/45 flex items-center justify-center transition ${
                            isCurrent
                              ? "opacity-100"
                              : "opacity-0 group-hover:opacity-100"
                          }`}
                        >
                          {isCurrent && isPlaying ? (
                            <Pause className="w-5 h-5 text-white" />
                          ) : (
                            <Play className="w-5 h-5 text-white ml-0.5" />
                          )}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-white truncate">
                            {trk.title}
                          </p>
                          {!trk.instrumental && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-rose-500/20 text-rose-300">
                              🎤 Vocals
                            </span>
                          )}
                          {isCurrent && (
                            <span className="inline-block w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                          )}
                        </div>
                        <p className="text-xs text-slate-400 truncate mt-0.5">
                          {trk.prompt}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {trk.styleTags}
                        </p>
                      </div>

                      <div
                        className="flex items-center gap-1.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={(e) => handleDownloadAudio(trk, e)}
                          title="Download Music"
                          className="p-2 rounded-lg bg-white/5 hover:bg-white/15 text-slate-200 transition cursor-pointer"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDownloadCover(trk, e)}
                          title="Download Cover Picture"
                          className="p-2 rounded-lg bg-white/5 hover:bg-white/15 text-slate-200 transition cursor-pointer"
                        >
                          <ImageIcon className="w-4 h-4" />
                        </button>
                        {tracks.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteTrack(trk.id, e)}
                            title="Remove from page"
                            className="p-2 rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Persistent Bottom Music Player Dock */}
      {currentTrack && (
        <footer className="fixed bottom-0 inset-x-0 z-40 border-t border-white/15 bg-[#090d1a]/95 backdrop-blur-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.6)]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row items-center gap-4">
            {/* Track Thumbnail & Meta */}
            <div className="flex items-center gap-3 w-full sm:w-64 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentTrack.coverUrl}
                alt={currentTrack.title}
                onError={(e) => {
                  const img = e.currentTarget;
                  img.onerror = null;
                  img.src = createSvgCoverDataUrl(
                    currentTrack.title,
                    currentTrack.prompt,
                    currentTrack.styleTags,
                    currentTrack.seed || 1024
                  );
                }}
                className="w-12 h-12 rounded-xl object-cover border border-white/15 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate">
                  {currentTrack.title}
                </p>
                <p className="text-xs text-slate-400 truncate">
                  {currentTrack.styleTags}
                </p>
              </div>
            </div>

            {/* Transport Controls + Seek Bar */}
            <div className="flex-1 w-full flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={handlePrevTrack}
                  aria-label="Previous track"
                  className="p-1.5 text-slate-400 hover:text-white transition"
                >
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={togglePlayPause}
                  aria-label={isPlaying ? "Pause" : "Play"}
                  className="w-10 h-10 rounded-full bg-gradient-to-tr from-rose-500 to-fuchsia-500 hover:from-rose-400 hover:to-fuchsia-400 text-white flex items-center justify-center shadow-lg shadow-rose-500/30 transition cursor-pointer"
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5" />
                  ) : (
                    <Play className="w-5 h-5 ml-0.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleNextTrack}
                  aria-label="Next track"
                  className="p-1.5 text-slate-400 hover:text-white transition"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              <div className="w-full max-w-xl flex items-center gap-3">
                <span className="text-[11px] font-mono text-slate-400 w-9 text-right">
                  {formatSeconds(currentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration || 20}
                  step={0.1}
                  value={Math.min(currentTime, duration || 20)}
                  onChange={handleSeek}
                  aria-label="Seek timeline"
                  className="flex-1 h-1.5 bg-white/15 rounded-lg"
                />
                <span className="text-[11px] font-mono text-slate-400 w-9">
                  {formatSeconds(duration)}
                </span>
              </div>
            </div>

            {/* Volume & Direct Download */}
            <div className="hidden md:flex items-center justify-end gap-3 w-64 shrink-0">
              <button
                type="button"
                onClick={() => setIsMuted((m) => !m)}
                aria-label={isMuted ? "Unmute" : "Mute"}
                className="text-slate-400 hover:text-white transition"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  setIsMuted(false);
                  setVolume(parseFloat(e.target.value));
                }}
                aria-label="Volume"
                className="w-20 h-1.5 bg-white/15 rounded-lg"
              />
              <button
                type="button"
                onClick={(e) => handleDownloadAudio(currentTrack, e)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>WAV</span>
              </button>
            </div>
          </div>
        </footer>
      )}

      {/* AI Vocal Engine & Optional Suno MCP Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                Zero-Login Vocal AI & Image Pipeline
              </h3>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Close ✕
              </button>
            </div>

            <div className="rounded-xl bg-slate-950 border border-white/10 p-3.5 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-300">
                  1. Open-Source Vocal Song AI:
                </span>
                <code className="text-emerald-300">
                  ACE-Step & DiffRhythm (No Login)
                </code>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-300">
                  2. AI Lyrics + Formant Choir + Neural Voice:
                </span>
                <code className="text-rose-300">Pollinations LLM + Vocaloid DSP</code>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-300">
                  3. Cover Art Provider:
                </span>
                <code className="text-indigo-300">
                  Pollinations.ai Flux (No Login)
                </code>
              </div>
            </div>

            <div>
              <label
                htmlFor="mcp-token"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Optional: Suno MCP OAuth Bearer Token (https://api.suno.com/mcp)
              </label>
              <input
                id="mcp-token"
                type="password"
                value={mcpToken}
                onChange={(e) => {
                  setMcpToken(e.target.value);
                  try {
                    localStorage.setItem(TOKEN_STORAGE_KEY, e.target.value);
                  } catch {
                    // ignore
                  }
                }}
                placeholder="Not required! Leave blank for free keyless vocal generation..."
                className="w-full rounded-xl bg-slate-950 border border-white/15 px-3 py-2 text-xs text-white outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => fetchMcpStatus(mcpToken)}
                disabled={isCheckingMcp}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-white/10 hover:bg-white/15 text-white transition"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isCheckingMcp ? "animate-spin" : ""}`}
                />
                <span>Check Status</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-500 hover:bg-rose-400 text-white transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
