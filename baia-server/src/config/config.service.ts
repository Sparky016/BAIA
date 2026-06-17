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

  get copilotApiKey(): string | undefined {
    return this.nestConfig.get<string>('COPILOT_API_KEY');
  }

  get copilotApiUrl(): string | undefined {
    return this.nestConfig.get<string>('COPILOT_API_URL');
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
