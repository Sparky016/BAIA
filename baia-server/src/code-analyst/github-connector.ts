/**
 * GitHub implementation of {@link RepoConnector}.
 *
 * Uses the GitHub REST API (via an injectable {@link GitHubApiClient}) to:
 * - Verify credentials with `GET /user` (auth).
 * - Walk the recursive Git tree (`GET /repos/{owner}/{repo}/git/trees/{sha}`)
 *   to list all entries in the repository.
 * - Fetch file blobs via `GET /repos/{owner}/{repo}/contents/{path}`.
 * - Shallow-fetch all files via the tree API (clone).
 *
 * ## Security
 * The auth token is stored in a private field and is NEVER passed to
 * {@link Logger} or any error message.  The {@link GitHubApiClient} receives
 * the token only during construction through {@link GITHUB_API_CLIENT_FACTORY},
 * which is also the boundary where the token leaves the connector.
 *
 * ## Mockability
 * The Octokit client is hidden behind the {@link GitHubApiClient} interface
 * and supplied via the {@link GITHUB_API_CLIENT_FACTORY} injection token.
 * Tests inject a factory that returns a plain object implementing the interface,
 * so no real HTTP calls are made and the ESM-only `@octokit/rest` package is
 * never imported in the test process.
 */

import { Buffer } from 'node:buffer';

import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  CloneResult,
  RepoConnector,
  RepoConnectorError,
  RepoCredentials,
  TreeEntry,
} from './repo-connector';

// ── Minimal GitHub API surface the connector depends on ────────────────────

/**
 * Subset of the GitHub REST API surface used by {@link GitHubConnector}.
 *
 * Keeping this narrow (rather than importing the full Octokit type) means:
 *  1. Tests can implement a plain object — no ESM issues.
 *  2. The interface compiles even if `@octokit/rest` is not installed.
 */
export interface GitHubApiClient {
  /** `GET /user` — verify the token is valid. */
  getAuthenticatedUser(): Promise<{ login: string }>;

  /**
   * `GET /repos/{owner}/{repo}/git/trees/{treeSha}?recursive=1`
   * Returns a recursive tree listing.
   */
  getTree(
    owner: string,
    repo: string,
    treeSha: string
  ): Promise<
    Array<{
      path: string;
      type: 'blob' | 'tree' | string;
      size?: number;
    }>
  >;

  /**
   * `GET /repos/{owner}/{repo}/contents/{path}`
   * Returns the default-branch file content (base64-encoded).
   */
  getContents(
    owner: string,
    repo: string,
    path: string
  ): Promise<{ content: string; encoding: string }>;

  /**
   * `GET /repos/{owner}/{repo}` — fetch the default branch SHA.
   * Returns `{ default_branch: string }`.
   */
  getRepo(owner: string, repo: string): Promise<{ default_branch: string }>;

  /**
   * `GET /repos/{owner}/{repo}/git/refs/heads/{branch}`
   * Returns the SHA of the branch tip.
   */
  getBranchSha(owner: string, repo: string, branch: string): Promise<string>;
}

// ── Factory injection token ─────────────────────────────────────────────────

/**
 * NestJS DI token for the {@link GitHubApiClient} factory.
 *
 * A factory `(token: string) => GitHubApiClient` is provided so the
 * module can pass the PAT to the Octokit constructor at runtime, while
 * tests inject a factory returning a mock object (no real HTTP, no ESM).
 */
export const GITHUB_API_CLIENT_FACTORY = 'GITHUB_API_CLIENT_FACTORY';

/** Factory function type for {@link GitHubApiClient}. */
export type GitHubApiClientFactory = (token: string) => GitHubApiClient;

// ── Real Octokit factory (used in production module wiring) ────────────────

/**
 * Builds the production {@link GitHubApiClient} factory that wraps
 * `@octokit/rest`.
 *
 * This function is used only in module wiring (`code-analyst.module.ts`), not
 * in the connector class itself, so tests never import `@octokit/rest`.
 *
 * It is exported as a named async factory so NestJS `useFactory` can `await`
 * it after dynamically importing the ESM-only package.
 *
 * @returns A factory function `(token) => GitHubApiClient`.
 */
export async function buildOctokitFactory(): Promise<GitHubApiClientFactory> {
  // Dynamic import isolates the ESM-only @octokit/rest from CommonJS test env.
  const { Octokit } = await import('@octokit/rest');

  return (token: string): GitHubApiClient => {
    const octokit = new Octokit({ auth: token });

    return {
      async getAuthenticatedUser() {
        const { data } = await octokit.rest.users.getAuthenticated();
        return { login: data.login };
      },

      async getTree(owner, repo, treeSha) {
        const { data } = await octokit.rest.git.getTree({
          owner,
          repo,
          tree_sha: treeSha,
          recursive: '1',
        });
        return (data.tree ?? []).map((entry) => ({
          path: entry.path ?? '',
          type: entry.type ?? 'blob',
          size: entry.size,
        }));
      },

      async getContents(owner, repo, path) {
        const { data } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path,
        });
        if (Array.isArray(data)) {
          throw new Error(`Path "${path}" is a directory, not a file`);
        }
        const file = data as { content?: string; encoding?: string };
        return {
          content: file.content ?? '',
          encoding: file.encoding ?? 'base64',
        };
      },

      async getRepo(owner, repo) {
        const { data } = await octokit.rest.repos.get({ owner, repo });
        return { default_branch: data.default_branch };
      },

      async getBranchSha(owner, repo, branch) {
        const { data } = await octokit.rest.git.getRef({
          owner,
          repo,
          ref: `heads/${branch}`,
        });
        return data.object.sha;
      },
    };
  };
}

// ── Concurrency control ────────────────────────────────────────────────────

/**
 * Maximum number of simultaneous `getContents` requests issued during
 * {@link GitHubConnector.clone}.  Keeps throughput high while staying well
 * within GitHub's API rate limits.
 */
const CONCURRENCY = 5;

// ── GitHubConnector ────────────────────────────────────────────────────────

/**
 * Parses a GitHub repo URL into `{ owner, repo }`.
 *
 * Accepts:
 * - `https://github.com/{owner}/{repo}`
 * - `https://github.com/{owner}/{repo}.git`
 * - `git@github.com:{owner}/{repo}.git`
 */
function parseGitHubUrl(url: string): { owner: string; repo: string } {
  // SSH: git@github.com:owner/repo.git
  const sshMatch = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/.exec(url);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }
  // HTTPS: https://github.com/owner/repo[.git]
  const httpsMatch = /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/.exec(url);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }
  throw new RepoConnectorError(
    'UNKNOWN',
    `Cannot parse GitHub repo URL: "${url}". Expected https://github.com/{owner}/{repo}[.git] or git@github.com:{owner}/{repo}.git`,
    { url }
  );
}

/**
 * Decodes a base64-encoded string returned by the GitHub contents API.
 * The API returns content with newline characters; we strip those first.
 */
function decodeBase64(encoded: string): string {
  return Buffer.from(encoded.replace(/\n/g, ''), 'base64').toString('utf8');
}

/**
 * GitHub implementation of {@link RepoConnector}.
 *
 * Inject via the {@link REPO_CONNECTOR} token; do NOT construct directly.
 *
 * ```ts
 * constructor(@Inject(REPO_CONNECTOR) private readonly repo: RepoConnector) {}
 * ```
 *
 * The {@link GitHubApiClient} is created by the injected
 * {@link GITHUB_API_CLIENT_FACTORY} after {@link auth} is called, so
 * the PAT is never stored before authentication is requested.
 */
@Injectable()
export class GitHubConnector implements RepoConnector {
  private readonly logger = new Logger(GitHubConnector.name);

  /** Set after successful {@link auth}; undefined means unauthenticated. */
  private client: GitHubApiClient | undefined;

  /** Repo coordinates parsed from the URL supplied to {@link auth}. */
  private owner = '';
  private repo = '';

  constructor(
    @Inject(GITHUB_API_CLIENT_FACTORY)
    private readonly clientFactory: GitHubApiClientFactory
  ) {}

  // ── RepoConnector implementation ─────────────────────────────────────────

  /**
   * Authenticates against the GitHub API using the provided PAT.
   *
   * SECURITY: the token is passed to the factory (which forwards it to Octokit)
   * but is NEVER stored on `this` and NEVER passed to {@link Logger}.
   *
   * @param creds - `creds.token` is the PAT; `creds.repoUrl` is the repo URL.
   * @throws {RepoConnectorError} `AUTH_FAILED` when the token is rejected.
   */
  async auth(creds: RepoCredentials & { repoUrl: string }): Promise<void> {
    // Parse the URL before touching the network.
    const { owner, repo } = parseGitHubUrl(creds.repoUrl);
    this.owner = owner;
    this.repo = repo;

    // Build a client with the token — the factory keeps ownership of the token.
    const candidate = this.clientFactory(creds.token);

    try {
      const user = await candidate.getAuthenticatedUser();
      // Log only the non-secret result: the login name.
      this.logger.log(`Authenticated as GitHub user: ${user.login}`);
    } catch (err) {
      // Translate to a stable error; do NOT include the token.
      throw new RepoConnectorError(
        'AUTH_FAILED',
        'GitHub authentication failed. Check that the token is valid and has repo access.',
        undefined,
        err
      );
    }

    this.client = candidate;
  }

  /**
   * Lists the recursive file tree of the repository.
   *
   * @param subPath Not used for GitHub (the full tree is always fetched via the
   *   recursive tree API). Pass `undefined` to list from the root.
   *
   * @returns Flat list of {@link TreeEntry} objects.
   * @throws {RepoConnectorError} `AUTH_FAILED` when not yet authenticated.
   * @throws {RepoConnectorError} `NOT_FOUND` when the repository does not exist.
   */
  async listTree(subPath?: string): Promise<TreeEntry[]> {
    const client = this.assertAuthenticated();

    try {
      const treeSha = await this.resolveDefaultBranchSha(client);
      const entries = await client.getTree(this.owner, this.repo, treeSha);

      const prefix = subPath ? `${subPath.replace(/\/+$/, '')}/` : '';

      return entries
        .filter((e) => (prefix ? e.path.startsWith(prefix) : true))
        .map((e) => ({
          path: e.path,
          type: e.type === 'tree' ? 'dir' : 'file',
          ...(e.size !== undefined ? { size: e.size } : {}),
        }));
    } catch (err) {
      if (err instanceof RepoConnectorError) {
        throw err;
      }
      throw this.wrapApiError('listTree', err);
    }
  }

  /**
   * Reads the UTF-8 content of a file from the default branch.
   *
   * @param path Repo-root-relative path, e.g. `src/app/app.module.ts`.
   * @returns File content as a string.
   * @throws {RepoConnectorError} `NOT_FOUND` when the file does not exist.
   * @throws {RepoConnectorError} `AUTH_FAILED` when not yet authenticated.
   */
  async readFile(path: string): Promise<string> {
    const client = this.assertAuthenticated();

    try {
      const { content, encoding } = await client.getContents(this.owner, this.repo, path);

      if (encoding === 'base64') {
        return decodeBase64(content);
      }
      // Fallback: return raw content if encoding is not base64.
      return content;
    } catch (err) {
      if (err instanceof RepoConnectorError) {
        throw err;
      }
      throw this.wrapApiError('readFile', err, path);
    }
  }

  /**
   * Shallow-fetches the entire repository via the GitHub tree API and returns
   * an in-memory map of `path → content` for all blob (file) entries.
   *
   * No disk I/O is performed; content is returned in {@link CloneResult.files}.
   *
   * @returns {@link CloneResult} with a populated `files` map.
   * @throws {RepoConnectorError} on any provider-level failure.
   */
  async clone(): Promise<CloneResult> {
    const client = this.assertAuthenticated();

    try {
      const treeSha = await this.resolveDefaultBranchSha(client);
      const entries = await client.getTree(this.owner, this.repo, treeSha);

      const files = new Map<string, string>();

      // Fetch only blobs (not trees/directories).
      const blobs = entries.filter((e) => e.type === 'blob');
      this.logger.log(`Fetching ${blobs.length} files from ${this.owner}/${this.repo}`);

      // Bounded-concurrency parallel fetch: process blobs in batches of CONCURRENCY
      // to maximize throughput without overwhelming the GitHub API rate limit.
      for (let i = 0; i < blobs.length; i += CONCURRENCY) {
        const batch = blobs.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map((entry) => client.getContents(this.owner, this.repo, entry.path))
        );
        for (let j = 0; j < batch.length; j++) {
          const { content, encoding } = results[j];
          const text = encoding === 'base64' ? decodeBase64(content) : content;
          files.set(batch[j].path, text);
        }
      }

      this.logger.log(`Clone complete: ${files.size} files fetched`);
      return { files };
    } catch (err) {
      if (err instanceof RepoConnectorError) {
        throw err;
      }
      throw this.wrapApiError('clone', err);
    }
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  /**
   * Asserts the connector has been authenticated and returns the client.
   * @throws {RepoConnectorError} `AUTH_FAILED` when not yet authenticated.
   */
  private assertAuthenticated(): GitHubApiClient {
    if (!this.client) {
      throw new RepoConnectorError(
        'AUTH_FAILED',
        'GitHubConnector: call auth() before using the connector.'
      );
    }
    return this.client;
  }

  /**
   * Resolves the SHA of the tip commit on the default branch.
   */
  private async resolveDefaultBranchSha(client: GitHubApiClient): Promise<string> {
    const { default_branch } = await client.getRepo(this.owner, this.repo);
    return client.getBranchSha(this.owner, this.repo, default_branch);
  }

  /**
   * Wraps a raw API error in a stable {@link RepoConnectorError}.
   *
   * The token is never included; only the operation name and optional path
   * appear in the message.
   */
  private wrapApiError(operation: string, err: unknown, path?: string): RepoConnectorError {
    const detail = path ? { operation, path } : { operation };

    // Octokit throws objects with a `status` property for HTTP errors.
    const status = (err as { status?: number }).status;
    if (status === 404) {
      const notFoundMsg = path
        ? `File not found: "${path}" in ${this.owner}/${this.repo}`
        : `Repository ${this.owner}/${this.repo} not found`;
      return new RepoConnectorError('NOT_FOUND', notFoundMsg, detail, err);
    }
    if (status === 401 || status === 403) {
      return new RepoConnectorError(
        'AUTH_FAILED',
        `GitHub API auth error during ${operation} (HTTP ${status}).`,
        detail,
        err
      );
    }
    if (status === 429) {
      return new RepoConnectorError(
        'RATE_LIMITED',
        `GitHub API rate limited during ${operation}.`,
        detail,
        err
      );
    }

    const message = err instanceof Error ? err.message : String(err);
    return new RepoConnectorError(
      'UNKNOWN',
      `GitHub API error during ${operation}: ${message}`,
      detail,
      err
    );
  }
}
