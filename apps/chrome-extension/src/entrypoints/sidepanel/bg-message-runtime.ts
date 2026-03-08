import type { UiState, RunStart } from "./types";

type BgMessage =
  | { type: "ui:state"; state: UiState }
  | { type: "ui:status"; status: string }
  | { type: "run:start"; run: RunStart }
  | { type: "run:error"; message: string }
  | { type: "slides:run"; ok: boolean; runId?: string; url?: string; error?: string }
  | {
      type: "chat:history";
      requestId: string;
      ok: boolean;
      messages?: unknown[];
      error?: string;
    }
  | { type: "agent:chunk"; requestId: string; text: string }
  | {
      type: "agent:response";
      requestId: string;
      ok: boolean;
      assistant?: unknown;
      error?: string;
    }
  | {
      type: "slides:context";
      requestId: string;
      ok: boolean;
      transcriptTimedText?: string | null;
      error?: string;
    }
  | { type: "ui:cache"; requestId: string; ok: boolean; cache?: unknown };

export function handleSidepanelBgMessage(options: {
  msg: BgMessage;
  applyUiState: (state: UiState) => void;
  setStatus: (text: string) => void;
  isStreaming: () => boolean;
  handleRunError: (message: string) => void;
  handleSlidesRun: (msg: Extract<BgMessage, { type: "slides:run" }>) => void;
  handleSlidesContext: (msg: Extract<BgMessage, { type: "slides:context" }>) => void;
  handleUiCache: (msg: Extract<BgMessage, { type: "ui:cache" }>) => void;
  handleRunStart: (run: RunStart) => void;
  handleChatHistory: (msg: Extract<BgMessage, { type: "chat:history" }>) => void;
  handleAgentChunk: (msg: Extract<BgMessage, { type: "agent:chunk" }>) => void;
  handleAgentResponse: (msg: Extract<BgMessage, { type: "agent:response" }>) => void;
}) {
  const { msg } = options;
  switch (msg.type) {
    case "ui:state":
      options.applyUiState(msg.state);
      return;
    case "ui:status":
      if (!options.isStreaming()) options.setStatus(msg.status);
      return;
    case "run:error":
      options.handleRunError(msg.message);
      return;
    case "slides:run":
      options.handleSlidesRun(msg);
      return;
    case "slides:context":
      options.handleSlidesContext(msg);
      return;
    case "ui:cache":
      options.handleUiCache(msg);
      return;
    case "run:start":
      options.handleRunStart(msg.run);
      return;
    case "chat:history":
      options.handleChatHistory(msg);
      return;
    case "agent:chunk":
      options.handleAgentChunk(msg);
      return;
    case "agent:response":
      options.handleAgentResponse(msg);
      return;
  }
}
