import { Module } from '@nestjs/common';

import { RunStateMachine } from './run-state-machine';
import { RunsController } from './runs.controller';
import { RunsEventsService } from './runs.events';
import { RunsService } from './runs.service';
import { RunsSseController } from './runs.sse.controller';

@Module({
  controllers: [RunsController, RunsSseController],
  providers: [
    { provide: RunStateMachine, useFactory: () => new RunStateMachine() },
    RunsService,
    RunsEventsService,
  ],
  exports: [RunsService, RunStateMachine, RunsEventsService],
})
export class RunsModule {}
