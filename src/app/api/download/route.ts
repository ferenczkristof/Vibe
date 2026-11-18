import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");
  const filename = (searchParams.get("filename") || "download.mp3").replace(
    /[^a-zA-Z0-9._-]/g,
    "_"
  );

  if (!targetUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // If it's a local API route (/api/mock-audio or /api/cover), redirect with download=1
  if (targetUrl.startsWith("/api/")) {
    const redirectUrl = new URL(targetUrl, request.url);
    redirectUrl.searchParams.set("download", "1");
    redirectUrl.searchParams.set("filename", filename);
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const upstream = await fetch(targetUrl);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Failed to fetch remote asset (${upstream.status})` },
        { status: 502 }
      );
    }

    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Download failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
