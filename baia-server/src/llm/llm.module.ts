import { Module } from '@nestjs/common';

import { ClaudeLlmAdapter } from './claude-llm.adapter';
import { CopilotLlmAdapter } from './copilot-llm.adapter';
import { ByokProviderConfig, CopilotSdkClient } from './copilot-sdk-client';
import { LLM_SERVICE } from './llm.constants';
import { LlmService } from './llm.service';
import { MockLlmService } from './mock-llm.service';

function buildLlmService(): LlmService {
  const copilotToken = process.env['COPILOT_TOKEN']?.trim();

  // Standard Copilot mode — GitHub token present.
  if (copilotToken) {
    const model = process.env['COPILOT_MODEL']?.trim() ?? 'gpt-4o';
    const maxRetries = Number(process.env['COPILOT_MAX_RETRIES'] ?? 3);
    const retryDelayMs = Number(process.env['COPILOT_RETRY_DELAY_MS'] ?? 500);

    const sdkClient = new CopilotSdkClient({ gitHubToken: copilotToken, model });
    return new CopilotLlmAdapter(sdkClient, {
      token: copilotToken,
      model,
      maxRetries,
      retryDelayMs,
    });
  }

  // BYOK mode — provider config present.
  const byokType = process.env['BYOK_PROVIDER_TYPE']?.trim();
  const byokBase = process.env['BYOK_BASE_URL']?.trim();
  const byokModel = process.env['BYOK_MODEL']?.trim();

  if (byokType && byokBase && byokModel) {
    const apiKey = process.env['BYOK_API_KEY']?.trim() || undefined;
    const wireApi =
      (process.env['BYOK_WIRE_API']?.trim() as ByokProviderConfig['wireApi']) || undefined;
    const azureVersion = process.env['BYOK_AZURE_API_VERSION']?.trim() || undefined;
    const maxRetries = Number(process.env['COPILOT_MAX_RETRIES'] ?? 3);
    const retryDelayMs = Number(process.env['COPILOT_RETRY_DELAY_MS'] ?? 500);

    const provider: ByokProviderConfig = {
      type: byokType as ByokProviderConfig['type'],
      baseUrl: byokBase,
      ...(apiKey && { apiKey }),
      ...(wireApi && { wireApi }),
      ...(azureVersion && { azure: { apiVersion: azureVersion } }),
    };

    const sdkClient = new CopilotSdkClient({ model: byokModel, provider });
    return new CopilotLlmAdapter(sdkClient, { model: byokModel, maxRetries, retryDelayMs });
  }

  // Anthropic Claude fallback — when Copilot/BYOK are unavailable.
  const anthropicApiKey = process.env['ANTHROPIC_API_KEY']?.trim();
  if (anthropicApiKey) {
    const model = process.env['ANTHROPIC_MODEL']?.trim() ?? 'claude-opus-4-8';
    return new ClaudeLlmAdapter(anthropicApiKey, model);
  }

  // Development / test fallback — no credentials configured.
  return new MockLlmService();
}

/**
 * LLM integration module.
 *
 * Provider selection is determined at startup from environment variables
 * (first match wins):
 *
 * 1. `COPILOT_TOKEN` present → GitHub Copilot SDK (standard mode)
 * 2. `BYOK_PROVIDER_TYPE` + `BYOK_BASE_URL` + `BYOK_MODEL` present → BYOK mode
 * 3. `ANTHROPIC_API_KEY` present → Anthropic Claude API (`claude-opus-4-8` default)
 * 4. None → MockLlmService (development / test fallback)
 */
@Module({
  providers: [
    {
      provide: LLM_SERVICE,
      useFactory: buildLlmService,
    },
  ],
  exports: [LLM_SERVICE],
})
export class LlmModule {}
