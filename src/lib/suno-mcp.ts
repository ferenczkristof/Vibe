import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export interface SunoGenerationInput {
  prompt: string;
  title?: string;
  styleTags?: string;
  instrumental?: boolean;
  customLyrics?: string;
  mcpToken?: string;
}

export interface SunoGenerationResult {
  audioUrl: string;
  title: string;
  duration: number;
  source: "suno-mcp" | "demo-synth";
  mcpNotice?: string;
}

export function getSunoMcpUrl(): string {
  return process.env.SUNO_MCP_URL || "https://api.suno.com/mcp";
}

function buildAuthHeaders(customToken?: string): Record<string, string> {
  const token = (customToken || process.env.SUNO_MCP_TOKEN || "").trim();
  const headers: Record<string, string> = {
    Accept: "application/json, text/event-stream",
  };
  if (token) {
    headers["Authorization"] = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  }
  return headers;
}

/**
 * Connect to https://api.suno.com/mcp using the official MCP SDK Client.
 * Tries StreamableHTTPClientTransport first (MCP 2025+ standard used by remote MCP servers),
 * then falls back to SSEClientTransport.
 */
export async function connectSunoMcpClient(customToken?: string): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const mcpUrl = new URL(getSunoMcpUrl());
  const headers = buildAuthHeaders(customToken);

  const client = new Client(
    { name: "suno-cover-studio", version: "1.0.0" },
    { capabilities: {} }
  );

  try {
    const httpTransport = new StreamableHTTPClientTransport(mcpUrl, {
      requestInit: { headers },
    });
    await client.connect(httpTransport);
    return {
      client,
      close: async () => {
        try {
          await client.close();
        } catch {
          // ignore close errors
        }
      },
    };
  } catch (primaryErr) {
    const sseClient = new Client(
      { name: "suno-cover-studio", version: "1.0.0" },
      { capabilities: {} }
    );
    try {
      const sseTransport = new SSEClientTransport(mcpUrl, {
        requestInit: { headers },
      });
      await sseClient.connect(sseTransport);
      return {
        client: sseClient,
        close: async () => {
          try {
            await sseClient.close();
          } catch {
            // ignore close errors
          }
        },
      };
    } catch {
      throw primaryErr;
    }
  }
}

/**
 * Extract an audio URL (.mp3, .wav, .m4a, or cdn/suno URL) from an MCP tool call result
 */
function extractAudioUrlFromMcpResult(result: unknown): string | null {
  const raw = JSON.stringify(result ?? {});
  // Match direct audio URLs or Suno CDN URLs
  const audioRegex = /https?:\/\/[^\s"'<>]+?\.(?:mp3|wav|m4a|ogg)(?:\?[^\s"'<>]*)?/i;
  const match = raw.match(audioRegex);
  if (match) return match[0];

  // Also check structured fields like audio_url or stream_audio_url
  const fieldRegex = /"(?:audio_url|stream_audio_url|song_url|url)"\s*:\s*"(https?:\/\/[^"]+)"/i;
  const fieldMatch = raw.match(fieldRegex);
  if (fieldMatch) return fieldMatch[1];

  return null;
}

/**
 * Extract a task/clip ID from an async MCP generation response for polling
 */
function extractTaskIdFromMcpResult(result: unknown): string | null {
  const raw = JSON.stringify(result ?? {});
  const idRegex = /"(?:task_id|clip_id|job_id|id)"\s*:\s*"([a-zA-Z0-9_-]{6,})"/i;
  const match = raw.match(idRegex);
  return match ? match[1] : null;
}

export async function checkSunoMcpStatus(customToken?: string): Promise<{
  mcpUrl: string;
  connected: boolean;
  requiresAuth: boolean;
  mockModeEnabled: boolean;
  tools: string[];
  message: string;
}> {
  const mcpUrl = getSunoMcpUrl();
  const mockModeEnabled = process.env.MOCK_MODE !== "false";

  try {
    const { client, close } = await connectSunoMcpClient(customToken);
    try {
      const list = await client.listTools();
      const toolNames = (list.tools || []).map((t) => t.name);
      return {
        mcpUrl,
        connected: true,
        requiresAuth: false,
        mockModeEnabled,
        tools: toolNames,
        message: `Connected to ${mcpUrl} (${toolNames.length} MCP tools available).`,
      };
    } finally {
      await close();
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAuthError =
      msg.includes("401") ||
      msg.includes("403") ||
      msg.toLowerCase().includes("unauthorized") ||
      msg.toLowerCase().includes("oauth") ||
      msg.toLowerCase().includes("token");

    return {
      mcpUrl,
      connected: false,
      requiresAuth: isAuthError,
      mockModeEnabled,
      tools: [],
      message: isAuthError
        ? `Suno MCP (${mcpUrl}) requires an OAuth Bearer token. Studio Synth Fallback is ready.`
        : `Suno MCP (${mcpUrl}) unreachable or awaiting OAuth login (${msg.slice(0, 120)}). Studio Synth Fallback is active.`,
    };
  }
}

export async function generateTrackViaSunoMcp(
  input: SunoGenerationInput
): Promise<SunoGenerationResult> {
  const { client, close } = await connectSunoMcpClient(input.mcpToken);

  try {
    const { tools } = await client.listTools();

    const isCustomMode = Boolean(
      (input.customLyrics && input.customLyrics.trim().length > 0) ||
        (input.styleTags && input.styleTags.trim().length > 0)
    );

    // Pick best matching generation tool from the MCP server
    const generateTool =
      tools.find((t) =>
        isCustomMode
          ? /custom.*music|generate.*custom/i.test(t.name)
          : /generate.*music|create.*song|create.*music|generate_song|suno_generate/i.test(
              t.name
            )
      ) ||
      tools.find((t) => /generate|create|suno/i.test(t.name)) ||
      tools[0];

    if (!generateTool) {
      throw new Error("No music generation tool exposed by Suno MCP server.");
    }

    const toolArgs: Record<string, unknown> = isCustomMode
      ? {
          custom_mode: true,
          prompt: input.customLyrics || input.prompt,
          gpt_description_prompt: input.prompt,
          tags: input.styleTags || "electronic, modern",
          title: input.title || "Untitled Track",
          make_instrumental: Boolean(input.instrumental),
        }
      : {
          custom_mode: false,
          gpt_description_prompt: input.prompt,
          prompt: input.prompt,
          tags: input.styleTags || undefined,
          title: input.title || undefined,
          make_instrumental: Boolean(input.instrumental),
        };

    const callResult = await client.callTool({
      name: generateTool.name,
      arguments: toolArgs,
    });

    // Check if audio URL is immediately available
    let audioUrl = extractAudioUrlFromMcpResult(callResult);

    // If a task/clip ID was returned, poll status tools up to 12 times
    if (!audioUrl) {
      const taskId = extractTaskIdFromMcpResult(callResult);
      const statusTool = tools.find((t) =>
        /status|get_music|get_song|fetch|query|clip|task/i.test(t.name)
      );

      if (taskId && statusTool) {
        for (let attempt = 0; attempt < 12; attempt++) {
          await new Promise((r) => setTimeout(r, 3000));
          const pollResult = await client.callTool({
            name: statusTool.name,
            arguments: {
              task_id: taskId,
              id: taskId,
              clip_id: taskId,
            },
          });
          audioUrl = extractAudioUrlFromMcpResult(pollResult);
          if (audioUrl) break;
        }
      }
    }

    if (!audioUrl) {
      throw new Error(
        "Suno MCP tool executed, but no playable audio URL was returned in time."
      );
    }

    return {
      audioUrl,
      title: input.title || deriveTrackTitle(input.prompt),
      duration: 120,
      source: "suno-mcp",
    };
  } finally {
    await close();
  }
}

export function deriveTrackTitle(prompt: string): string {
  const cleaned = prompt
    .replace(/[^\w\s-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^(and|the|with|for|that|from|about|song|track|music)$/i.test(w))
    .slice(0, 4);

  if (cleaned.length === 0) return "Untitled Studio Song";
  return cleaned
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
