import { Module } from '@nestjs/common';

import {
  GITHUB_API_CLIENT_FACTORY,
  GitHubConnector,
  buildOctokitFactory,
} from './github-connector';
import { REPO_CONNECTOR } from './repo-connector';

/**
 * NestJS module for the Phase 2 "Code Analyst" domain.
 *
 * Wires:
 * - {@link GITHUB_API_CLIENT_FACTORY} → async Octokit-based factory
 *   (the only place `@octokit/rest` is imported at runtime).
 * - {@link REPO_CONNECTOR} → {@link GitHubConnector} (the GitHub implementation
 *   of the {@link RepoConnector} interface).
 *
 * Future: DEV_TASK_22 will add an `AzureReposConnector` and select the correct
 * binding based on `RunRequest.repoProvider`.
 */
@Module({
  providers: [
    {
      provide: GITHUB_API_CLIENT_FACTORY,
      useFactory: buildOctokitFactory,
    },
    GitHubConnector,
    {
      provide: REPO_CONNECTOR,
      useClass: GitHubConnector,
    },
  ],
  exports: [REPO_CONNECTOR, GitHubConnector],
})
export class CodeAnalystModule {}
