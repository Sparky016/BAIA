import { RunSummary } from '@baia/shared';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { RunsService } from './runs.service';

const RUN_REQUEST_SCHEMA = {
  type: 'object',
  required: ['targetUrl', 'instructions', 'repoUrl', 'repoProvider', 'credentialsRef'],
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
  constructor(private readonly runsService: RunsService) {}

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
    return this.runsService.createRun(body);
  }

  @Get()
  @ApiOperation({ summary: 'List all runs' })
  @ApiResponse({
    status: 200,
    description: 'Array of run summaries.',
    schema: { type: 'array', items: RUN_SUMMARY_SCHEMA },
  })
  getAllRuns(): RunSummary[] {
    return this.runsService.getAllRuns();
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
    return this.runsService.getRun(id);
  }
}
