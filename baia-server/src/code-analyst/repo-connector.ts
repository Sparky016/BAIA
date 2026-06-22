/**
 * Provider-agnostic repository connector contract for BAIA.
 *
 * Every BAIA feature that connects to a source-code repository depends on this
 * interface — never on a concrete VCS SDK. This keeps the GitHub (DEV_TASK_21)
 * and Azure Repos (DEV_TASK_22) implementations fully swappable and makes
 * all repo-consuming code unit-testable via mock connectors.
 *
 * ## Lifecycle
 * 1. `auth(creds)` — authenticate; must be called before any other method.
 * 2. `listTree(path?)` — enumerate files/directories (optionally from a
 *    sub-path inside the repo root).
 * 3. `readFile(path)` — fetch a single file's text content.
 * 4. `clone()` — shallow-fetch / clone the repository for bulk analysis.
 *
 * ## Error contract
 * All methods reject with a {@link RepoConnectorError} so callers can branch
 * on a stable {@link RepoErrorCode} without leaking provider SDK details:
 *
 * - `AUTH_FAILED`   — credentials are invalid or missing required permissions.
 * - `NOT_FOUND`     — the requested repo, path, or file does not exist.
 * - `NETWORK_ERROR` — a transient network failure occurred.
 * - `RATE_LIMITED`  — the VCS API throttled the request.
 * - `UNKNOWN`       — any other unexpected error.
 *
 * Implementations MUST translate any internal failure into one of these codes.
 * Tokens and secrets MUST NOT appear in error messages or log output.
 */

// ── Error types ───────────────────────────────────────────────────────────────

/** Stable, provider-agnostic error codes for repo operations. */
export type RepoErrorCode =
  | 'AUTH_FAILED'
  | 'NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'RATE_LIMITED'
  | 'UNKNOWN';

/**
 * The single error type every {@link RepoConnector} method rejects with.
 *
 * Credentials MUST never appear in `message` or `detail`.
 */
export class RepoConnectorError extends Error {
  /** The original underlying error, if any. */
  public readonly cause: unknown;

  constructor(
    /** Stable, branchable error category. */
    public readonly code: RepoErrorCode,
    message: string,
    /** Optional structured context (path, HTTP status, …) — no secrets. */
    public readonly detail?: unknown,
    /** The original underlying error for diagnostics. */
    cause?: unknown
  ) {
    super(message);
    this.name = 'RepoConnectorError';
    this.cause = cause;
  }
}

// ── Tree entry ────────────────────────────────────────────────────────────────

/** A single entry returned by {@link RepoConnector.listTree}. */
export interface TreeEntry {
  /** Repo-root-relative path, e.g. `src/app/app.module.ts`. */
  path: string;
  /** `'file'` for blobs, `'dir'` for trees. */
  type: 'file' | 'dir';
  /**
   * File size in bytes, if the provider supplies it.
   * Absent for directories or when not returned by the API.
   */
  size?: number;
}

// ── Credentials ───────────────────────────────────────────────────────────────

/**
 * Opaque credential bag passed to {@link RepoConnector.auth}.
 *
 * The `token` field is the only field guaranteed to be present across all
 * providers.  Implementations that need additional fields (e.g. Azure
 * organization URL) may declare a narrower sub-type.
 *
 * The token MUST NOT be logged or serialised anywhere.
 */
export interface RepoCredentials {
  /** Personal access token or OAuth token. MUST NOT be logged. */
  readonly token: string;
  /** Provider-specific extra fields (e.g. org, project). */
  readonly [extra: string]: string;
}

// ── Clone result ──────────────────────────────────────────────────────────────

/**
 * Result of a {@link RepoConnector.clone} operation.
 *
 * For network-based connectors that do a shallow fetch rather than a full
 * `git clone`, `localPath` may be absent and `files` carries the fetched
 * content directly.
 */
export interface CloneResult {
  /**
   * Absolute path to the local working copy, when the implementation actually
   * clones to disk (e.g. via `simple-git`).
   */
  localPath?: string;
  /**
   * Flat map of repo-relative path → file content for API-based shallow
   * fetches that do not write to disk.
   */
  files?: Map<string, string>;
}

// ── RepoConnector interface ───────────────────────────────────────────────────

/**
 * Provider-agnostic repository connector.
 *
 * Implementations are responsible for:
 * - Keeping the auth token private (never passing it to `Logger` or `console`).
 * - Translating all provider errors into {@link RepoConnectorError}.
 */
export interface RepoConnector {
  /**
   * Authenticates the connector with the VCS provider.
   *
   * Must be called exactly once before any other method.  Callers MUST NOT
   * log the `creds` object; implementations likewise MUST NOT log the token.
   *
   * @throws {RepoConnectorError} code `AUTH_FAILED` when credentials are invalid.
   */
  auth(creds: RepoCredentials): Promise<void>;

  /**
   * Lists all files and directories in the repository tree.
   *
   * @param subPath Optional path relative to the repo root to limit listing.
   *                Defaults to the repo root when omitted.
   * @returns Flat list of {@link TreeEntry} objects.
   * @throws {RepoConnectorError} code `NOT_FOUND` when `subPath` does not exist.
   * @throws {RepoConnectorError} code `AUTH_FAILED` when not yet authenticated.
   */
  listTree(subPath?: string): Promise<TreeEntry[]>;

  /**
   * Reads the UTF-8 content of a single file.
   *
   * @param path Repo-root-relative path to the file.
   * @returns File content as a string.
   * @throws {RepoConnectorError} code `NOT_FOUND` when the file does not exist.
   * @throws {RepoConnectorError} code `AUTH_FAILED` when not yet authenticated.
   */
  readFile(path: string): Promise<string>;

  /**
   * Shallow-clones or bulk-fetches the repository.
   *
   * Implementations MAY clone to a temp directory on disk or fetch files via
   * the API and return them in {@link CloneResult.files}.
   *
   * @returns {@link CloneResult} with either a local path or an in-memory map.
   * @throws {RepoConnectorError} on any provider-level failure.
   */
  clone(): Promise<CloneResult>;
}

// ── Injection token ───────────────────────────────────────────────────────────

/**
 * NestJS DI token for the active {@link RepoConnector} implementation.
 *
 * Always inject the contract through this token so the bound implementation
 * (GitHub vs. Azure) stays swappable:
 *
 * ```ts
 * constructor(@Inject(REPO_CONNECTOR) private readonly repo: RepoConnector) {}
 * ```
 */
export const REPO_CONNECTOR = Symbol('REPO_CONNECTOR');

// ── Factory helper type ───────────────────────────────────────────────────────

/**
 * Configuration fields a {@link RepoConnector} factory needs to select the
 * right implementation and configure the repo URL.
 */
export type RepoConnectorConfig = {
  repoUrl?: string;
  repoProvider?: 'github' | 'azure';
};
