import { Injectable } from '@nestjs/common';

import { CapturedStep } from './crawl-capture.service';

export type ExitReason =
  | 'success-criteria-reached'
  | '404-detected'
  | 'repeated-result'
  | 'repeated-failure'
  | 'max-steps'
  | 'timeout';

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

    if (this.is404(latest)) {
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

    if (this.isRepeatedFailure(steps)) {
      return {
        shouldExit: true,
        exitReason: 'repeated-failure',
        message: `Exit gate: 3 consecutive action failures detected at ${latest.url}`,
      };
    }

    return CONTINUE;
  }

  private is404(step: CapturedStep): boolean {
    // HTTP status check (more reliable than DOM text)
    if (step.httpStatus === 404) return true;

    // Fallback DOM text heuristic
    const lower = step.domSnapshot.toLowerCase();
    const has404Token = lower.includes('404');
    const hasNotFoundPhrase =
      lower.includes('not found') ||
      lower.includes('page not found') ||
      lower.includes('does not exist');
    return has404Token && hasNotFoundPhrase;
  }

  private domFingerprint(domSnapshot: string): string {
    // Use first 200 chars of normalized DOM as a structural fingerprint
    return domSnapshot.trim().slice(0, 200);
  }

  private isRepeatedResult(steps: CapturedStep[]): boolean {
    if (steps.length < 3) return false;
    const last3 = steps.slice(-3);
    const [a, b, c] = last3;
    const sameUrl = a.url === b.url && b.url === c.url;
    const sameDom =
      this.domFingerprint(a.domSnapshot) === this.domFingerprint(b.domSnapshot) &&
      this.domFingerprint(b.domSnapshot) === this.domFingerprint(c.domSnapshot);
    return sameUrl && sameDom;
  }

  private isRepeatedFailure(steps: CapturedStep[]): boolean {
    if (steps.length < 3) return false;
    // 3 consecutive failures (original check)
    const last3 = steps.slice(-3);
    if (last3.every((step) => step.ok === false)) return true;

    // Windowed check: 3 out of last 5
    if (steps.length >= 5) {
      const last5 = steps.slice(-5);
      const failCount = last5.filter((step) => !step.ok).length;
      if (failCount >= 3) return true;
    }

    return false;
  }
}
