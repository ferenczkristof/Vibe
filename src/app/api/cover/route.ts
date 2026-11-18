import { NextRequest, NextResponse } from "next/server";
import {
  generateArtisticSvgCover,
  getPollinationsCoverUrl,
} from "@/lib/image-provider";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const prompt = searchParams.get("prompt") || "Album cover art";
  const title = searchParams.get("title") || "Untitled Track";
  const style = searchParams.get("style") || "AI Music Studio";
  const seed = parseInt(searchParams.get("seed") || "4242", 10);
  const isDownload = searchParams.get("download") === "1";

  const pollinationsUrl = getPollinationsCoverUrl(prompt, seed);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);

    const response = await fetch(pollinationsUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "SunoCoverStudio/1.0",
      },
    });
    clearTimeout(timeout);

    if (response.ok) {
      const contentType = response.headers.get("content-type") || "image/jpeg";
      const arrayBuffer = await response.arrayBuffer();

      const headers: Record<string, string> = {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      };

      if (isDownload) {
        const ext = contentType.includes("png") ? "png" : "jpg";
        const safeName = title.replace(/[^a-zA-Z0-9_-]/g, "_") || "cover";
        headers["Content-Disposition"] = `attachment; filename="${safeName}-cover.${ext}"`;
      }

      return new NextResponse(arrayBuffer, {
        status: 200,
        headers,
      });
    }
  } catch {
    // Fall back to high-res artistic SVG cover when offline or rate-limited
  }

  const svg = generateArtisticSvgCover(title, prompt, style, seed);
  const headers: Record<string, string> = {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  };

  if (isDownload) {
    const safeName = title.replace(/[^a-zA-Z0-9_-]/g, "_") || "cover";
    headers["Content-Disposition"] = `attachment; filename="${safeName}-cover.svg"`;
  }

  return new NextResponse(svg, {
    status: 200,
    headers,
  });
}
