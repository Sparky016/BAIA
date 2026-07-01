import { Injectable } from '@nestjs/common';

@Injectable()
export class RunCancellationService {
  private readonly cancelled = new Set<string>();

  cancel(runId: string): void {
    this.cancelled.add(runId);
  }

  isCancelled(runId: string): boolean {
    return this.cancelled.has(runId);
  }

  clear(runId: string): void {
    this.cancelled.delete(runId);
  }
}
