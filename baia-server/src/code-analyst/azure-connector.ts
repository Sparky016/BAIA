import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  CloneResult,
  RepoConnector,
  RepoConnectorError,
  RepoCredentials,
  TreeEntry,
} from './repo-connector';

// ── Minimal Azure DevOps API surface the connector depends on ──────────────

export interface AzureApiClient {
  getProfile(): Promise<{ id: string; displayName: string }>;
  getItems(
    project: string,
    repoId: string,
    subPath?: string
  ): Promise<
    Array<{
      path: string;
      gitObjectType: string;
      contentMetadata?: { fileName: string };
    }>
  >;
  getItemContent(project: string, repoId: string, path: string): Promise<string>;
  getRepository(
    project: string,
    repoId: string
  ): Promise<{ id: string; name: string; defaultBranch: string }>;
}

// ── Factory injection token ─────────────────────────────────────────────────

export const AZURE_API_CLIENT_FACTORY = 'AZURE_API_CLIENT_FACTORY';

export type AzureApiClientFactory = (token: string, orgUrl: string) => AzureApiClient;

// ── HTTP error shape thrown by the fetch-based client ──────────────────────

interface FetchError {
  status: number;
  message: string;
}

function throwForStatus(status: number, url: string): never {
  const err: FetchError = {
    status,
    message: `Azure DevOps API returned HTTP ${status} for ${url}`,
  };
  throw err;
}

// ── Production factory (fetch-based, no external SDK required) ─────────────

export async function buildAzureApiClientFactory(): Promise<AzureApiClientFactory> {
  return (token: string, orgUrl: string): AzureApiClient => {
    const baseUrl = orgUrl.replace(/\/$/, '');
    const headers: Record<string, string> = {
      Authorization: `Basic ${Buffer.from(':' + token).toString('base64')}`,
      'Content-Type': 'application/json',
    };

    async function apiFetch(url: string): Promise<unknown> {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        throwForStatus(res.status, url);
      }
      return res.json();
    }

    async function apiFetchText(url: string): Promise<string> {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        throwForStatus(res.status, url);
      }
      return res.text();
    }

    return {
      async getProfile() {
        const data = (await apiFetch(`${baseUrl}/_apis/profile/profiles/me?api-version=6.0`)) as {
          id: string;
          displayName: string;
        };
        return { id: data.id, displayName: data.displayName };
      },

      async getItems(project, repoId, subPath) {
        const scopePath = subPath ? `&scopePath=${encodeURIComponent(subPath)}` : '';
        const data = (await apiFetch(
          `${baseUrl}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repoId)}/items?recursionLevel=Full&api-version=6.0${scopePath}`
        )) as {
          value: Array<{
            path: string;
            gitObjectType: string;
            contentMetadata?: { fileName: string };
          }>;
        };
        return data.value ?? [];
      },

      async getItemContent(project, repoId, path) {
        return apiFetchText(
          `${baseUrl}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repoId)}/items?path=${encodeURIComponent(path)}&api-version=6.0`
        );
      },

      async getRepository(project, repoId) {
        const data = (await apiFetch(
          `${baseUrl}/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repoId)}?api-version=6.0`
        )) as { id: string; name: string; defaultBranch: string };
        return { id: data.id, name: data.name, defaultBranch: data.defaultBranch };
      },
    };
  };
}

// ── URL parsing ─────────────────────────────────────────────────────────────

interface AzureRepoCoords {
  org: string;
  orgUrl: string;
  project: string;
  repoId: string;
}

function parseAzureUrl(url: string): AzureRepoCoords {
  // https://dev.azure.com/{org}/{project}/_git/{repo}
  const devAzureMatch =
    /^https?:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+?)(?:\.git)?(?:\/.*)?$/.exec(url);
  if (devAzureMatch) {
    const [, org, project, repoId] = devAzureMatch;
    return {
      org,
      orgUrl: `https://dev.azure.com/${org}`,
      project,
      repoId,
    };
  }

  // https://{org}.visualstudio.com/{project}/_git/{repo}
  const vsMatch =
    /^https?:\/\/([^.]+)\.visualstudio\.com\/([^/]+)\/_git\/([^/]+?)(?:\.git)?(?:\/.*)?$/.exec(url);
  if (vsMatch) {
    const [, org, project, repoId] = vsMatch;
    return {
      org,
      orgUrl: `https://${org}.visualstudio.com`,
      project,
      repoId,
    };
  }

  throw new RepoConnectorError(
    'UNKNOWN',
    `Cannot parse Azure Repos URL: "${url}". Expected https://dev.azure.com/{org}/{project}/_git/{repo} or https://{org}.visualstudio.com/{project}/_git/{repo}`,
    { url }
  );
}

// ── AzureConnector ──────────────────────────────────────────────────────────

@Injectable()
export class AzureConnector implements RepoConnector {
  private readonly logger = new Logger(AzureConnector.name);

  private client: AzureApiClient | undefined;
  private coords: AzureRepoCoords | undefined;

  constructor(
    @Inject(AZURE_API_CLIENT_FACTORY)
    private readonly clientFactory: AzureApiClientFactory
  ) {}

  async auth(creds: RepoCredentials & { repoUrl: string }): Promise<void> {
    const coords = parseAzureUrl(creds.repoUrl);
    const candidate = this.clientFactory(creds.token, coords.orgUrl);

    try {
      const profile = await candidate.getProfile();
      this.logger.log(`Authenticated as Azure DevOps user: ${profile.displayName}`);
    } catch (err) {
      throw new RepoConnectorError(
        'AUTH_FAILED',
        'Azure DevOps authentication failed. Check that the token is valid and has repo access.',
        undefined,
        err
      );
    }

    this.client = candidate;
    this.coords = coords;
  }

  async listTree(subPath?: string): Promise<TreeEntry[]> {
    const { client, coords } = this.assertAuthenticated();

    try {
      const items = await client.getItems(coords.project, coords.repoId, subPath);

      return items.map((item) => ({
        path: item.path.replace(/^\//, ''),
        type: item.gitObjectType === 'tree' ? 'dir' : 'file',
      }));
    } catch (err) {
      if (err instanceof RepoConnectorError) {
        throw err;
      }
      throw this.wrapApiError('listTree', err);
    }
  }

  async readFile(path: string): Promise<string> {
    const { client, coords } = this.assertAuthenticated();

    try {
      return await client.getItemContent(coords.project, coords.repoId, path);
    } catch (err) {
      if (err instanceof RepoConnectorError) {
        throw err;
      }
      throw this.wrapApiError('readFile', err, path);
    }
  }

  async clone(): Promise<CloneResult> {
    const { client, coords } = this.assertAuthenticated();

    try {
      const items = await client.getItems(coords.project, coords.repoId);
      const blobs = items.filter((item) => item.gitObjectType === 'blob');
      this.logger.log(`Fetching ${blobs.length} files from ${coords.project}/${coords.repoId}`);

      const files = new Map<string, string>();
      for (const item of blobs) {
        const normalizedPath = item.path.replace(/^\//, '');
        const content = await client.getItemContent(coords.project, coords.repoId, item.path);
        files.set(normalizedPath, content);
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

  private assertAuthenticated(): { client: AzureApiClient; coords: AzureRepoCoords } {
    if (!this.client || !this.coords) {
      throw new RepoConnectorError(
        'AUTH_FAILED',
        'AzureConnector: call auth() before using the connector.'
      );
    }
    return { client: this.client, coords: this.coords };
  }

  private wrapApiError(operation: string, err: unknown, path?: string): RepoConnectorError {
    const detail = path ? { operation, path } : { operation };
    const status = (err as { status?: number }).status;

    if (status === 404) {
      const notFoundMsg = path
        ? `File not found: "${path}" in ${this.coords?.project}/${this.coords?.repoId}`
        : `Repository ${this.coords?.project}/${this.coords?.repoId} not found`;
      return new RepoConnectorError('NOT_FOUND', notFoundMsg, detail, err);
    }
    if (status === 401 || status === 403) {
      return new RepoConnectorError(
        'AUTH_FAILED',
        `Azure DevOps API auth error during ${operation} (HTTP ${status}).`,
        detail,
        err
      );
    }
    if (status === 429) {
      return new RepoConnectorError(
        'RATE_LIMITED',
        `Azure DevOps API rate limited during ${operation}.`,
        detail,
        err
      );
    }

    const message = err instanceof Error ? err.message : String(err);
    return new RepoConnectorError(
      'UNKNOWN',
      `Azure DevOps API error during ${operation}: ${message}`,
      detail,
      err
    );
  }
}
