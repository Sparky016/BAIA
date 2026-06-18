import { Injectable, Logger } from '@nestjs/common';
import { GherkinDoc } from '@baia/shared';

import { CredentialStoreService } from '../security/credential-store.service';
import { gherkinDocTitle, gherkinDocToConfluenceStorage } from './gherkin-to-confluence';

export interface ConfluenceConfig {
  /** Base URL of the Confluence instance, e.g. https://mycompany.atlassian.net */
  baseUrl: string;
  /** Confluence space key, e.g. "ENG" */
  spaceKey: string;
  /**
   * Reference key in CredentialStoreService.
   * The stored value must be "email:apiToken" (Confluence Cloud Basic auth).
   */
  credentialsRef: string;
  /** Optional parent page ID to nest the created page under. */
  parentPageId?: string;
}

export interface ConfluencePageResult {
  pageId: string;
  pageUrl: string;
  title: string;
  action: 'created' | 'updated';
}

interface ConfluenceContentResponse {
  id: string;
  title: string;
  version: { number: number };
  _links: { base: string; webui: string };
}

interface ConfluenceSearchResult {
  results: ConfluenceContentResponse[];
}

export class ConfluenceAdapterError extends Error {
  constructor(
    message: string,
    readonly code: 'AUTH_FAILED' | 'NOT_FOUND' | 'API_ERROR' | 'INVALID_CONFIG',
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'ConfluenceAdapterError';
    Object.setPrototypeOf(this, ConfluenceAdapterError.prototype);
  }
}

@Injectable()
export class ConfluenceAdapter {
  private readonly logger = new Logger(ConfluenceAdapter.name);

  /**
   * Overridable in tests without requiring global fetch to be mocked.
   * Tests can cast to `any` and assign a jest.fn() before calling publishPage.
   */
  protected fetch: (url: string, init?: RequestInit) => Promise<Response> =
    (url, init) => globalThis.fetch(url, init);

  constructor(private readonly credentialStore: CredentialStoreService) {}

  /**
   * Create or update a Confluence page for the given GherkinDoc.
   *
   * Looks up an existing page by title + spaceKey. Creates if absent, updates
   * (incrementing version) if present. Credentials are retrieved from the
   * CredentialStoreService using `config.credentialsRef` and must be stored as
   * "email:apiToken" for Basic auth.
   */
  async publishPage(config: ConfluenceConfig, doc: GherkinDoc): Promise<ConfluencePageResult> {
    const { baseUrl, spaceKey, credentialsRef, parentPageId } = config;

    if (!baseUrl || !spaceKey || !credentialsRef) {
      throw new ConfluenceAdapterError(
        'baseUrl, spaceKey, and credentialsRef are all required.',
        'INVALID_CONFIG',
      );
    }

    const authHeader = this.buildAuthHeader(credentialsRef);
    const title = gherkinDocTitle(doc);
    const body = gherkinDocToConfluenceStorage(doc);

    const existing = await this.findPage(baseUrl, spaceKey, title, authHeader);

    if (existing) {
      const updated = await this.updatePage(
        baseUrl,
        existing.id,
        existing.version,
        title,
        body,
        authHeader,
      );
      this.logger.log(`Updated Confluence page id=${updated.id} title="${title}"`);
      return {
        pageId: updated.id,
        pageUrl: `${updated._links.base}${updated._links.webui}`,
        title,
        action: 'updated',
      };
    }

    const created = await this.createPage(baseUrl, spaceKey, title, body, authHeader, parentPageId);
    this.logger.log(`Created Confluence page id=${created.id} title="${title}"`);
    return {
      pageId: created.id,
      pageUrl: `${created._links.base}${created._links.webui}`,
      title,
      action: 'created',
    };
  }

  private buildAuthHeader(credentialsRef: string): string {
    const secret = this.credentialStore.retrieve(credentialsRef);
    const encoded = Buffer.from(secret, 'utf8').toString('base64');
    return `Basic ${encoded}`;
  }

  private async findPage(
    baseUrl: string,
    spaceKey: string,
    title: string,
    authHeader: string,
  ): Promise<{ id: string; version: number } | null> {
    const url =
      `${baseUrl}/wiki/rest/api/content` +
      `?spaceKey=${encodeURIComponent(spaceKey)}` +
      `&title=${encodeURIComponent(title)}` +
      `&expand=version&type=page`;

    const res = await this.fetch(url, {
      headers: { Authorization: authHeader, Accept: 'application/json' },
    });

    if (res.status === 401 || res.status === 403) {
      throw new ConfluenceAdapterError(
        `Confluence authentication failed searching for page (HTTP ${res.status}).`,
        'AUTH_FAILED',
        res.status,
      );
    }

    if (!res.ok) {
      throw new ConfluenceAdapterError(
        `Confluence API error searching for page (HTTP ${res.status}).`,
        'API_ERROR',
        res.status,
      );
    }

    const data = (await res.json()) as ConfluenceSearchResult;
    if (data.results.length === 0) return null;

    const page = data.results[0];
    return { id: page.id, version: page.version.number };
  }

  private async createPage(
    baseUrl: string,
    spaceKey: string,
    title: string,
    body: string,
    authHeader: string,
    parentPageId?: string,
  ): Promise<ConfluenceContentResponse> {
    const payload: Record<string, unknown> = {
      type: 'page',
      title,
      space: { key: spaceKey },
      body: { storage: { value: body, representation: 'storage' } },
    };

    if (parentPageId) {
      payload.ancestors = [{ id: parentPageId }];
    }

    const res = await this.fetch(`${baseUrl}/wiki/rest/api/content`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 401 || res.status === 403) {
      throw new ConfluenceAdapterError(
        `Confluence authentication failed creating page (HTTP ${res.status}).`,
        'AUTH_FAILED',
        res.status,
      );
    }

    if (!res.ok) {
      throw new ConfluenceAdapterError(
        `Confluence API error creating page (HTTP ${res.status}).`,
        'API_ERROR',
        res.status,
      );
    }

    return res.json() as Promise<ConfluenceContentResponse>;
  }

  private async updatePage(
    baseUrl: string,
    pageId: string,
    currentVersion: number,
    title: string,
    body: string,
    authHeader: string,
  ): Promise<ConfluenceContentResponse> {
    const payload = {
      type: 'page',
      title,
      version: { number: currentVersion + 1 },
      body: { storage: { value: body, representation: 'storage' } },
    };

    const res = await this.fetch(`${baseUrl}/wiki/rest/api/content/${pageId}`, {
      method: 'PUT',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 401 || res.status === 403) {
      throw new ConfluenceAdapterError(
        `Confluence authentication failed updating page (HTTP ${res.status}).`,
        'AUTH_FAILED',
        res.status,
      );
    }

    if (!res.ok) {
      throw new ConfluenceAdapterError(
        `Confluence API error updating page (HTTP ${res.status}).`,
        'API_ERROR',
        res.status,
      );
    }

    return res.json() as Promise<ConfluenceContentResponse>;
  }
}
