import { Body, Controller, HttpCode, HttpStatus, Logger, Param, Post } from '@nestjs/common';

import { E2ePipelineService } from '../e2e/e2e-pipeline.service';
import { StartPipelineBody, StartPipelineResult } from '../e2e/e2e-start.controller';
import { RunsService } from '../runs/runs.service';

/**
 * Production controller that triggers the full BAIA pipeline for a queued run.
 * Returns 202 immediately; the pipeline runs asynchronously in the background.
 */
@Controller('runs')
export class StartController {
  private readonly logger = new Logger(StartController.name);

  constructor(
    private readonly runsService: RunsService,
    private readonly pipelineService: E2ePipelineService
  ) {}

  @Post(':id/start')
  @HttpCode(HttpStatus.ACCEPTED)
  startPipeline(@Param('id') id: string, @Body() body: StartPipelineBody): StartPipelineResult {
    const run = this.runsService.getRun(id);

    this.pipelineService
      .runFullPipeline(
        id,
        run.targetUrl,
        body.instructions,
        body.repoUrl,
        body.repoProvider,
        body.credentialsRef
      )
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Pipeline error for run ${id}: ${msg}`);
      });

    return { accepted: true, runId: id };
  }
}
