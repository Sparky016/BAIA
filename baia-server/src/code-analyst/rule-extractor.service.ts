import { BusinessRule } from '@baia/shared';
import { Inject, Injectable } from '@nestjs/common';

import { LLM_SERVICE } from '../llm/llm.constants';
import { LlmError, LlmService } from '../llm/llm.service';
import {
  RuleExtractionOutput,
  RULE_EXTRACTION_OUTPUT_SCHEMA,
  renderRuleExtractionPrompt,
} from '../llm/prompts/rule-extraction.prompt';

import { FileChunks, IngestedRepo } from './ingestion.service';

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_RETRIES = 2;

// ── Language detection ───────────────────────────────────────────────────────

function detectLanguage(filePath: string): string {
  if (filePath.endsWith('.cs')) return 'C# ASP.NET';
  if (filePath.endsWith('.ts')) return 'TypeScript';
  if (filePath.endsWith('.js')) return 'JavaScript';
  return 'code';
}

// ── RuleExtractorService ─────────────────────────────────────────────────────

@Injectable()
export class RuleExtractorService {
  constructor(@Inject(LLM_SERVICE) private readonly llm: LlmService) {}

  /**
   * Extract and deduplicate business rules from all chunks in an ingested repo.
   *
   * For each file chunk the LLM is asked to identify business rules. Results
   * are aggregated across all chunks, deduplicated by rule id (last writer
   * wins), and returned sorted by id.
   *
   * Retryable errors (`SCHEMA_VALIDATION`, `PROVIDER_ERROR`) are retried up to
   * {@link MAX_RETRIES} times per chunk; after exhausting retries the chunk is
   * skipped and a warning is emitted.
   */
  async extractRules(repo: IngestedRepo): Promise<BusinessRule[]> {
    const rulesMap = new Map<string, BusinessRule>();

    for (const file of repo.files) {
      await this.processFile(file, rulesMap);
    }

    return Array.from(rulesMap.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async processFile(file: FileChunks, rulesMap: Map<string, BusinessRule>): Promise<void> {
    const language = detectLanguage(file.path);

    for (let chunkIndex = 0; chunkIndex < file.chunks.length; chunkIndex++) {
      const chunkText = file.chunks[chunkIndex].text;
      const output = await this.extractWithRetry(chunkText, file.path, language, chunkIndex);

      if (output === null) {
        // Chunk was skipped after exhausting retries
        continue;
      }

      for (const rule of output.rules) {
        const id = `${file.path}::${rule.ruleId}`;
        const businessRule: BusinessRule = {
          id,
          description: rule.statement,
          category: rule.category ?? 'other',
          sourceRef: `${file.path}:chunk${chunkIndex}`,
        };
        rulesMap.set(id, businessRule);
      }
    }
  }

  private async extractWithRetry(
    codeChunk: string,
    filePath: string,
    language: string,
    chunkIndex: number
  ): Promise<RuleExtractionOutput | null> {
    const prompt = renderRuleExtractionPrompt({ language, codeChunk, filePath });

    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
      try {
        return await this.llm.completeJson<RuleExtractionOutput>(
          prompt,
          RULE_EXTRACTION_OUTPUT_SCHEMA
        );
      } catch (err) {
        if (
          err instanceof LlmError &&
          (err.code === 'SCHEMA_VALIDATION' || err.code === 'PROVIDER_ERROR')
        ) {
          attempt++;
          if (attempt > MAX_RETRIES) {
            console.warn(
              `[RuleExtractorService] Skipping chunk ${chunkIndex} of "${filePath}" after ${MAX_RETRIES} retries: ${err.message}`
            );
            return null;
          }
          // Retry
          continue;
        }
        // Non-retryable error — re-throw
        throw err;
      }
    }

    // Unreachable, but satisfies TypeScript
    return null;
  }
}
