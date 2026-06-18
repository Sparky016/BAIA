import { RunSummary } from '@baia/shared';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { RunsService } from './runs.service';

/**
 * REST surface for the runs domain.
 *
 *   POST /runs          — create a new run (body: RunRequest)
 *   GET  /runs          — list all runs
 *   GET  /runs/:id      — get a single run by id
 *
 * Validation and 404 errors are thrown by `RunsService`; NestJS exception
 * filters translate them to the appropriate HTTP responses automatically.
 */
@ApiTags('runs')
@Controller('runs')
export class RunsController {
  constructor(private readonly runsService: RunsService) {}

  /**
   * Create a new run.
   *
   * Returns 201 Created with the `RunSummary` on success.
   * Returns 400 Bad Request with field errors when the body fails validation.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new run' })
  @ApiResponse({ status: 201, description: 'Run created successfully.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  createRun(@Body() body: unknown): RunSummary {
    return this.runsService.createRun(body);
  }

  /**
   * Retrieve all runs.
   *
   * Returns 200 OK with an array of `RunSummary`.
   */
  @Get()
  @ApiOperation({ summary: 'List all runs' })
  @ApiResponse({ status: 200, description: 'Array of run summaries.' })
  getAllRuns(): RunSummary[] {
    return this.runsService.getAllRuns();
  }

  /**
   * Retrieve a single run by id.
   *
   * Returns 200 OK with the `RunSummary` when found.
   * Returns 404 Not Found when the id is unknown.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a single run by id' })
  @ApiParam({ name: 'id', description: 'The run identifier', example: 'run-0001' })
  @ApiResponse({ status: 200, description: 'Run summary for the requested id.' })
  @ApiResponse({ status: 404, description: 'Run not found.' })
  getRun(@Param('id') id: string): RunSummary {
    return this.runsService.getRun(id);
  }
}
