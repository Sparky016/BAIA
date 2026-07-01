import { RunSummary } from '@baia/shared';
import { Body, Controller, Get, HttpCode, HttpStatus, Logger, Param, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { RunCancellationService } from './run-cancellation.service';
import { RunsService } from './runs.service';

const RUN_REQUEST_SCHEMA = {
  type: 'object',
  required: ['targetUrl', 'instructions'],
  properties: {
    targetUrl: { type: 'string', example: 'https://example.com' },
    instructions: {
      type: 'string',
      example: 'Click "Login", enter credentials, navigate to dashboard.',
    },
    repoUrl: { type: 'string', example: 'https://github.com/org/repo' },
    repoProvider: { type: 'string', enum: ['github', 'azure'], example: 'github' },
    credentialsRef: { type: 'string', example: 'my-creds' },
  },
};

const RUN_SUMMARY_SCHEMA = {
  type: 'object',
  required: ['runId', 'status', 'targetUrl', 'createdAt', 'updatedAt'],
  properties: {
    runId: { type: 'string', example: 'run-0001' },
    status: {
      type: 'string',
      enum: [
        'queued',
        'exploring',
        'analyzing',
        'reconciling',
        'review',
        'exporting',
        'done',
        'failed',
      ],
      example: 'queued',
    },
    targetUrl: { type: 'string', example: 'https://example.com' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    completedAt: { type: 'string', format: 'date-time' },
  },
};

@ApiTags('runs')
@Controller('runs')
export class RunsController {
  private readonly logger = new Logger(RunsController.name);

  constructor(
    private readonly runsService: RunsService,
    private readonly cancellationService: RunCancellationService
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new run' })
  @ApiBody({ schema: RUN_REQUEST_SCHEMA })
  @ApiResponse({
    status: 201,
    description: 'Run created successfully.',
    schema: RUN_SUMMARY_SCHEMA,
  })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  createRun(@Body() body: unknown): RunSummary {
    const targetUrl = (body as Record<string, unknown>)?.['targetUrl'];
    this.logger.log(`POST /runs — targetUrl=${targetUrl ?? '(missing)'}`);
    const result = this.runsService.createRun(body);
    this.logger.log(`Run accepted: ${result.runId}`);
    return result;
  }

  @Get()
  @ApiOperation({ summary: 'List all runs' })
  @ApiResponse({
    status: 200,
    description: 'Array of run summaries.',
    schema: { type: 'array', items: RUN_SUMMARY_SCHEMA },
  })
  getAllRuns(): RunSummary[] {
    const runs = this.runsService.getAllRuns();
    this.logger.debug(`GET /runs — returning ${runs.length} run(s)`);
    return runs;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single run by id' })
  @ApiParam({ name: 'id', description: 'The run identifier', example: 'run-0001' })
  @ApiResponse({
    status: 200,
    description: 'Run summary for the requested id.',
    schema: RUN_SUMMARY_SCHEMA,
  })
  @ApiResponse({ status: 404, description: 'Run not found.' })
  getRun(@Param('id') id: string): RunSummary {
    this.logger.debug(`GET /runs/${id}`);
    return this.runsService.getRun(id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel an in-flight run' })
  @ApiParam({ name: 'id', description: 'The run identifier', example: 'run-0001' })
  @ApiResponse({ status: 200, description: 'Cancellation accepted.' })
  cancelRun(@Param('id') id: string): { accepted: boolean; runId: string } {
    this.logger.log(`POST /runs/${id}/cancel — cancellation requested`);
    this.cancellationService.cancel(id);
    return { accepted: true, runId: id };
  }
}
