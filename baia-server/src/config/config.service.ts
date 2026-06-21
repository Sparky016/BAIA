import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class ConfigService {
  constructor(private nestConfig: NestConfigService) {}

  get port(): number {
    return this.nestConfig.get<number>('PORT', 3000);
  }

  get corsOrigin(): string {
    return this.nestConfig.get<string>('CORS_ORIGIN', 'http://localhost:4200');
  }

  get copilotToken(): string | undefined {
    return this.nestConfig.get<string>('COPILOT_TOKEN');
  }

  /** Returns true when GitHub Copilot credentials are configured. */
  hasCopilotCredentials(): boolean {
    const token = this.copilotToken;
    return typeof token === 'string' && token.trim().length > 0;
  }

  // ---------------------------------------------------------------------------
  // BYOK (Bring Your Own Key) — used when COPILOT_TOKEN is absent
  // ---------------------------------------------------------------------------

  get byokProviderType(): 'openai' | 'azure' | 'anthropic' | undefined {
    const v = this.nestConfig.get<string>('BYOK_PROVIDER_TYPE');
    if (v === 'openai' || v === 'azure' || v === 'anthropic') return v;
    return undefined;
  }

  get byokBaseUrl(): string | undefined {
    return this.nestConfig.get<string>('BYOK_BASE_URL');
  }

  get byokApiKey(): string | undefined {
    return this.nestConfig.get<string>('BYOK_API_KEY');
  }

  get byokModel(): string | undefined {
    return this.nestConfig.get<string>('BYOK_MODEL');
  }

  get byokWireApi(): 'completions' | 'responses' | undefined {
    const v = this.nestConfig.get<string>('BYOK_WIRE_API');
    if (v === 'completions' || v === 'responses') return v;
    return undefined;
  }

  get byokAzureApiVersion(): string | undefined {
    return this.nestConfig.get<string>('BYOK_AZURE_API_VERSION');
  }

  get repoUrl(): string | undefined {
    return this.nestConfig.get<string>('REPO_URL');
  }

  get repoProvider(): 'github' | 'azure' | undefined {
    const v = this.nestConfig.get<string>('REPO_PROVIDER');
    return v === 'azure' ? 'azure' : v === 'github' ? 'github' : undefined;
  }

  get repoAccessToken(): string | undefined {
    return this.nestConfig.get<string>('REPO_ACCESS_TOKEN');
  }

  get nodeEnv(): string {
    return this.nestConfig.get<string>('NODE_ENV', 'development');
  }

  isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  }

  isProduction(): boolean {
    return this.nodeEnv === 'production';
  }
}
