import { ConfluenceAdapterError } from '../export/confluence.adapter';
import { LlmError } from '../llm/llm.service';
import { CredentialStoreError } from '../security/credential-store.service';

import { toUserMessage } from './user-facing-error';

describe('toUserMessage()', () => {
  describe('LlmError', () => {
    it('maps TIMEOUT to a user-friendly retry message', () => {
      const err = new LlmError('TIMEOUT', 'request timed out');
      expect(toUserMessage(err)).toBe(
        'The AI took too long to respond. This can happen with complex pages — try again or simplify the instructions.'
      );
    });

    it('maps RATE_LIMITED to a wait-and-retry message', () => {
      const err = new LlmError('RATE_LIMITED', 'too many requests');
      expect(toUserMessage(err)).toBe(
        'The AI provider is rate-limiting requests right now. Wait a moment and retry.'
      );
    });

    it('maps CONTENT_FILTERED to a rephrase suggestion', () => {
      const err = new LlmError('CONTENT_FILTERED', 'content filtered');
      expect(toUserMessage(err)).toBe(
        'The AI provider filtered the response. Try rephrasing the instructions.'
      );
    });

    it('maps SCHEMA_VALIDATION to a try-again message', () => {
      const err = new LlmError('SCHEMA_VALIDATION', 'schema mismatch');
      expect(toUserMessage(err)).toBe(
        'The AI returned an unexpected response format. Try again — if this persists, check the server logs.'
      );
    });

    it('maps PROVIDER_ERROR to a check-logs message', () => {
      const err = new LlmError('PROVIDER_ERROR', 'upstream 503');
      expect(toUserMessage(err)).toBe(
        'The AI provider returned an error. Check server logs or try again shortly.'
      );
    });

    it('maps INVALID_INPUT to a configuration check message', () => {
      const err = new LlmError('INVALID_INPUT', 'empty prompt');
      expect(toUserMessage(err)).toBe(
        'Invalid input was sent to the AI provider. Check your configuration.'
      );
    });
  });

  describe('CredentialStoreError', () => {
    it('maps NOT_FOUND to a credentials-check message', () => {
      const err = new CredentialStoreError('No credential stored for ref="x".', 'NOT_FOUND');
      expect(toUserMessage(err)).toBe(
        'No credentials found for that reference. Check the credentials reference you entered.'
      );
    });

    it('maps DECRYPTION_FAILED to a re-enter credentials message', () => {
      const err = new CredentialStoreError('Failed to decrypt.', 'DECRYPTION_FAILED');
      expect(toUserMessage(err)).toBe(
        'Stored credentials could not be read — they may have been created with a different encryption key. Re-enter your credentials.'
      );
    });

    it('maps MISSING_KEY to an env-var configuration message', () => {
      const err = new CredentialStoreError('Key not configured.', 'MISSING_KEY');
      expect(toUserMessage(err)).toBe(
        'The encryption key is not configured. Set the CREDENTIAL_ENCRYPTION_KEY environment variable.'
      );
    });
  });

  describe('ConfluenceAdapterError', () => {
    it('maps NOT_FOUND code to a space-key check message', () => {
      const err = new ConfluenceAdapterError('Space not found.', 'NOT_FOUND', 404);
      expect(toUserMessage(err)).toBe(
        'The Confluence space or page could not be found — check the Space Key.'
      );
    });

    it('maps a 5xx statusCode to an unavailable message regardless of code', () => {
      const err = new ConfluenceAdapterError('Confluence 503.', 'API_ERROR', 503);
      expect(toUserMessage(err)).toBe(
        'Confluence appears to be unavailable right now. Try again shortly.'
      );
    });

    it('maps AUTH_FAILED to a credentials check message', () => {
      const err = new ConfluenceAdapterError('Auth failed.', 'AUTH_FAILED', 401);
      expect(toUserMessage(err)).toBe(
        'Confluence authentication failed. Check your credentials.'
      );
    });

    it('maps API_ERROR (non-5xx) to a configuration message', () => {
      const err = new ConfluenceAdapterError('Bad request.', 'API_ERROR', 400);
      expect(toUserMessage(err)).toBe(
        'A Confluence API error occurred. Check your Confluence configuration.'
      );
    });
  });

  describe('unknown error fallback', () => {
    it('returns a generic fallback message for unknown errors', () => {
      expect(toUserMessage(new Error('something totally unexpected'))).toBe(
        'Something unexpected happened. Check server logs for details.'
      );
    });

    it('includes the phase name in the fallback message when provided', () => {
      expect(toUserMessage(new Error('oops'), 'Phase 1 (Explore)')).toBe(
        'Something unexpected happened during Phase 1 (Explore). Check server logs for details.'
      );
    });

    it('handles non-Error thrown values', () => {
      expect(toUserMessage('a string error', 'Export')).toBe(
        'Something unexpected happened during Export. Check server logs for details.'
      );
    });
  });
});
