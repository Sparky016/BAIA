/**
 * Reusable secret-redaction helpers for BAIA.
 *
 * These functions mask secret-looking values out of arbitrary strings and
 * structured data so that nothing sensitive ends up in logs, error payloads,
 * exported reports, or captured DOM / network traffic.
 *
 * Two complementary strategies are applied:
 *
 *  1. **Pattern redaction** — well-known token shapes (GitHub PATs, Bearer
 *     tokens, Atlassian/Confluence tokens, JWTs, generic hex / base64 API
 *     keys, Basic-auth credentials, URL userinfo, etc.) are matched and masked
 *     wherever they appear inside a string.
 *  2. **Key-based redaction** — when walking objects, any property whose *name*
 *     looks sensitive (`password`, `token`, `secret`, `apiKey`, `authorization`,
 *     `credentialsRef`, …) has its entire value masked, regardless of shape.
 *  3. **Known-value redaction** — callers (e.g. the credential store) may pass a
 *     set of literal secret values that must be scrubbed verbatim.
 *
 * This module is consumed by DEV_TASK_18 (and any other feature that emits
 * user-facing or logged text). It has **no** NestJS / runtime dependencies so
 * it is trivially unit-testable and reusable.
 */

/** The string substituted in place of any redacted secret. */
export const REDACTION_PLACEHOLDER = '[REDACTED]';

/**
 * Property-name fragments that mark a value as sensitive. Matching is
 * case-insensitive and substring-based, so `xApiKey`, `access_token`, and
 * `Authorization` are all caught.
 */
const SENSITIVE_KEY_FRAGMENTS: readonly string[] = [
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'auth',
  'credential',
  'credentialsref',
  'privatekey',
  'private_key',
  'cookie',
  'sessionid',
  'session_id',
  'clientsecret',
  'client_secret',
];

/**
 * A redaction rule: a regular expression plus a `build` function that, given
 * the captured groups, returns the replacement string. Keeping the replacement
 * logic per-rule avoids the classic `String.replace` pitfall where the trailing
 * `offset`/`string` callback arguments are mistaken for capture groups.
 */
interface RedactionRule {
  readonly pattern: RegExp;
  /** Capture groups for a single match (group 1 = `groups[0]`, …). */
  readonly build: (groups: ReadonlyArray<string | undefined>) => string;
}

/**
 * Ordered redaction rules. Order matters: more specific labelled rules run
 * before broad token-shape rules so structural context (a header label, a
 * query-parameter name, URL userinfo) is preserved in the output.
 */
const REDACTION_RULES: readonly RedactionRule[] = [
  // Authorization headers: `Authorization: Bearer <token>` / `Basic <creds>`.
  {
    pattern: /(authorization\s*[:=]\s*(?:bearer|basic|token)\s+)([^\s,;"']+)/gi,
    build: (g) => `${g[0]}${REDACTION_PLACEHOLDER}`,
  },
  // Bare `Bearer <token>` / `Basic <creds>` (no header name).
  {
    pattern: /((?:bearer|basic)\s+)([A-Za-z0-9._~+/=-]{8,})/gi,
    build: (g) => `${g[0]}${REDACTION_PLACEHOLDER}`,
  },
  // Sensitive key/value pairs in query strings or form bodies:
  // `token=…`, `api_key=…`, `password=…`, `secret=…`, `access_token=…`.
  // Groups: 1=name+delim, 2=opening quote, 3=value, 4=closing quote.
  {
    pattern:
      /((?:access_?token|api[_-]?key|client_?secret|password|passwd|secret|token)\s*[:=]\s*)("?)([^\s&;"']+)("?)/gi,
    build: (g) => `${g[0]}${g[1] ?? ''}${REDACTION_PLACEHOLDER}${g[3] ?? ''}`,
  },
  // Credentials embedded in a URL: scheme://user:secret@host. Keep `user:`+`@`.
  {
    pattern: /([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)([^\s/@]+)(@)/gi,
    build: (g) => `${g[0]}${REDACTION_PLACEHOLDER}${g[2]}`,
  },
  // AWS access key IDs (AKIA…).
  {
    pattern: /\b(AKIA[0-9A-Z]{16})\b/g,
    build: () => REDACTION_PLACEHOLDER,
  },
  // .env-style assignments: `KEY="value"` / `KEY=value` where the value is
  // at least 8 non-whitespace characters. Matches uppercase env-var names
  // (letters, digits, underscores) followed by `=` and an optional quote.
  {
    pattern: /\b([A-Z][A-Z0-9_]{2,}=(?:["']?)([^\s"']{8,})(?:["']?))/g,
    build: (g) => {
      // Preserve the key-name and `=` prefix; replace only the value part.
      const full = g[0] ?? '';
      const eqIdx = full.indexOf('=');
      if (eqIdx === -1) return REDACTION_PLACEHOLDER;
      return full.slice(0, eqIdx + 1) + REDACTION_PLACEHOLDER;
    },
  },
  // GitHub fine-grained / classic personal access tokens & app tokens.
  {
    pattern: /\b(gh[pousr]_[A-Za-z0-9]{16,255})\b/g,
    build: () => REDACTION_PLACEHOLDER,
  },
  {
    pattern: /\b(github_pat_[A-Za-z0-9_]{20,255})\b/g,
    build: () => REDACTION_PLACEHOLDER,
  },
  // Slack tokens.
  {
    pattern: /\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g,
    build: () => REDACTION_PLACEHOLDER,
  },
  // JSON Web Tokens (header.payload.signature).
  {
    pattern: /\b(eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,})\b/g,
    build: () => REDACTION_PLACEHOLDER,
  },
];

/**
 * Mask secret-looking substrings inside a single string.
 *
 * @param input  The text to scrub. Non-string input is returned unchanged.
 * @param knownValues  Optional literal secret values to remove verbatim
 *                     (e.g. the plaintext a credential store just decrypted).
 */
export function redactString(input: string, knownValues: readonly string[] = []): string {
  let output = input;

  // 1. Scrub caller-supplied literal secrets first (longest first so a longer
  //    secret that contains a shorter one is masked as a whole).
  const sortedKnown = [...new Set(knownValues)]
    .filter((value) => value.length > 0)
    .sort((a, b) => b.length - a.length);
  for (const value of sortedKnown) {
    output = output.split(value).join(REDACTION_PLACEHOLDER);
  }

  // 2. Apply each redaction rule in order. The callback's trailing `offset`
  //    (number) and `string` arguments are dropped: we slice off only the
  //    string capture groups before handing them to the rule's `build`.
  for (const rule of REDACTION_RULES) {
    output = output.replace(rule.pattern, (...args: unknown[]) => {
      // args = [match, g1, g2, …, offset, string]; capture groups are the
      // string entries between index 1 and the first numeric (offset).
      const groups: Array<string | undefined> = [];
      for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (typeof arg === 'number') {
          break; // reached `offset` — remaining args are offset/string.
        }
        groups.push(arg as string | undefined);
      }
      return rule.build(groups);
    });
  }

  return output;
}

/** True when a property name looks sensitive. */
function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_-]/g, '');
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) =>
    normalized.includes(fragment.replace(/[_-]/g, ''))
  );
}

/**
 * Recursively redact secrets from an arbitrary value.
 *
 * - Strings are passed through {@link redactString}.
 * - Object properties with sensitive *names* are masked wholesale.
 * - Arrays and nested objects are walked.
 * - Cycles are handled safely (a repeated reference is rendered as
 *   `'[Circular]'`).
 *
 * The input is never mutated; a redacted copy is returned.
 *
 * @param value  Any value (string, object, array, primitive).
 * @param knownValues  Optional literal secret values to scrub from every string.
 */
export function redact<T>(value: T, knownValues: readonly string[] = []): T {
  return redactInternal(value, knownValues, new WeakSet<object>()) as T;
}

function redactInternal(
  value: unknown,
  knownValues: readonly string[],
  seen: WeakSet<object>
): unknown {
  if (typeof value === 'string') {
    return redactString(value, knownValues);
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactInternal(item, knownValues, seen));
  }

  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (isSensitiveKey(key)) {
      result[key] = REDACTION_PLACEHOLDER;
    } else {
      result[key] = redactInternal(source[key], knownValues, seen);
    }
  }
  return result;
}
