import { Test, TestingModule } from '@nestjs/testing';

import { LLM_SERVICE } from './llm.constants';
import { LlmService } from './llm.service';
import { LlmModule } from './llm.module';
import { MockLlmService } from './mock-llm.service';

describe('LlmModule', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [LlmModule],
    }).compile();
  });

  it('binds LLM_SERVICE to the mock implementation', () => {
    const service = moduleRef.get<LlmService>(LLM_SERVICE);
    expect(service).toBeInstanceOf(MockLlmService);
  });

  it('exposes a working LlmService through the token', async () => {
    const service = moduleRef.get<LlmService>(LLM_SERVICE);
    await expect(service.complete('ping')).resolves.toContain('ping');
    expect(service.countTokens('abcd')).toBe(1);
  });
});
