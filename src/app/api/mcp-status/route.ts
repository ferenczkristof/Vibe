import { NextRequest, NextResponse } from "next/server";
import { checkSunoMcpStatus } from "@/lib/suno-mcp";

export async function GET(request: NextRequest) {
  const customToken = request.headers.get("x-suno-mcp-token") || undefined;
  const status = await checkSunoMcpStatus(customToken);
  return NextResponse.json(status);
}
