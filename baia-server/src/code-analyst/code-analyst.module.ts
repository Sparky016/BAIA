import { Module } from '@nestjs/common';

import { LlmModule } from '../llm/llm.module';
import { RunStateMachine } from '../runs/run-state-machine';
import { RunsEventsService } from '../runs/runs.events';
import { RunsService } from '../runs/runs.service';
import { CredentialStoreService } from '../security';

import { AnalyzeOrchestrator } from './analyze.orchestrator';
import {
  AZURE_API_CLIENT_FACTORY,
  AzureConnector,
  buildAzureApiClientFactory,
} from './azure-connector';
import {
  GITHUB_API_CLIENT_FACTORY,
  GitHubConnector,
  buildOctokitFactory,
} from './github-connector';
import { IngestionService } from './ingestion.service';
import { REPO_CONNECTOR } from './repo-connector';
import { RuleExtractorService } from './rule-extractor.service';

@Module({
  imports: [LlmModule],
  providers: [
    {
      provide: GITHUB_API_CLIENT_FACTORY,
      useFactory: buildOctokitFactory,
    },
    GitHubConnector,
    {
      provide: AZURE_API_CLIENT_FACTORY,
      useFactory: buildAzureApiClientFactory,
    },
    AzureConnector,
    {
      provide: REPO_CONNECTOR,
      useClass: GitHubConnector,
    },
    IngestionService,
    RuleExtractorService,
    RunStateMachine,
    RunsService,
    RunsEventsService,
    CredentialStoreService,
    AnalyzeOrchestrator,
  ],
  exports: [
    REPO_CONNECTOR,
    GitHubConnector,
    AzureConnector,
    IngestionService,
    RuleExtractorService,
    AnalyzeOrchestrator,
  ],
})
export class CodeAnalystModule {}
