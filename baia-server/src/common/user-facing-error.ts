import { ConfluenceAdapterError } from '../export/confluence.adapter';
import { LlmError } from '../llm/llm.service';
import { CredentialStoreError } from '../security/credential-store.service';

/**
 * Translate an internal/LLM/credential error into an actionable user-facing
 * message. The original technical error should be kept in server logs; only
 * this message should be surfaced to the end user.
 *
 * @param err   The caught error (may be anything).
 * @param phase Optional phase name for the generic fallback message,
 *              e.g. "Phase 1 (Explore)".
 */
export function toUserMessage(err: unknown, phase?: string): string {
  if (err instanceof LlmError) {
    switch (err.code) {
      case 'TIMEOUT':
        return 'The AI took too long to respond. This can happen with complex pages — try again or simplify the instructions.';
      case 'RATE_LIMITED':
        return 'The AI provider is rate-limiting requests right now. Wait a moment and retry.';
      case 'CONTENT_FILTERED':
        return 'The AI provider filtered the response. Try rephrasing the instructions.';
      case 'SCHEMA_VALIDATION':
        return 'The AI returned an unexpected response format. Try again — if this persists, check the server logs.';
      case 'PROVIDER_ERROR':
        return 'The AI provider returned an error. Check server logs or try again shortly.';
      case 'INVALID_INPUT':
        return 'Invalid input was sent to the AI provider. Check your configuration.';
    }
  }

  if (err instanceof CredentialStoreError) {
    switch (err.code) {
      case 'NOT_FOUND':
        return 'No credentials found for that reference. Check the credentials reference you entered.';
      case 'DECRYPTION_FAILED':
        return 'Stored credentials could not be read — they may have been created with a different encryption key. Re-enter your credentials.';
      case 'MISSING_KEY':
        return 'The encryption key is not configured. Set the CREDENTIAL_ENCRYPTION_KEY environment variable.';
    }
  }

  if (err instanceof ConfluenceAdapterError) {
    if (err.statusCode !== undefined && err.statusCode >= 500) {
      return 'Confluence appears to be unavailable right now. Try again shortly.';
    }
    switch (err.code) {
      case 'AUTH_FAILED':
        return 'Confluence authentication failed. Check your credentials.';
      case 'NOT_FOUND':
        return 'The Confluence space or page could not be found — check the Space Key.';
      case 'API_ERROR':
        return 'A Confluence API error occurred. Check your Confluence configuration.';
    }
  }

  return `Something unexpected happened${phase ? ` during ${phase}` : ''}. Check server logs for details.`;
}
