import { Module } from '@nestjs/common';

import { LLM_SERVICE } from './llm.constants';
import { MockLlmService } from './mock-llm.service';

/**
 * LLM integration module.
 *
 * Binds the {@link LLM_SERVICE} token to a concrete {@link LlmService}
 * implementation and re-exports the token so other feature modules can inject
 * the contract without importing any provider.
 *
 * For now the binding is the deterministic {@link MockLlmService}. DEV_TASK_12
 * swaps this for `CopilotLlmAdapter` (the sole place the Copilot SDK is
 * imported); consumers depending on the token are unaffected by that swap.
 */
@Module({
  providers: [
    {
      provide: LLM_SERVICE,
      useClass: MockLlmService,
    },
  ],
  exports: [LLM_SERVICE],
})
export class LlmModule {}
