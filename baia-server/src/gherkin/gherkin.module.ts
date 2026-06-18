import { Module } from '@nestjs/common';

import { LlmModule } from '../llm/llm.module';

import { GherkinGeneratorService } from './gherkin-generator.service';

/**
 * Gherkin generation module (S3-05).
 *
 * Wires {@link GherkinGeneratorService} and re-exports it so other feature
 * modules can inject the generator without importing LLM internals directly.
 */
@Module({
  imports: [LlmModule],
  providers: [GherkinGeneratorService],
  exports: [GherkinGeneratorService],
})
export class GherkinModule {}
