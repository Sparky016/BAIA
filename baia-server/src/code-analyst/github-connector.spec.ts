/**
 * Unit tests for {@link GitHubConnector}.
 *
 * ALL GitHub API calls are mocked via a fake {@link GitHubApiClient}.
 * No real HTTP requests are made; `@octokit/rest` is never imported.
 * The suite covers:
 *  - auth success
 *  - auth failure (token rejected by API)
 *  - auth-not-called guard (all methods throw AUTH_FAILED)
 *  - listTree (success + NOT_FOUND)
 *  - readFile (success + NOT_FOUND + RATE_LIMITED + UNKNOWN)
 *  - clone (success)
 *  - token is never logged (Logger spy)
 */

import { Logger } from '@nestjs/common';

import {
  GITHUB_API_CLIENT_FACTORY,
  GitHubApiClient,
  GitHubApiClientFactory,
  GitHubConnector,
} from './github-connector';
import { RepoConnectorError, RepoCredentials } from './repo-connector';

// ── Helpers ────────────────────────────────────────────────────────────────

const VALID_REPO_URL = 'https://github.com/acme/my-app';
const VALID_TOKEN = 'ghp_supersecret';

const VALID_CREDS: RepoCredentials & { repoUrl: string } = {
  token: VALID_TOKEN,
  repoUrl: VALID_REPO_URL,
};

/**
 * Creates a fully-mocked {@link GitHubApiClient} with all methods resolving
 * to sensible defaults.  Individual tests override specific methods.
 */
function makeMockClient(overrides: Partial<GitHubApiClient> = {}): jest.Mocked<GitHubApiClient> {
  return {
    getAuthenticatedUser: jest.fn().mockResolvedValue({ login: 'test-user' }),
    getRepo: jest.fn().mockResolvedValue({ default_branch: 'main' }),
    getBranchSha: jest.fn().mockResolvedValue('abc123sha'),
    getTree: jest.fn().mockResolvedValue([
      { path: 'src/index.ts', type: 'blob', size: 128 },
      { path: 'src/utils', type: 'tree' },
      { path: 'README.md', type: 'blob', size: 256 },
    ]),
    getContents: jest.fn().mockResolvedValue({
      content: Buffer.from('export {};\n').toString('base64'),
      encoding: 'base64',
    }),
    ...overrides,
  };
}

/**
 * Builds a {@link GitHubConnector} wired with an injected factory
 * that returns the supplied mock client.
 */
function makeConnector(client: GitHubApiClient): GitHubConnector {
  const factory: GitHubApiClientFactory = () => client;
  return new GitHubConnector(
    factory as Parameters<typeof GitHubConnector.prototype.constructor>[0]
  );
}

/** Spy on every Logger method to assert no secret is logged. */
function spyOnLogger(): {
  logSpy: jest.SpyInstance;
  warnSpy: jest.SpyInstance;
  errorSpy: jest.SpyInstance;
  debugSpy: jest.SpyInstance;
} {
  return {
    logSpy: jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined),
    warnSpy: jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined),
    errorSpy: jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined),
    debugSpy: jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined),
  };
}

/** Checks that none of the recorded log calls contain the secret token. */
function assertTokenNotLogged(spies: ReturnType<typeof spyOnLogger>, token: string): void {
  const allCalls = [
    ...spies.logSpy.mock.calls,
    ...spies.warnSpy.mock.calls,
    ...spies.errorSpy.mock.calls,
    ...spies.debugSpy.mock.calls,
  ].map((args) => JSON.stringify(args));

  for (const call of allCalls) {
    expect(call).not.toContain(token);
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GitHubConnector', () => {
  let loggerSpies: ReturnType<typeof spyOnLogger>;

  beforeEach(() => {
    loggerSpies = spyOnLogger();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── constructor / injection token ──────────────────────────────────────

  describe('GITHUB_API_CLIENT_FACTORY token', () => {
    it('is exported as a non-empty string', () => {
      expect(typeof GITHUB_API_CLIENT_FACTORY).toBe('string');
      expect(GITHUB_API_CLIENT_FACTORY.length).toBeGreaterThan(0);
    });
  });

  // ── auth() ─────────────────────────────────────────────────────────────

  describe('auth()', () => {
    it('resolves when the API accepts the token', async () => {
      const client = makeMockClient();
      const connector = makeConnector(client);

      await expect(connector.auth(VALID_CREDS)).resolves.toBeUndefined();
      expect(client.getAuthenticatedUser).toHaveBeenCalledTimes(1);
    });

    it('logs the authenticated login name (not the token)', async () => {
      const client = makeMockClient();
      const connector = makeConnector(client);

      await connector.auth(VALID_CREDS);

      assertTokenNotLogged(loggerSpies, VALID_TOKEN);
      // Login name should appear in a log call
      const loggedText = loggerSpies.logSpy.mock.calls.map((a) => String(a)).join('');
      expect(loggedText).toContain('test-user');
    });

    it('throws RepoConnectorError(AUTH_FAILED) when the API rejects the token', async () => {
      const client = makeMockClient({
        getAuthenticatedUser: jest
          .fn()
          .mockRejectedValue({ status: 401, message: 'Bad credentials' }),
      });
      const connector = makeConnector(client);

      await expect(connector.auth(VALID_CREDS)).rejects.toMatchObject({
        code: 'AUTH_FAILED',
        name: 'RepoConnectorError',
      });
    });

    it('does NOT log the token on auth failure', async () => {
      const client = makeMockClient({
        getAuthenticatedUser: jest.fn().mockRejectedValue(new Error('Unauthorized')),
      });
      const connector = makeConnector(client);

      await expect(connector.auth(VALID_CREDS)).rejects.toThrow();
      assertTokenNotLogged(loggerSpies, VALID_TOKEN);
    });

    it('throws AUTH_FAILED for an invalid repo URL', async () => {
      const client = makeMockClient();
      const connector = makeConnector(client);

      const badCreds = { token: VALID_TOKEN, repoUrl: 'not-a-url' };
      await expect(connector.auth(badCreds)).rejects.toMatchObject({
        code: 'UNKNOWN',
        name: 'RepoConnectorError',
      });
    });

    it('accepts SSH-style repo URL', async () => {
      const client = makeMockClient();
      const connector = makeConnector(client);

      const sshCreds = {
        token: VALID_TOKEN,
        repoUrl: 'git@github.com:acme/my-app.git',
      };
      await expect(connector.auth(sshCreds)).resolves.toBeUndefined();
    });
  });

  // ── unauthenticated guard ───────────────────────────────────────────────

  describe('before auth()', () => {
    it('listTree() throws AUTH_FAILED', async () => {
      const connector = makeConnector(makeMockClient());
      await expect(connector.listTree()).rejects.toMatchObject({ code: 'AUTH_FAILED' });
    });

    it('readFile() throws AUTH_FAILED', async () => {
      const connector = makeConnector(makeMockClient());
      await expect(connector.readFile('src/index.ts')).rejects.toMatchObject({
        code: 'AUTH_FAILED',
      });
    });

    it('clone() throws AUTH_FAILED', async () => {
      const connector = makeConnector(makeMockClient());
      await expect(connector.clone()).rejects.toMatchObject({ code: 'AUTH_FAILED' });
    });
  });

  // ── listTree() ─────────────────────────────────────────────────────────

  describe('listTree()', () => {
    it('returns all entries mapped to TreeEntry shape', async () => {
      const client = makeMockClient();
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);

      const tree = await connector.listTree();

      expect(tree).toHaveLength(3);
      expect(tree).toContainEqual({ path: 'src/index.ts', type: 'file', size: 128 });
      expect(tree).toContainEqual({ path: 'src/utils', type: 'dir' });
      expect(tree).toContainEqual({ path: 'README.md', type: 'file', size: 256 });
    });

    it('filters entries by subPath prefix', async () => {
      const client = makeMockClient();
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);

      const tree = await connector.listTree('src');

      expect(tree).toHaveLength(2);
      expect(tree.map((e) => e.path)).toContain('src/index.ts');
      expect(tree.map((e) => e.path)).toContain('src/utils');
      expect(tree.map((e) => e.path)).not.toContain('README.md');
    });

    it('throws NOT_FOUND (HTTP 404) when the repo does not exist', async () => {
      const notFoundError = Object.assign(new Error('Not Found'), { status: 404 });
      const client = makeMockClient({
        getRepo: jest.fn().mockRejectedValue(notFoundError),
      });
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);

      await expect(connector.listTree()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('throws RATE_LIMITED (HTTP 429)', async () => {
      const rateLimitError = Object.assign(new Error('Rate limited'), { status: 429 });
      const client = makeMockClient({
        getTree: jest.fn().mockRejectedValue(rateLimitError),
      });
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);

      await expect(connector.listTree()).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    });

    it('throws UNKNOWN for unexpected errors', async () => {
      const client = makeMockClient({
        getTree: jest.fn().mockRejectedValue(new Error('Something went wrong')),
      });
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);

      await expect(connector.listTree()).rejects.toMatchObject({ code: 'UNKNOWN' });
    });

    it('does not log the token during listing', async () => {
      const client = makeMockClient();
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);
      await connector.listTree();

      assertTokenNotLogged(loggerSpies, VALID_TOKEN);
    });
  });

  // ── readFile() ─────────────────────────────────────────────────────────

  describe('readFile()', () => {
    it('returns decoded file content for a base64-encoded response', async () => {
      const fileContent = 'export const x = 1;\n';
      const client = makeMockClient({
        getContents: jest.fn().mockResolvedValue({
          content: Buffer.from(fileContent).toString('base64'),
          encoding: 'base64',
        }),
      });
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);

      const result = await connector.readFile('src/index.ts');
      expect(result).toBe(fileContent);
    });

    it('returns raw content when encoding is not base64', async () => {
      const rawContent = 'hello world';
      const client = makeMockClient({
        getContents: jest.fn().mockResolvedValue({
          content: rawContent,
          encoding: 'utf-8',
        }),
      });
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);

      const result = await connector.readFile('README.md');
      expect(result).toBe(rawContent);
    });

    it('throws NOT_FOUND (HTTP 404) when the file does not exist', async () => {
      const notFoundError = Object.assign(new Error('Not Found'), { status: 404 });
      const client = makeMockClient({
        getContents: jest.fn().mockRejectedValue(notFoundError),
      });
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);

      await expect(connector.readFile('missing/file.ts')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('throws AUTH_FAILED (HTTP 401) when token expires mid-session', async () => {
      const authError = Object.assign(new Error('Unauthorized'), { status: 401 });
      const client = makeMockClient({
        getContents: jest.fn().mockRejectedValue(authError),
      });
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);

      await expect(connector.readFile('src/app.ts')).rejects.toMatchObject({
        code: 'AUTH_FAILED',
      });
    });

    it('throws RATE_LIMITED (HTTP 429)', async () => {
      const rateLimitError = Object.assign(new Error('Rate limited'), { status: 429 });
      const client = makeMockClient({
        getContents: jest.fn().mockRejectedValue(rateLimitError),
      });
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);

      await expect(connector.readFile('src/app.ts')).rejects.toMatchObject({
        code: 'RATE_LIMITED',
      });
    });

    it('throws UNKNOWN for unexpected errors', async () => {
      const client = makeMockClient({
        getContents: jest.fn().mockRejectedValue(new Error('Disk full')),
      });
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);

      await expect(connector.readFile('src/app.ts')).rejects.toMatchObject({
        code: 'UNKNOWN',
      });
    });

    it('does not log the token during file read', async () => {
      const client = makeMockClient();
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);
      await connector.readFile('src/index.ts');

      assertTokenNotLogged(loggerSpies, VALID_TOKEN);
    });
  });

  // ── clone() ────────────────────────────────────────────────────────────

  describe('clone()', () => {
    it('returns a CloneResult with a files map containing all blobs', async () => {
      const client = makeMockClient({
        getContents: jest.fn().mockImplementation((_owner: string, _repo: string, path: string) => {
          const content = `// content of ${path}\n`;
          return Promise.resolve({
            content: Buffer.from(content).toString('base64'),
            encoding: 'base64',
          });
        }),
      });
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);

      const result = await connector.clone();

      expect(result.files).toBeDefined();
      // Blobs only: 'src/index.ts' and 'README.md' — NOT 'src/utils' (tree)
      expect(result.files!.size).toBe(2);
      expect(result.files!.has('src/index.ts')).toBe(true);
      expect(result.files!.has('README.md')).toBe(true);
      expect(result.files!.has('src/utils')).toBe(false);
    });

    it('includes correct decoded file content', async () => {
      const expectedContent = 'export const hello = "world";\n';
      const client = makeMockClient({
        getTree: jest.fn().mockResolvedValue([{ path: 'src/hello.ts', type: 'blob', size: 30 }]),
        getContents: jest.fn().mockResolvedValue({
          content: Buffer.from(expectedContent).toString('base64'),
          encoding: 'base64',
        }),
      });
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);

      const result = await connector.clone();
      expect(result.files!.get('src/hello.ts')).toBe(expectedContent);
    });

    it('throws UNKNOWN when getTree fails unexpectedly', async () => {
      const client = makeMockClient({
        getTree: jest.fn().mockRejectedValue(new Error('Network timeout')),
      });
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);

      await expect(connector.clone()).rejects.toMatchObject({ code: 'UNKNOWN' });
    });

    it('does not log the token during clone', async () => {
      const client = makeMockClient();
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);
      await connector.clone();

      assertTokenNotLogged(loggerSpies, VALID_TOKEN);
    });
  });

  // ── RepoConnectorError ─────────────────────────────────────────────────

  describe('RepoConnectorError', () => {
    it('has the correct name', () => {
      const err = new RepoConnectorError('NOT_FOUND', 'not found');
      expect(err.name).toBe('RepoConnectorError');
      expect(err.code).toBe('NOT_FOUND');
      expect(err instanceof Error).toBe(true);
    });

    it('carries detail and cause', () => {
      const cause = new Error('original');
      const err = new RepoConnectorError('UNKNOWN', 'wrapper', { extra: 1 }, cause);
      expect(err.detail).toEqual({ extra: 1 });
      expect(err.cause).toBe(cause);
    });
  });
});
