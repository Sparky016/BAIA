import { Body, Controller, HttpCode, HttpStatus, Logger, Param, Post } from '@nestjs/common';

import { RunsService } from '../runs/runs.service';
import { CredentialStoreService } from '../security/credential-store.service';

import { E2ePipelineService } from './e2e-pipeline.service';

export interface StartPipelineBody {
  instructions: string;
}

export interface StartPipelineResult {
  accepted: boolean;
  runId: string;
}

/**
 * E2E-only controller that triggers the full BAIA pipeline for a queued run.
 *
 * Exposed only when the server is started via e2e-server.ts (not in production).
 * Returns 202 immediately; the pipeline runs asynchronously in the background.
 */
@Controller('runs')
export class E2eStartController {
  private readonly logger = new Logger(E2eStartController.name);

  constructor(
    private readonly runsService: RunsService,
    private readonly credentialStore: CredentialStoreService,
    private readonly pipelineService: E2ePipelineService
  ) {}

  @Post(':id/start')
  @HttpCode(HttpStatus.ACCEPTED)
  startPipeline(@Param('id') id: string, @Body() body: StartPipelineBody): StartPipelineResult {
    const run = this.runsService.getRun(id);

    // Seed mock credentials under a fixed internal ref for the E2E pipeline.
    this.credentialStore.store('env-repo', 'mock-access-token');

    this.logger.log(`E2E: starting full pipeline for run ${id}`);

    // Fire-and-forget; pipeline transitions are tracked via SSE.
    this.pipelineService
      .runFullPipeline(id, run.targetUrl, body.instructions, undefined, undefined, undefined)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`E2E pipeline error for run ${id}: ${msg}`);
      });

    return { accepted: true, runId: id };
  }
}
