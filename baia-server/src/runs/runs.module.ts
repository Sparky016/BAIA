import { Module } from '@nestjs/common';

import { RunCancellationService } from './run-cancellation.service';
import { RunStateMachine } from './run-state-machine';
import { RunsController } from './runs.controller';
import { RunsEventsService } from './runs.events';
import { RunsService } from './runs.service';
import { RunsSseController } from './runs.sse.controller';

@Module({
  controllers: [RunsController, RunsSseController],
  providers: [
    RunsEventsService,
    {
      provide: RunStateMachine,
      useFactory: (runsEvents: RunsEventsService) => {
        const machine = new RunStateMachine();
        machine.onTransition((e) => runsEvents.emit(e.runId, e));
        return machine;
      },
      inject: [RunsEventsService],
    },
    RunsService,
    RunCancellationService,
  ],
  exports: [RunsService, RunStateMachine, RunsEventsService, RunCancellationService],
})
export class RunsModule {}
