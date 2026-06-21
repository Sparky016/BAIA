import { CopilotClient as NativeCopilotClient, SystemMessageConfig } from '@github/copilot-sdk';

import {
  CopilotClient,
  CopilotCompletion,
  CopilotMessage,
  CopilotRequestOptions,
} from './copilot-client.port';

// ---------------------------------------------------------------------------
// BYOK provider config
// ---------------------------------------------------------------------------

export interface ByokProviderConfig {
  readonly type: 'openai' | 'azure' | 'anthropic';
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly bearerToken?: string;
  readonly wireApi?: 'completions' | 'responses';
  readonly azure?: { readonly apiVersion?: string };
}

// ---------------------------------------------------------------------------
// Client config
// ---------------------------------------------------------------------------

export interface CopilotSdkClientConfig {
  /** Model identifier forwarded to createSession. */
  readonly model: string;
  /** When provided the session is created with BYOK credentials. */
  readonly provider?: ByokProviderConfig;
  /** GitHub PAT / OAuth token — used in standard Copilot mode only. */
  readonly gitHubToken?: string;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function extractMessages(messages: readonly CopilotMessage[]): {
  userPrompt: string;
  systemMessage?: string;
} {
  const system = messages.find((m) => m.role === 'system');
  const user = messages.find((m) => m.role === 'user');
  return { userPrompt: user?.content ?? '', systemMessage: system?.content };
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Production implementation of the BAIA {@link CopilotClient} port.
 *
 * Wraps `@github/copilot-sdk` and supports both standard GitHub Copilot
 * authentication (via `gitHubToken`) and BYOK mode (via `provider`).
 */
export class CopilotSdkClient implements CopilotClient {
  private readonly nativeClient: NativeCopilotClient;

  constructor(private readonly config: CopilotSdkClientConfig) {
    this.nativeClient = config.gitHubToken
      ? new NativeCopilotClient({ gitHubToken: config.gitHubToken, useLoggedInUser: false })
      : new NativeCopilotClient();
  }

  async complete(
    messages: readonly CopilotMessage[],
    _opts?: CopilotRequestOptions
  ): Promise<CopilotCompletion> {
    const { userPrompt, systemMessage } = extractMessages(messages);

    const session = await this.nativeClient.createSession({
      model: this.config.model,
      ...(systemMessage && {
        systemMessage: { mode: 'replace', content: systemMessage } as SystemMessageConfig,
      }),
      ...(this.config.provider && { provider: this.config.provider }),
    });

    const response = await session.sendAndWait({ prompt: userPrompt });
    const text: string = (response as { data?: { content?: string } })?.data?.content ?? '';
    return { text, finishReason: 'stop' };
  }

  async *stream(
    messages: readonly CopilotMessage[],
    _opts?: CopilotRequestOptions
  ): AsyncIterable<string> {
    const { userPrompt, systemMessage } = extractMessages(messages);

    const session = await this.nativeClient.createSession({
      model: this.config.model,
      streaming: true,
      ...(systemMessage && {
        systemMessage: { mode: 'replace', content: systemMessage } as SystemMessageConfig,
      }),
      ...(this.config.provider && { provider: this.config.provider }),
    });

    const queue: string[] = [];
    let finished = false;
    let resolveWaiting: (() => void) | null = null;

    const signal = () => {
      resolveWaiting?.();
      resolveWaiting = null;
    };

    session.on('assistant.message_delta', (event: unknown) => {
      const chunk = (event as { data?: { deltaContent?: string } })?.data?.deltaContent;
      if (chunk) {
        queue.push(chunk);
        signal();
      }
    });

    session.on('session.idle', () => {
      finished = true;
      signal();
    });

    const sendPromise = session.sendAndWait({ prompt: userPrompt });
    sendPromise.catch(() => {
      finished = true;
      signal();
    });

    while (!finished || queue.length > 0) {
      if (queue.length > 0) {
        yield queue.shift()!;
      } else {
        await new Promise<void>((resolve) => {
          resolveWaiting = resolve;
        });
      }
    }

    // Surface any sendAndWait rejection after draining the queue.
    await sendPromise;
  }
}
