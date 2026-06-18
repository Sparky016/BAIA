import { Module } from '@nestjs/common';

import { LlmModule } from '../llm/llm.module';
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
  ],
  exports: [REPO_CONNECTOR, GitHubConnector, AzureConnector, IngestionService],
})
export class CodeAnalystModule {}
