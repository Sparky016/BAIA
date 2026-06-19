import { Module } from '@nestjs/common';

import { LlmModule } from '../llm/llm.module';
import { RunStateMachine } from '../runs/run-state-machine';
import { RunsEventsService } from '../runs/runs.events';
import { RunsService } from '../runs/runs.service';

import { ReconcileOrchestrator } from './reconcile.orchestrator';
import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [LlmModule],
  providers: [
    ReconciliationService,
    RunStateMachine,
    RunsService,
    RunsEventsService,
    ReconcileOrchestrator,
  ],
  exports: [ReconciliationService, ReconcileOrchestrator],
})
export class ReconcileModule {}
