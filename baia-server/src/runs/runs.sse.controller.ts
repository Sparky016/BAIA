import { Controller, MessageEvent, Param, Sse } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { merge, timer, Observable, Subject } from 'rxjs';
import { map, takeUntil, finalize } from 'rxjs/operators';

import { RunsEventsService } from './runs.events';

/**
 * SSE controller for run progress events.
 *
 * Exposes `GET /runs/:id/events` — an SSE stream that forwards all
 * `RunStreamEvent` payloads emitted by `RunsEventsService` for the given run.
 *
 * The stream naturally completes when the run reaches a terminal state
 * (`done` / `failed`), at which point `RunsEventsService` completes the
 * underlying Subject and the HTTP connection is closed.
 *
 * Module wiring (`RunsModule`) is intentionally left to the orchestrator
 * (DEV_TASK orchestration wave); this controller registers itself only via
 * the module that imports it.
 */
@ApiTags('runs')
@Controller('runs')
export class RunsSseController {
  constructor(private readonly eventsService: RunsEventsService) {}

  /**
   * SSE endpoint: stream progress events for a single run.
   *
   * NestJS's `@Sse` decorator sets `Content-Type: text/event-stream` and
   * expects the handler to return an `Observable<MessageEvent>`.  Each emitted
   * `MessageEvent` becomes a `data:` frame on the wire.
   *
   * @param id  The `runId` path parameter.
   * @returns   Observable of SSE `MessageEvent` frames, one per run event.
   */
  @Sse(':id/events')
  @ApiOperation({ summary: 'Stream Server-Sent Events for a run' })
  @ApiParam({ name: 'id', description: 'The run identifier', example: 'run-0001' })
  @ApiResponse({
    status: 200,
    description: 'SSE stream of run progress events (text/event-stream). Includes periodic heartbeat frames (every 15 s) with payload { type: "heartbeat" } to distinguish a stalled pipeline from a dead connection.',
    schema: {
      type: 'string',
      description: 'Newline-delimited SSE frames containing JSON-encoded RunStreamEvent payloads or heartbeat objects.',
    },
  })
  @ApiResponse({ status: 404, description: 'Run not found.' })
  streamEvents(@Param('id') id: string): Observable<MessageEvent> {
    const done$ = new Subject<void>();
    const events$ = this.eventsService.stream(id).pipe(
      map((event): MessageEvent => ({ data: event })),
      finalize(() => { done$.next(); done$.complete(); })
    );
    const heartbeat$ = timer(15_000, 15_000).pipe(
      map((): MessageEvent => ({ data: { type: 'heartbeat' } })),
      takeUntil(done$)
    );
    return merge(events$, heartbeat$);
  }
}
