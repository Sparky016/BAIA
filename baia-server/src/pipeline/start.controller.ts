import { Body, Controller, HttpCode, HttpStatus, Logger, Param, Post } from '@nestjs/common';

import { RunsService } from '../runs/runs.service';
import { CredentialStoreService } from '../security/credential-store.service';

import { PipelineService } from './pipeline.service';
import { StartPipelineBody, StartPipelineResult } from './pipeline.types';

const ENV_REPO_REF = 'env-repo';

/**
 * Controller that triggers the full BAIA pipeline for a queued run.
 * Returns 202 immediately; the pipeline runs asynchronously in the background.
 *
 * Production mode: repo credentials are sourced exclusively from environment
 * variables (REPO_URL, REPO_PROVIDER, REPO_ACCESS_TOKEN) — the UI never sends
 * keys.
 *
 * E2E mode (E2E=true): mock credentials supplied in the request body are seeded
 * into the credential store so the deterministic pipeline can retrieve them.
 * This path is gated by the E2E environment variable and is never active in
 * production.
 */
@Controller('runs')
export class StartController {
  private readonly logger = new Logger(StartController.name);

  private readonly isE2e = process.env['E2E'] === 'true';

  constructor(
    private readonly runsService: RunsService,
    private readonly pipelineService: PipelineService,
    private readonly credentialStore: CredentialStoreService
  ) {}

  @Post(':id/start')
  @HttpCode(HttpStatus.ACCEPTED)
  startPipeline(@Param('id') id: string, @Body() body: StartPipelineBody): StartPipelineResult {
    const run = this.runsService.getRun(id);

    let repoUrl: string | undefined;
    let repoProvider: 'github' | 'azure';
    let credentialsRef: string | undefined;

    if (this.isE2e) {
      // E2E path: credentials and repo details come from the request body.
      // Seed any mock credential refs provided by the test.
      if (body.credentialsRef) {
        this.credentialStore.store(body.credentialsRef, 'mock-access-token');
      }
      if (body.confluenceCredentialsRef) {
        this.credentialStore.store(body.confluenceCredentialsRef, 'mock-confluence-token');
      }

      repoUrl = body.repoUrl;
      repoProvider = body.repoProvider ?? 'github';
      credentialsRef = body.credentialsRef;

      this.logger.log(`E2E: starting full pipeline for run ${id}`);
    } else {
      // Production path: credentials come from environment variables only.
      repoUrl = process.env['REPO_URL']?.trim() || undefined;
      repoProvider = (process.env['REPO_PROVIDER']?.trim() as 'github' | 'azure') || 'github';
      const repoToken = process.env['REPO_ACCESS_TOKEN']?.trim() || undefined;

      if (repoUrl && repoToken) {
        this.credentialStore.store(ENV_REPO_REF, repoToken);
        credentialsRef = ENV_REPO_REF;
      }
    }

    this.pipelineService
      .runFullPipeline(id, run.targetUrl, body.instructions, repoUrl, repoProvider, credentialsRef)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Pipeline error for run ${id}: ${msg}`);
      });

    return { accepted: true, runId: id };
  }
}
