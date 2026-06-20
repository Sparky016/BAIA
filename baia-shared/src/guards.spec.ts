import { isRunRequest, isValidRunStatus } from './guards';
import { RunStatus } from './models/RunStatus';
import { RunRequest } from './models/RunRequest';

describe('Type Guards', () => {
  describe('isRunRequest', () => {
    it('should return true for valid RunRequest object', () => {
      const validRequest: RunRequest = {
        targetUrl: 'https://example.com',
        instructions: 'Test the login flow',
        repoUrl: 'https://github.com/test/repo',
        repoProvider: 'github',
        credentialsRef: 'github-token-v1',
      };

      expect(isRunRequest(validRequest)).toBe(true);
    });

    it('should return true for valid RunRequest with azure provider', () => {
      const validRequest = {
        targetUrl: 'https://example.com',
        instructions: 'Test the signup flow',
        repoUrl: 'https://dev.azure.com/org/project/_git/repo',
        repoProvider: 'azure',
        credentialsRef: 'azure-pat-v1',
      };

      expect(isRunRequest(validRequest)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isRunRequest(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isRunRequest(undefined)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isRunRequest('not an object')).toBe(false);
      expect(isRunRequest(42)).toBe(false);
      expect(isRunRequest(true)).toBe(false);
    });

    it('should return false for missing targetUrl', () => {
      const invalidRequest = {
        instructions: 'Test the login flow',
        repoUrl: 'https://github.com/test/repo',
        repoProvider: 'github',
        credentialsRef: 'github-token-v1',
      };

      expect(isRunRequest(invalidRequest)).toBe(false);
    });

    it('should return false for missing instructions', () => {
      const invalidRequest = {
        targetUrl: 'https://example.com',
        repoUrl: 'https://github.com/test/repo',
        repoProvider: 'github',
        credentialsRef: 'github-token-v1',
      };

      expect(isRunRequest(invalidRequest)).toBe(false);
    });

    it('should return true when repoUrl is absent', () => {
      const request = {
        targetUrl: 'https://example.com',
        instructions: 'Test the login flow',
        repoProvider: 'github',
        credentialsRef: 'github-token-v1',
      };

      expect(isRunRequest(request)).toBe(true);
    });

    it('should return true when repoProvider is absent', () => {
      const request = {
        targetUrl: 'https://example.com',
        instructions: 'Test the login flow',
        repoUrl: 'https://github.com/test/repo',
        credentialsRef: 'github-token-v1',
      };

      expect(isRunRequest(request)).toBe(true);
    });

    it('should return false for invalid repoProvider', () => {
      const invalidRequest = {
        targetUrl: 'https://example.com',
        instructions: 'Test the login flow',
        repoUrl: 'https://github.com/test/repo',
        repoProvider: 'bitbucket',
        credentialsRef: 'github-token-v1',
      };

      expect(isRunRequest(invalidRequest)).toBe(false);
    });

    it('should return true when credentialsRef is absent', () => {
      const request = {
        targetUrl: 'https://example.com',
        instructions: 'Test the login flow',
        repoUrl: 'https://github.com/test/repo',
        repoProvider: 'github',
      };

      expect(isRunRequest(request)).toBe(true);
    });

    it('should return true when only targetUrl and instructions are provided', () => {
      expect(
        isRunRequest({ targetUrl: 'https://example.com', instructions: 'Explore the homepage' })
      ).toBe(true);
    });

    it('should return false for non-string targetUrl', () => {
      const invalidRequest = {
        targetUrl: 123,
        instructions: 'Test the login flow',
        repoUrl: 'https://github.com/test/repo',
        repoProvider: 'github',
        credentialsRef: 'github-token-v1',
      };

      expect(isRunRequest(invalidRequest)).toBe(false);
    });

    it('should return false for non-string instructions', () => {
      const invalidRequest = {
        targetUrl: 'https://example.com',
        instructions: { description: 'Test the login flow' },
        repoUrl: 'https://github.com/test/repo',
        repoProvider: 'github',
        credentialsRef: 'github-token-v1',
      };

      expect(isRunRequest(invalidRequest)).toBe(false);
    });

    it('should return false for non-string repoUrl', () => {
      const invalidRequest = {
        targetUrl: 'https://example.com',
        instructions: 'Test the login flow',
        repoUrl: ['https://github.com/test/repo'],
        repoProvider: 'github',
        credentialsRef: 'github-token-v1',
      };

      expect(isRunRequest(invalidRequest)).toBe(false);
    });

    it('should return false for non-string credentialsRef', () => {
      const invalidRequest = {
        targetUrl: 'https://example.com',
        instructions: 'Test the login flow',
        repoUrl: 'https://github.com/test/repo',
        repoProvider: 'github',
        credentialsRef: null,
      };

      expect(isRunRequest(invalidRequest)).toBe(false);
    });
  });

  describe('isValidRunStatus', () => {
    it('should return true for all valid RunStatus values', () => {
      expect(isValidRunStatus(RunStatus.Queued)).toBe(true);
      expect(isValidRunStatus(RunStatus.Exploring)).toBe(true);
      expect(isValidRunStatus(RunStatus.Analyzing)).toBe(true);
      expect(isValidRunStatus(RunStatus.Reconciling)).toBe(true);
      expect(isValidRunStatus(RunStatus.Review)).toBe(true);
      expect(isValidRunStatus(RunStatus.Exporting)).toBe(true);
      expect(isValidRunStatus(RunStatus.Done)).toBe(true);
      expect(isValidRunStatus(RunStatus.Failed)).toBe(true);
    });

    it('should return true for valid status string literals', () => {
      expect(isValidRunStatus('queued')).toBe(true);
      expect(isValidRunStatus('exploring')).toBe(true);
      expect(isValidRunStatus('analyzing')).toBe(true);
      expect(isValidRunStatus('reconciling')).toBe(true);
      expect(isValidRunStatus('review')).toBe(true);
      expect(isValidRunStatus('exporting')).toBe(true);
      expect(isValidRunStatus('done')).toBe(true);
      expect(isValidRunStatus('failed')).toBe(true);
    });

    it('should return false for invalid status strings', () => {
      expect(isValidRunStatus('invalid')).toBe(false);
      expect(isValidRunStatus('pending')).toBe(false);
      expect(isValidRunStatus('running')).toBe(false);
    });

    it('should return false for null', () => {
      expect(isValidRunStatus(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidRunStatus(undefined)).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(isValidRunStatus(42)).toBe(false);
      expect(isValidRunStatus(true)).toBe(false);
      expect(isValidRunStatus({})).toBe(false);
      expect(isValidRunStatus([])).toBe(false);
    });

    it('should return false for case-sensitive mismatches', () => {
      expect(isValidRunStatus('QUEUED')).toBe(false);
      expect(isValidRunStatus('Queued')).toBe(false);
      expect(isValidRunStatus('DONE')).toBe(false);
    });
  });
});
