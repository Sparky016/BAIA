import { Inject, Injectable } from '@nestjs/common';

import { chunk, Chunk } from '../llm/chunking';
import { LLM_SERVICE } from '../llm/llm.constants';
import { LlmService } from '../llm/llm.service';

import { REPO_CONNECTOR, RepoConnector } from './repo-connector';

// ── Public types ────────────────────────────────────────────────────────────

export interface IngestionOptions {
  maxTokensPerChunk?: number;
  overlapTokens?: number;
}

export interface FileChunks {
  path: string;
  chunks: Chunk[];
}

export interface IngestedRepo {
  files: FileChunks[];
  totalChunks: number;
  skippedFiles: string[];
}

// ── Include / exclude rules ─────────────────────────────────────────────────

const INCLUDE_PATH_SEGMENTS = [
  'Controllers/',
  'Models/',
  'Views/',
  'src/',
  'Services/',
  'Repositories/',
  'Validators/',
];

const INCLUDE_EXTENSIONS = ['.cs', '.ts', '.js', '.py', '.java', '.rb', '.go'];

const EXCLUDE_PATH_SEGMENTS = ['bin/', 'obj/', 'node_modules/', '.git/', 'dist/', 'coverage/'];

const EXCLUDE_EXTENSIONS = [
  '.min.js',
  '.png',
  '.jpg',
  '.gif',
  '.ico',
  '.woff',
  '.ttf',
  '.eot',
  '.svg',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.exe',
  '.dll',
  '.pdb',
];

const MAX_FILE_SIZE_BYTES = 500 * 1024;

function shouldExclude(path: string): boolean {
  const lower = path.toLowerCase();

  if (EXCLUDE_PATH_SEGMENTS.some((seg) => lower.includes(seg.toLowerCase()))) {
    return true;
  }

  if (EXCLUDE_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return true;
  }

  return false;
}

function shouldInclude(path: string): boolean {
  const lower = path.toLowerCase();

  if (INCLUDE_PATH_SEGMENTS.some((seg) => lower.includes(seg.toLowerCase()))) {
    return true;
  }

  if (INCLUDE_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return true;
  }

  return false;
}

// ── IngestionService ────────────────────────────────────────────────────────

@Injectable()
export class IngestionService {
  constructor(
    @Inject(REPO_CONNECTOR) private readonly connector: RepoConnector,
    @Inject(LLM_SERVICE) private readonly llmService: LlmService
  ) {}

  async ingestRepo(options: IngestionOptions = {}): Promise<IngestedRepo> {
    const maxTokens = options.maxTokensPerChunk ?? 3000;
    const rawOverlap = options.overlapTokens ?? 200;
    const overlap = Math.min(rawOverlap, maxTokens - 1);

    const entries = await this.connector.listTree();
    const fileEntries = entries.filter((e) => e.type === 'file');

    const includedPaths: string[] = [];
    const skippedFiles: string[] = [];

    for (const entry of fileEntries) {
      if (shouldExclude(entry.path)) {
        skippedFiles.push(entry.path);
        continue;
      }
      if (!shouldInclude(entry.path)) {
        skippedFiles.push(entry.path);
        continue;
      }
      if (entry.size !== undefined && entry.size > MAX_FILE_SIZE_BYTES) {
        skippedFiles.push(entry.path);
        continue;
      }
      includedPaths.push(entry.path);
    }

    const files: FileChunks[] = [];
    let totalChunks = 0;

    for (const path of includedPaths) {
      const content = await this.connector.readFile(path);

      if (Buffer.byteLength(content, 'utf8') > MAX_FILE_SIZE_BYTES) {
        skippedFiles.push(path);
        continue;
      }

      const chunks = chunk(content, {
        maxTokens,
        overlap,
        boundary: 'paragraph',
        countTokens: this.llmService,
      });

      files.push({ path, chunks });
      totalChunks += chunks.length;
    }

    return { files, totalChunks, skippedFiles };
  }
}
