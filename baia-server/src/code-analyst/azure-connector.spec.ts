import { Logger } from '@nestjs/common';

import {
  AZURE_API_CLIENT_FACTORY,
  AzureApiClient,
  AzureApiClientFactory,
  AzureConnector,
} from './azure-connector';
import { RepoConnectorError, RepoCredentials } from './repo-connector';

// ── Helpers ────────────────────────────────────────────────────────────────

const VALID_ORG_URL = 'https://dev.azure.com/myorg';
const VALID_REPO_URL = 'https://dev.azure.com/myorg/myproject/_git/myrepo';
const VALID_TOKEN = 'azure_pat_supersecret';

const VALID_CREDS: RepoCredentials & { repoUrl: string } = {
  token: VALID_TOKEN,
  repoUrl: VALID_REPO_URL,
};

function makeMockClient(overrides: Partial<AzureApiClient> = {}): jest.Mocked<AzureApiClient> {
  return {
    getProfile: jest.fn().mockResolvedValue({ id: 'user-id-123', displayName: 'Test User' }),
    getItems: jest.fn().mockResolvedValue([
      { path: '/Controllers/HomeController.cs', gitObjectType: 'blob' },
      { path: '/Models', gitObjectType: 'tree' },
      { path: '/Models/ContentPage.cs', gitObjectType: 'blob' },
    ]),
    getItemContent: jest
      .fn()
      .mockImplementation((_project: string, _repoId: string, path: string) =>
        Promise.resolve(`// content of ${path}\n`)
      ),
    getRepository: jest.fn().mockResolvedValue({
      id: 'repo-id-abc',
      name: 'myrepo',
      defaultBranch: 'refs/heads/main',
    }),
    ...overrides,
  };
}

function makeConnector(client: AzureApiClient): AzureConnector {
  const factory: AzureApiClientFactory = () => client;
  return new AzureConnector(factory);
}

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

function assertTokenNotLogged(
  spies: ReturnType<typeof spyOnLogger>,
  token: string
): void {
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

describe('AzureConnector', () => {
  let loggerSpies: ReturnType<typeof spyOnLogger>;

  beforeEach(() => {
    loggerSpies = spyOnLogger();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── injection token ─────────────────────────────────────────────────────

  describe('AZURE_API_CLIENT_FACTORY token', () => {
    it('is exported as a non-empty string', () => {
      expect(typeof AZURE_API_CLIENT_FACTORY).toBe('string');
      expect(AZURE_API_CLIENT_FACTORY.length).toBeGreaterThan(0);
    });
  });

  // ── auth() ─────────────────────────────────────────────────────────────

  describe('auth()', () => {
    it('resolves when the API accepts the token and stores coords', async () => {
      const client = makeMockClient();
      const connector = makeConnector(client);

      await expect(connector.auth(VALID_CREDS)).resolves.toBeUndefined();
      expect(client.getProfile).toHaveBeenCalledTimes(1);
    });

    it('logs the authenticated display name (not the token)', async () => {
      const client = makeMockClient();
      const connector = makeConnector(client);

      await connector.auth(VALID_CREDS);

      assertTokenNotLogged(loggerSpies, VALID_TOKEN);
      const loggedText = loggerSpies.logSpy.mock.calls.map((a) => String(a)).join('');
      expect(loggedText).toContain('Test User');
    });

    it('throws RepoConnectorError(AUTH_FAILED) when the API returns HTTP 401', async () => {
      const client = makeMockClient({
        getProfile: jest
          .fn()
          .mockRejectedValue({ status: 401, message: 'Unauthorized' }),
      });
      const connector = makeConnector(client);

      await expect(connector.auth(VALID_CREDS)).rejects.toMatchObject({
        code: 'AUTH_FAILED',
        name: 'RepoConnectorError',
      });
    });

    it('does NOT log the token on auth failure', async () => {
      const client = makeMockClient({
        getProfile: jest.fn().mockRejectedValue(new Error('Unauthorized')),
      });
      const connector = makeConnector(client);

      await expect(connector.auth(VALID_CREDS)).rejects.toThrow();
      assertTokenNotLogged(loggerSpies, VALID_TOKEN);
    });

    it('throws UNKNOWN for an invalid repo URL', async () => {
      const client = makeMockClient();
      const connector = makeConnector(client);

      const badCreds = { token: VALID_TOKEN, repoUrl: 'not-a-url' };
      await expect(connector.auth(badCreds)).rejects.toMatchObject({
        code: 'UNKNOWN',
        name: 'RepoConnectorError',
      });
    });

    it('accepts dev.azure.com URL format', async () => {
      const client = makeMockClient();
      const connector = makeConnector(client);

      await expect(connector.auth(VALID_CREDS)).resolves.toBeUndefined();
    });

    it('accepts visualstudio.com URL format', async () => {
      const client = makeMockClient();
      // Factory will be called with the correct orgUrl derived from VS URL
      let capturedOrgUrl = '';
      const factory: AzureApiClientFactory = (_token, orgUrl) => {
        capturedOrgUrl = orgUrl;
        return client;
      };
      const connector = new AzureConnector(factory);

      await connector.auth({
        token: VALID_TOKEN,
        repoUrl: 'https://myorg.visualstudio.com/myproject/_git/myrepo',
      });

      expect(capturedOrgUrl).toBe('https://myorg.visualstudio.com');
    });

    it('passes parsed orgUrl to the factory for dev.azure.com URLs', async () => {
      const client = makeMockClient();
      let capturedOrgUrl = '';
      const factory: AzureApiClientFactory = (_token, orgUrl) => {
        capturedOrgUrl = orgUrl;
        return client;
      };
      const connector = new AzureConnector(factory);

      await connector.auth(VALID_CREDS);

      expect(capturedOrgUrl).toBe(VALID_ORG_URL);
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
      await expect(
        connector.readFile('Controllers/HomeController.cs')
      ).rejects.toMatchObject({ code: 'AUTH_FAILED' });
    });

    it('clone() throws AUTH_FAILED', async () => {
      const connector = makeConnector(makeMockClient());
      await expect(connector.clone()).rejects.toMatchObject({ code: 'AUTH_FAILED' });
    });
  });

  // ── listTree() ─────────────────────────────────────────────────────────

  describe('listTree()', () => {
    it('returns mapped TreeEntry array with leading slash stripped', async () => {
      const client = makeMockClient();
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);

      const tree = await connector.listTree();

      expect(tree).toHaveLength(3);
      expect(tree).toContainEqual({ path: 'Controllers/HomeController.cs', type: 'file' });
      expect(tree).toContainEqual({ path: 'Models', type: 'dir' });
      expect(tree).toContainEqual({ path: 'Models/ContentPage.cs', type: 'file' });
    });

    it('passes subPath to getItems', async () => {
      const client = makeMockClient({
        getItems: jest.fn().mockResolvedValue([
          { path: '/Controllers/HomeController.cs', gitObjectType: 'blob' },
        ]),
      });
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);

      const tree = await connector.listTree('Controllers');

      expect(client.getItems).toHaveBeenCalledWith('myproject', 'myrepo', 'Controllers');
      expect(tree).toHaveLength(1);
      expect(tree[0].path).toBe('Controllers/HomeController.cs');
    });

    it('throws NOT_FOUND for HTTP 404', async () => {
      const notFoundError = Object.assign(new Error('Not Found'), { status: 404 });
      const client = makeMockClient({
        getItems: jest.fn().mockRejectedValue(notFoundError),
      });
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);

      await expect(connector.listTree()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('throws AUTH_FAILED for HTTP 401', async () => {
      const authError = Object.assign(new Error('Unauthorized'), { status: 401 });
      const client = makeMockClient({
        getItems: jest.fn().mockRejectedValue(authError),
      });
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);

      await expect(connector.listTree()).rejects.toMatchObject({ code: 'AUTH_FAILED' });
    });

    it('throws RATE_LIMITED for HTTP 429', async () => {
      const rateLimitError = Object.assign(new Error('Rate limited'), { status: 429 });
      const client = makeMockClient({
        getItems: jest.fn().mockRejectedValue(rateLimitError),
      });
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);

      await expect(connector.listTree()).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    });

    it('throws UNKNOWN for unexpected errors', async () => {
      const client = makeMockClient({
        getItems: jest.fn().mockRejectedValue(new Error('Something went wrong')),
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
    it('returns file content', async () => {
      const client = makeMockClient({
        getItemContent: jest
          .fn()
          .mockResolvedValue('namespace MyCMS.Controllers { }'),
      });
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);

      const result = await connector.readFile('Controllers/HomeController.cs');
      expect(result).toBe('namespace MyCMS.Controllers { }');
    });

    it('throws NOT_FOUND (HTTP 404) when the file does not exist', async () => {
      const notFoundError = Object.assign(new Error('Not Found'), { status: 404 });
      const client = makeMockClient({
        getItemContent: jest.fn().mockRejectedValue(notFoundError),
      });
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);

      await expect(
        connector.readFile('missing/file.cs')
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('throws AUTH_FAILED (HTTP 403) when token loses permission', async () => {
      const authError = Object.assign(new Error('Forbidden'), { status: 403 });
      const client = makeMockClient({
        getItemContent: jest.fn().mockRejectedValue(authError),
      });
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);

      await expect(
        connector.readFile('Controllers/HomeController.cs')
      ).rejects.toMatchObject({ code: 'AUTH_FAILED' });
    });

    it('throws RATE_LIMITED for HTTP 429', async () => {
      const rateLimitError = Object.assign(new Error('Rate limited'), { status: 429 });
      const client = makeMockClient({
        getItemContent: jest.fn().mockRejectedValue(rateLimitError),
      });
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);

      await expect(
        connector.readFile('Controllers/HomeController.cs')
      ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    });

    it('throws UNKNOWN for unexpected errors', async () => {
      const client = makeMockClient({
        getItemContent: jest.fn().mockRejectedValue(new Error('Disk full')),
      });
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);

      await expect(
        connector.readFile('Controllers/HomeController.cs')
      ).rejects.toMatchObject({ code: 'UNKNOWN' });
    });

    it('does not log the token during file read', async () => {
      const client = makeMockClient();
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);
      await connector.readFile('Controllers/HomeController.cs');

      assertTokenNotLogged(loggerSpies, VALID_TOKEN);
    });
  });

  // ── clone() ────────────────────────────────────────────────────────────

  describe('clone()', () => {
    it('returns a CloneResult with a files map containing all blobs', async () => {
      const client = makeMockClient();
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);

      const result = await connector.clone();

      expect(result.files).toBeDefined();
      // blobs only: HomeController.cs and ContentPage.cs — NOT Models (tree)
      expect(result.files!.size).toBe(2);
      expect(result.files!.has('Controllers/HomeController.cs')).toBe(true);
      expect(result.files!.has('Models/ContentPage.cs')).toBe(true);
      expect(result.files!.has('Models')).toBe(false);
    });

    it('fetches correct content for each blob', async () => {
      const client = makeMockClient({
        getItems: jest.fn().mockResolvedValue([
          { path: '/Controllers/HomeController.cs', gitObjectType: 'blob' },
        ]),
        getItemContent: jest.fn().mockResolvedValue('public class HomeController {}'),
      });
      const connector = makeConnector(client);
      await connector.auth(VALID_CREDS);

      const result = await connector.clone();
      expect(result.files!.get('Controllers/HomeController.cs')).toBe(
        'public class HomeController {}'
      );
    });

    it('throws UNKNOWN when getItems fails unexpectedly', async () => {
      const client = makeMockClient({
        getItems: jest.fn().mockRejectedValue(new Error('Network timeout')),
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
});
