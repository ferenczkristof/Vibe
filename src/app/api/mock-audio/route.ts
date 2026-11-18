import { NextRequest, NextResponse } from "next/server";
import { synthesizeWavBuffer } from "@/lib/wav-synth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const prompt = searchParams.get("prompt") || "warm acoustic guitar and piano song";
  const style = searchParams.get("style") || "";
  const seed = parseInt(
    searchParams.get("seed") || String(Math.floor(Math.random() * 900000)),
    10
  );
  const withVocals = searchParams.get("vocals") !== "0";
  const isDownload = searchParams.get("download") === "1";
  const filename = (searchParams.get("filename") || "suno-studio-track.wav").replace(
    /[^a-zA-Z0-9._-]/g,
    "_"
  );

  const wavBuffer = synthesizeWavBuffer(prompt, style, seed, withVocals);

  const headers: Record<string, string> = {
    "Content-Type": "audio/wav",
    "Content-Length": String(wavBuffer.length),
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  };

  if (isDownload) {
    headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  }

  return new NextResponse(new Uint8Array(wavBuffer), {
    status: 200,
    headers,
  });
}
