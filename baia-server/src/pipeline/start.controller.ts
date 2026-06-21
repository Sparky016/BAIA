import { Body, Controller, HttpCode, HttpStatus, Logger, Param, Post } from '@nestjs/common';

import { E2ePipelineService } from '../e2e/e2e-pipeline.service';
import { StartPipelineBody, StartPipelineResult } from '../e2e/e2e-start.controller';
import { RunsService } from '../runs/runs.service';
import { CredentialStoreService } from '../security/credential-store.service';

const ENV_REPO_REF = 'env-repo';

/**
 * Production controller that triggers the full BAIA pipeline for a queued run.
 * Returns 202 immediately; the pipeline runs asynchronously in the background.
 *
 * Repo credentials are sourced exclusively from environment variables
 * (REPO_URL, REPO_PROVIDER, REPO_ACCESS_TOKEN) — the UI never sends keys.
 */
@Controller('runs')
export class StartController {
  private readonly logger = new Logger(StartController.name);

  constructor(
    private readonly runsService: RunsService,
    private readonly pipelineService: E2ePipelineService,
    private readonly credentialStore: CredentialStoreService
  ) {}

  @Post(':id/start')
  @HttpCode(HttpStatus.ACCEPTED)
  startPipeline(@Param('id') id: string, @Body() body: StartPipelineBody): StartPipelineResult {
    const run = this.runsService.getRun(id);

    const repoUrl = process.env['REPO_URL']?.trim() || undefined;
    const repoProvider = (process.env['REPO_PROVIDER']?.trim() as 'github' | 'azure') || 'github';
    const repoToken = process.env['REPO_ACCESS_TOKEN']?.trim() || undefined;

    let credentialsRef: string | undefined;
    if (repoUrl && repoToken) {
      this.credentialStore.store(ENV_REPO_REF, repoToken);
      credentialsRef = ENV_REPO_REF;
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
