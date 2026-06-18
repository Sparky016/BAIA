import { Module } from '@nestjs/common';

import { LlmModule } from '../llm/llm.module';

import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [LlmModule],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconcileModule {}
