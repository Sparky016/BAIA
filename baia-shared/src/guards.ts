import { RunRequest } from './models/RunRequest';
import { RunStatus } from './models/RunStatus';

export function isRunRequest(obj: unknown): obj is RunRequest {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const candidate = obj as Record<string, unknown>;

  if (typeof candidate['targetUrl'] !== 'string' || typeof candidate['instructions'] !== 'string') {
    return false;
  }

  // Optional fields: valid if absent (undefined), invalid if present with wrong type/value.
  if (candidate['repoUrl'] !== undefined && typeof candidate['repoUrl'] !== 'string') {
    return false;
  }

  if (
    candidate['repoProvider'] !== undefined &&
    candidate['repoProvider'] !== 'github' &&
    candidate['repoProvider'] !== 'azure'
  ) {
    return false;
  }

  if (
    candidate['credentialsRef'] !== undefined &&
    typeof candidate['credentialsRef'] !== 'string'
  ) {
    return false;
  }

  return true;
}

export function isValidRunStatus(value: unknown): value is RunStatus {
  return Object.values(RunStatus).includes(value as RunStatus);
}
