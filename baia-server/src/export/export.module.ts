import { Module } from '@nestjs/common';

import { RunStateMachine } from '../runs/run-state-machine';
import { RunsService } from '../runs/runs.service';
import { CredentialStoreService } from '../security/credential-store.service';

import { ConfluenceAdapter } from './confluence.adapter';
import { ExportController } from './export.controller';

@Module({
  controllers: [ExportController],
  providers: [CredentialStoreService, ConfluenceAdapter, RunsService, RunStateMachine],
  exports: [ConfluenceAdapter],
})
export class ExportModule {}
