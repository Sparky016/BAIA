import { RunSummary } from '@baia/shared';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';

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
  createRun(@Body() body: unknown): RunSummary {
    return this.runsService.createRun(body);
  }

  /**
   * Retrieve all runs.
   *
   * Returns 200 OK with an array of `RunSummary`.
   */
  @Get()
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
  getRun(@Param('id') id: string): RunSummary {
    return this.runsService.getRun(id);
  }
}
