import { RunRequest } from './models/RunRequest';
import { RunStatus } from './models/RunStatus';

export function isRunRequest(obj: unknown): obj is RunRequest {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const candidate = obj as Record<string, unknown>;

  return (
    typeof candidate.targetUrl === 'string' &&
    typeof candidate.instructions === 'string' &&
    typeof candidate.repoUrl === 'string' &&
    (candidate.repoProvider === 'github' || candidate.repoProvider === 'azure') &&
    typeof candidate.credentialsRef === 'string'
  );
}

export function isValidRunStatus(value: unknown): value is RunStatus {
  return Object.values(RunStatus).includes(value as RunStatus);
}
