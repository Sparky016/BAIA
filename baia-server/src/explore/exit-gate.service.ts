import { Injectable } from '@nestjs/common';

import { CapturedStep } from './crawl-capture.service';

export type ExitReason = 'success-criteria-reached' | '404-detected' | 'repeated-result';

export interface ExitDecision {
  shouldExit: boolean;
  exitReason: ExitReason | null;
  message: string;
}

const CONTINUE: ExitDecision = { shouldExit: false, exitReason: null, message: 'Continue' };

@Injectable()
export class ExitGateService {
  checkStep(steps: CapturedStep[]): ExitDecision {
    if (steps.length === 0) return CONTINUE;

    const latest = steps[steps.length - 1];

    if (this.is404(latest.domSnapshot)) {
      return {
        shouldExit: true,
        exitReason: '404-detected',
        message: `Exit gate: 404 page detected at ${latest.url}`,
      };
    }

    if (this.isRepeatedResult(steps)) {
      return {
        shouldExit: true,
        exitReason: 'repeated-result',
        message: `Exit gate: same result observed 3 times in a row at ${latest.url}`,
      };
    }

    return CONTINUE;
  }

  private is404(domSnapshot: string): boolean {
    const lower = domSnapshot.toLowerCase();
    const has404Token = lower.includes('404');
    const hasNotFoundPhrase =
      lower.includes('not found') ||
      lower.includes('page not found') ||
      lower.includes('does not exist');
    return has404Token && hasNotFoundPhrase;
  }

  private isRepeatedResult(steps: CapturedStep[]): boolean {
    if (steps.length < 3) return false;
    const last3 = steps.slice(-3);
    const [a, b, c] = last3;
    return a.url === b.url && b.url === c.url && a.observation === b.observation && b.observation === c.observation;
  }
}
