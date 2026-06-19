import { Logger } from '@nestjs/common';
import { GherkinDoc } from '@baia/shared';

import { CredentialStoreService } from '../security/credential-store.service';
import { ConfluenceAdapter, ConfluenceAdapterError, ConfluenceConfig } from './confluence.adapter';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ENCRYPTION_KEY = 'adapter-spec-test-key-deterministic-0123';
const CREDS_REF = 'confluence:test-space';
const CREDS_VALUE = 'test@example.com:atlassian-api-token-abc123';

const BASE_URL = 'https://mycompany.atlassian.net';
const SPACE_KEY = 'ENG';

const SAMPLE_DOC: GherkinDoc = {
  features: [
    {
      name: 'User Login',
      scenarios: [
        {
          name: 'Successful login',
          steps: [
            { keyword: 'Given', text: 'the login page is open', provenance: 'ui' },
            { keyword: 'When', text: 'valid credentials are entered', provenance: 'ui' },
            { keyword: 'Then', text: 'the dashboard is displayed', provenance: 'ui' },
          ],
        },
      ],
    },
  ],
  generatedAt: new Date('2025-01-15T10:00:00.000Z'),
};

const BASE_CONFIG: ConfluenceConfig = {
  baseUrl: BASE_URL,
  spaceKey: SPACE_KEY,
  credentialsRef: CREDS_REF,
};

const PAGE_FOUND_RESPONSE = {
  results: [
    {
      id: 'page-42',
      title: 'BAIA: User Login',
      version: { number: 3 },
      _links: { base: BASE_URL, webui: '/wiki/spaces/ENG/pages/42' },
    },
  ],
};

const PAGE_NOT_FOUND_RESPONSE = { results: [] };

const CREATED_PAGE_RESPONSE = {
  id: 'page-99',
  title: 'BAIA: User Login',
  version: { number: 1 },
  _links: { base: BASE_URL, webui: '/wiki/spaces/ENG/pages/99' },
};

const UPDATED_PAGE_RESPONSE = {
  id: 'page-42',
  title: 'BAIA: User Login',
  version: { number: 4 },
  _links: { base: BASE_URL, webui: '/wiki/spaces/ENG/pages/42' },
};

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeAdapter(): { adapter: ConfluenceAdapter; mockFetch: jest.Mock } {
  const credStore = new CredentialStoreService(ENCRYPTION_KEY);
  credStore.store(CREDS_REF, CREDS_VALUE);

  const adapter = new ConfluenceAdapter(credStore);
  const mockFetch = jest.fn<Promise<Response>, [string, RequestInit?]>();
  (adapter as unknown as { fetch: jest.Mock }).fetch = mockFetch;

  return { adapter, mockFetch };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ConfluenceAdapter', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── invalid config ──────────────────────────────────────────────────────────

  describe('invalid config', () => {
    it('throws INVALID_CONFIG when baseUrl is missing', async () => {
      const { adapter } = makeAdapter();
      await expect(
        adapter.publishPage({ ...BASE_CONFIG, baseUrl: '' }, SAMPLE_DOC)
      ).rejects.toThrow(ConfluenceAdapterError);

      await expect(
        adapter.publishPage({ ...BASE_CONFIG, baseUrl: '' }, SAMPLE_DOC)
      ).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
    });

    it('throws INVALID_CONFIG when spaceKey is missing', async () => {
      const { adapter } = makeAdapter();
      await expect(
        adapter.publishPage({ ...BASE_CONFIG, spaceKey: '' }, SAMPLE_DOC)
      ).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
    });

    it('throws INVALID_CONFIG when credentialsRef is missing', async () => {
      const { adapter } = makeAdapter();
      await expect(
        adapter.publishPage({ ...BASE_CONFIG, credentialsRef: '' }, SAMPLE_DOC)
      ).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
    });
  });

  // ── create path ─────────────────────────────────────────────────────────────

  describe('create page (page does not exist)', () => {
    it('returns action=created with correct pageId and pageUrl', async () => {
      const { adapter, mockFetch } = makeAdapter();
      mockFetch
        .mockResolvedValueOnce(makeResponse(PAGE_NOT_FOUND_RESPONSE)) // search
        .mockResolvedValueOnce(makeResponse(CREATED_PAGE_RESPONSE, 200)); // create

      const result = await adapter.publishPage(BASE_CONFIG, SAMPLE_DOC);

      expect(result.action).toBe('created');
      expect(result.pageId).toBe('page-99');
      expect(result.pageUrl).toBe(`${BASE_URL}/wiki/spaces/ENG/pages/99`);
      expect(result.title).toBe('BAIA: User Login');
    });

    it('sends POST to /wiki/rest/api/content', async () => {
      const { adapter, mockFetch } = makeAdapter();
      mockFetch
        .mockResolvedValueOnce(makeResponse(PAGE_NOT_FOUND_RESPONSE))
        .mockResolvedValueOnce(makeResponse(CREATED_PAGE_RESPONSE));

      await adapter.publishPage(BASE_CONFIG, SAMPLE_DOC);

      const [createUrl, createInit] = mockFetch.mock.calls[1];
      expect(createUrl).toBe(`${BASE_URL}/wiki/rest/api/content`);
      expect((createInit as RequestInit).method).toBe('POST');
    });

    it('includes space key and title in create payload', async () => {
      const { adapter, mockFetch } = makeAdapter();
      mockFetch
        .mockResolvedValueOnce(makeResponse(PAGE_NOT_FOUND_RESPONSE))
        .mockResolvedValueOnce(makeResponse(CREATED_PAGE_RESPONSE));

      await adapter.publishPage(BASE_CONFIG, SAMPLE_DOC);

      const [, createInit] = mockFetch.mock.calls[1];
      const payload = JSON.parse((createInit as RequestInit).body as string);
      expect(payload.space.key).toBe(SPACE_KEY);
      expect(payload.title).toBe('BAIA: User Login');
      expect(payload.body.storage.representation).toBe('storage');
    });

    it('includes ancestors when parentPageId is provided', async () => {
      const { adapter, mockFetch } = makeAdapter();
      mockFetch
        .mockResolvedValueOnce(makeResponse(PAGE_NOT_FOUND_RESPONSE))
        .mockResolvedValueOnce(makeResponse(CREATED_PAGE_RESPONSE));

      await adapter.publishPage({ ...BASE_CONFIG, parentPageId: 'parent-7' }, SAMPLE_DOC);

      const [, createInit] = mockFetch.mock.calls[1];
      const payload = JSON.parse((createInit as RequestInit).body as string);
      expect(payload.ancestors).toEqual([{ id: 'parent-7' }]);
    });

    it('omits ancestors when parentPageId is not provided', async () => {
      const { adapter, mockFetch } = makeAdapter();
      mockFetch
        .mockResolvedValueOnce(makeResponse(PAGE_NOT_FOUND_RESPONSE))
        .mockResolvedValueOnce(makeResponse(CREATED_PAGE_RESPONSE));

      await adapter.publishPage(BASE_CONFIG, SAMPLE_DOC);

      const [, createInit] = mockFetch.mock.calls[1];
      const payload = JSON.parse((createInit as RequestInit).body as string);
      expect(payload.ancestors).toBeUndefined();
    });
  });

  // ── update path ─────────────────────────────────────────────────────────────

  describe('update page (page already exists)', () => {
    it('returns action=updated with correct pageId and pageUrl', async () => {
      const { adapter, mockFetch } = makeAdapter();
      mockFetch
        .mockResolvedValueOnce(makeResponse(PAGE_FOUND_RESPONSE)) // search
        .mockResolvedValueOnce(makeResponse(UPDATED_PAGE_RESPONSE)); // update

      const result = await adapter.publishPage(BASE_CONFIG, SAMPLE_DOC);

      expect(result.action).toBe('updated');
      expect(result.pageId).toBe('page-42');
      expect(result.pageUrl).toBe(`${BASE_URL}/wiki/spaces/ENG/pages/42`);
    });

    it('sends PUT to /wiki/rest/api/content/{pageId}', async () => {
      const { adapter, mockFetch } = makeAdapter();
      mockFetch
        .mockResolvedValueOnce(makeResponse(PAGE_FOUND_RESPONSE))
        .mockResolvedValueOnce(makeResponse(UPDATED_PAGE_RESPONSE));

      await adapter.publishPage(BASE_CONFIG, SAMPLE_DOC);

      const [updateUrl, updateInit] = mockFetch.mock.calls[1];
      expect(updateUrl).toBe(`${BASE_URL}/wiki/rest/api/content/page-42`);
      expect((updateInit as RequestInit).method).toBe('PUT');
    });

    it('increments version number in update payload', async () => {
      const { adapter, mockFetch } = makeAdapter();
      mockFetch
        .mockResolvedValueOnce(makeResponse(PAGE_FOUND_RESPONSE)) // current version = 3
        .mockResolvedValueOnce(makeResponse(UPDATED_PAGE_RESPONSE));

      await adapter.publishPage(BASE_CONFIG, SAMPLE_DOC);

      const [, updateInit] = mockFetch.mock.calls[1];
      const payload = JSON.parse((updateInit as RequestInit).body as string);
      expect(payload.version.number).toBe(4); // 3 + 1
    });
  });

  // ── auth header ─────────────────────────────────────────────────────────────

  describe('authorization header', () => {
    it('sends Basic auth derived from stored credentials', async () => {
      const { adapter, mockFetch } = makeAdapter();
      mockFetch
        .mockResolvedValueOnce(makeResponse(PAGE_NOT_FOUND_RESPONSE))
        .mockResolvedValueOnce(makeResponse(CREATED_PAGE_RESPONSE));

      await adapter.publishPage(BASE_CONFIG, SAMPLE_DOC);

      const expectedEncoded = Buffer.from(CREDS_VALUE, 'utf8').toString('base64');
      const [, searchInit] = mockFetch.mock.calls[0];
      const authHeader = (searchInit as RequestInit).headers as Record<string, string>;
      expect(authHeader['Authorization']).toBe(`Basic ${expectedEncoded}`);
    });
  });

  // ── auth failures ────────────────────────────────────────────────────────────

  describe('auth failures during search', () => {
    it.each([401, 403])(
      'throws AUTH_FAILED with statusCode=%i when search returns %i',
      async (status) => {
        const { adapter, mockFetch } = makeAdapter();
        mockFetch.mockResolvedValueOnce(makeResponse({}, status));

        await expect(adapter.publishPage(BASE_CONFIG, SAMPLE_DOC)).rejects.toMatchObject({
          code: 'AUTH_FAILED',
          statusCode: status,
        });
      }
    );
  });

  describe('auth failures during create', () => {
    it.each([401, 403])(
      'throws AUTH_FAILED with statusCode=%i when create returns %i',
      async (status) => {
        const { adapter, mockFetch } = makeAdapter();
        mockFetch
          .mockResolvedValueOnce(makeResponse(PAGE_NOT_FOUND_RESPONSE))
          .mockResolvedValueOnce(makeResponse({}, status));

        await expect(adapter.publishPage(BASE_CONFIG, SAMPLE_DOC)).rejects.toMatchObject({
          code: 'AUTH_FAILED',
          statusCode: status,
        });
      }
    );
  });

  describe('auth failures during update', () => {
    it.each([401, 403])(
      'throws AUTH_FAILED with statusCode=%i when update returns %i',
      async (status) => {
        const { adapter, mockFetch } = makeAdapter();
        mockFetch
          .mockResolvedValueOnce(makeResponse(PAGE_FOUND_RESPONSE))
          .mockResolvedValueOnce(makeResponse({}, status));

        await expect(adapter.publishPage(BASE_CONFIG, SAMPLE_DOC)).rejects.toMatchObject({
          code: 'AUTH_FAILED',
          statusCode: status,
        });
      }
    );
  });

  // ── API errors ───────────────────────────────────────────────────────────────

  describe('API errors', () => {
    it('throws API_ERROR on 500 during search', async () => {
      const { adapter, mockFetch } = makeAdapter();
      mockFetch.mockResolvedValueOnce(makeResponse({}, 500));

      await expect(adapter.publishPage(BASE_CONFIG, SAMPLE_DOC)).rejects.toMatchObject({
        code: 'API_ERROR',
        statusCode: 500,
      });
    });

    it('throws API_ERROR on 500 during create', async () => {
      const { adapter, mockFetch } = makeAdapter();
      mockFetch
        .mockResolvedValueOnce(makeResponse(PAGE_NOT_FOUND_RESPONSE))
        .mockResolvedValueOnce(makeResponse({}, 500));

      await expect(adapter.publishPage(BASE_CONFIG, SAMPLE_DOC)).rejects.toMatchObject({
        code: 'API_ERROR',
        statusCode: 500,
      });
    });

    it('throws API_ERROR on 500 during update', async () => {
      const { adapter, mockFetch } = makeAdapter();
      mockFetch
        .mockResolvedValueOnce(makeResponse(PAGE_FOUND_RESPONSE))
        .mockResolvedValueOnce(makeResponse({}, 500));

      await expect(adapter.publishPage(BASE_CONFIG, SAMPLE_DOC)).rejects.toMatchObject({
        code: 'API_ERROR',
        statusCode: 500,
      });
    });
  });

  // ── markup content ───────────────────────────────────────────────────────────

  describe('storage markup sent to Confluence', () => {
    it('includes Gherkin storage markup in the create body', async () => {
      const { adapter, mockFetch } = makeAdapter();
      mockFetch
        .mockResolvedValueOnce(makeResponse(PAGE_NOT_FOUND_RESPONSE))
        .mockResolvedValueOnce(makeResponse(CREATED_PAGE_RESPONSE));

      await adapter.publishPage(BASE_CONFIG, SAMPLE_DOC);

      const [, createInit] = mockFetch.mock.calls[1];
      const payload = JSON.parse((createInit as RequestInit).body as string);
      const storageValue: string = payload.body.storage.value;

      // Feature heading
      expect(storageValue).toContain('<h2>User Login</h2>');
      // Scenario heading
      expect(storageValue).toContain('<h3>Successful login</h3>');
      // Gherkin code block
      expect(storageValue).toContain('ac:name="code"');
      expect(storageValue).toContain('Given the login page is open');
    });
  });

  // ── ConfluenceAdapterError shape ─────────────────────────────────────────────

  describe('ConfluenceAdapterError', () => {
    it('has the correct name and inherits from Error', () => {
      const err = new ConfluenceAdapterError('test', 'API_ERROR', 500);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ConfluenceAdapterError);
      expect(err.name).toBe('ConfluenceAdapterError');
      expect(err.code).toBe('API_ERROR');
      expect(err.statusCode).toBe(500);
    });
  });
});
