export interface Track {
  id: string;
  title: string;
  prompt: string;
  visualPrompt: string;
  styleTags: string;
  instrumental: boolean;
  customLyrics?: string;
  audioUrl: string;
  coverUrl: string;
  remoteCoverUrl: string;
  duration: number;
  createdAt: string;
  source: "suno-mcp" | "open-vocal-ai" | "demo-synth";
  mcpNotice?: string;
  seed: number;
}

export interface GenerateRequest {
  prompt: string;
  title?: string;
  styleTags?: string;
  instrumental?: boolean;
  customLyrics?: string;
  mcpToken?: string;
  forceMock?: boolean;
}

export interface GenerateResponse {
  track: Track;
  error?: string;
}

export interface McpStatusResponse {
  mcpUrl: string;
  connected: boolean;
  requiresAuth: boolean;
  mockModeEnabled: boolean;
  tools: string[];
  message: string;
}
