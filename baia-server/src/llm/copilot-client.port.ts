/**
 * Injectable seam for the GitHub Copilot SDK.
 *
 * `CopilotClient` is the ONLY place in BAIA where the real GitHub Copilot SDK
 * surface is referenced. By depending on this interface (injected via
 * {@link COPILOT_CLIENT}), the {@link CopilotLlmAdapter} is fully testable
 * without the SDK npm package — tests inject a mock that satisfies this contract.
 *
 * ## Production wiring
 * In production the orchestrator (or `llm.module.ts`) binds `COPILOT_CLIENT` to
 * a thin wrapper that `import`s the real `@github/copilot-api` (or equivalent)
 * package and delegates to it. That wrapper is the **only** file that imports the
 * SDK — keeping the rest of the codebase completely decoupled from it.
 */

/** DI token for the injectable {@link CopilotClient}. */
export const COPILOT_CLIENT = Symbol('COPILOT_CLIENT');

// ---------------------------------------------------------------------------
// Minimal SDK surface shapes — only what the adapter needs.
// ---------------------------------------------------------------------------

/**
 * A single message in a chat-style prompt (mirrors the Copilot/OpenAI chat
 * format).
 */
export interface CopilotMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

/**
 * Options forwarded to the underlying Copilot API request.
 */
export interface CopilotRequestOptions {
  /** Sampling temperature (0 = deterministic). */
  readonly temperature?: number;
  /** Hard cap on tokens generated in the response. */
  readonly maxTokens?: number;
  /** Stop sequences. */
  readonly stop?: readonly string[];
  /** Per-request timeout in milliseconds. */
  readonly timeoutMs?: number;
}

/**
 * A non-streaming completion response from the Copilot API.
 */
export interface CopilotCompletion {
  /** The model's text output. */
  readonly text: string;
  /**
   * Optional finish reason reported by the provider.
   * `"content_filter"` maps to the `CONTENT_FILTERED` error code.
   */
  readonly finishReason?: 'stop' | 'length' | 'content_filter' | string;
}

/**
 * An error-like shape the real SDK may throw. The adapter inspects these fields
 * to map to the appropriate {@link LlmErrorCode}.
 */
export interface CopilotApiError {
  /** HTTP status code (429 = rate-limited, 401/403 = auth). */
  readonly status?: number;
  /** Error code string from the API body. */
  readonly code?: string;
  readonly message: string;
}

/**
 * Minimal interface the {@link CopilotLlmAdapter} needs from the Copilot SDK.
 *
 * The real SDK adapter injected in production implements exactly these two
 * methods and nothing else; this keeps the seam as narrow as possible.
 *
 * @remarks
 * This is the **single seam** where the real Copilot SDK is wired in production.
 * All other code in BAIA (including {@link CopilotLlmAdapter}) depends only on
 * this interface — never on any concrete SDK import.
 */
export interface CopilotClient {
  /**
   * Send a chat-style prompt and return a single (non-streaming) completion.
   *
   * @param messages  Ordered conversation turns (system + user at minimum).
   * @param opts      Optional request parameters.
   * @returns         The model's completion.
   * @throws          A {@link CopilotApiError}-shaped object on failure.
   */
  complete(
    messages: readonly CopilotMessage[],
    opts?: CopilotRequestOptions
  ): Promise<CopilotCompletion>;

  /**
   * Send a chat-style prompt and stream the response incrementally.
   *
   * Each yielded string is a raw text delta (not a full completion); callers
   * concatenate chunks to obtain the full output.
   *
   * @throws A {@link CopilotApiError}-shaped object on failure.
   */
  stream(messages: readonly CopilotMessage[], opts?: CopilotRequestOptions): AsyncIterable<string>;
}
