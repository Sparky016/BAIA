import { Test, TestingModule } from '@nestjs/testing';

import { LLM_SERVICE } from './llm.constants';
import { LlmService } from './llm.service';
import { LlmModule } from './llm.module';
import { MockLlmService } from './mock-llm.service';

describe('LlmModule', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    // No LLM credentials in env → falls back to MockLlmService.
    delete process.env['COPILOT_TOKEN'];
    delete process.env['BYOK_PROVIDER_TYPE'];
    delete process.env['BYOK_BASE_URL'];
    delete process.env['BYOK_MODEL'];

    moduleRef = await Test.createTestingModule({
      imports: [LlmModule],
    }).compile();
  });

  it('falls back to MockLlmService when no LLM credentials are configured', () => {
    const service = moduleRef.get<LlmService>(LLM_SERVICE);
    expect(service).toBeInstanceOf(MockLlmService);
  });

  it('exposes a working LlmService through the token', async () => {
    const service = moduleRef.get<LlmService>(LLM_SERVICE);
    await expect(service.complete('ping')).resolves.toContain('ping');
    expect(service.countTokens('abcd')).toBe(1);
  });
});
