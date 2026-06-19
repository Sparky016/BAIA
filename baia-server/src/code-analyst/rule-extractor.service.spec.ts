import { BusinessRule } from '@baia/shared';

import { LlmError, LlmService } from '../llm/llm.service';
import { RuleExtractionOutput } from '../llm/prompts/rule-extraction.prompt';

import { IngestedRepo } from './ingestion.service';
import { RuleExtractorService } from './rule-extractor.service';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeChunk(text: string, index = 0) {
  return { index, text, tokenCount: text.length, sourceRange: { start: 0, end: text.length } };
}

function makeRepo(
  files: Array<{ path: string; chunks: ReturnType<typeof makeChunk>[] }>
): IngestedRepo {
  const totalChunks = files.reduce((acc, f) => acc + f.chunks.length, 0);
  return { files, totalChunks, skippedFiles: [] };
}

function makeOutput(rules: RuleExtractionOutput['rules'], module = 'test'): RuleExtractionOutput {
  return { module, rules, summary: 'Test summary' };
}

// ── MyCMS-inspired fixture data ───────────────────────────────────────────────

const HOME_CONTROLLER_CHUNK = makeChunk(
  `public class HomeController : Controller {
    [Authorize]
    public ActionResult Index() {
      if (!User.Identity.IsAuthenticated) return RedirectToAction("Login", "Account");
      var pages = _contentService.GetPublishedPages();
      return View(pages);
    }
  }`,
  0
);

const CONTENT_PAGE_CHUNK = makeChunk(
  `public class ContentPage {
    [Required]
    public string Title { get; set; }
    [Required, MaxLength(500)]
    public string Body { get; set; }
    public bool IsPublished { get; set; }
  }`,
  0
);

const HOME_CONTROLLER_RULES: RuleExtractionOutput = makeOutput(
  [
    {
      ruleId: 'auth-redirect-unauthenticated',
      statement: 'Users must be authenticated to access the home page',
      severity: 'must',
      evidence: 'if (!User.Identity.IsAuthenticated) return RedirectToAction("Login", "Account");',
      category: 'authentication',
    },
    {
      ruleId: 'home-shows-published-pages',
      statement: 'The home page must only display published content pages',
      severity: 'must',
      evidence: 'var pages = _contentService.GetPublishedPages();',
      category: 'navigation',
    },
  ],
  'HomeController'
);

const CONTENT_PAGE_RULES: RuleExtractionOutput = makeOutput(
  [
    {
      ruleId: 'content-title-required',
      statement: 'A content page must have a title',
      severity: 'must',
      evidence: '[Required] public string Title { get; set; }',
      category: 'validation',
    },
  ],
  'ContentPage'
);

// ── Mock setup ───────────────────────────────────────────────────────────────

const mockLlm = {
  complete: jest.fn(),
  completeJson: jest.fn(),
  countTokens: jest.fn().mockReturnValue(10),
} as unknown as LlmService;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RuleExtractorService', () => {
  let service: RuleExtractorService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RuleExtractorService(mockLlm);
  });

  // ── Happy path ───────────────────────────────────────────────────────────

  it('happy path: two files, one chunk each → returns correct BusinessRule[]', async () => {
    (mockLlm.completeJson as jest.Mock)
      .mockResolvedValueOnce(HOME_CONTROLLER_RULES)
      .mockResolvedValueOnce(CONTENT_PAGE_RULES);

    const repo = makeRepo([
      { path: 'Controllers/HomeController.cs', chunks: [HOME_CONTROLLER_CHUNK] },
      { path: 'Models/ContentPage.cs', chunks: [CONTENT_PAGE_CHUNK] },
    ]);

    const result = await service.extractRules(repo);

    expect(result).toHaveLength(3);

    const authRule = result.find((r) => r.id.includes('auth-redirect-unauthenticated'));
    expect(authRule).toBeDefined();
    expect(authRule!.id).toBe('Controllers/HomeController.cs::auth-redirect-unauthenticated');
    expect(authRule!.description).toBe('Users must be authenticated to access the home page');
    expect(authRule!.category).toBe('authentication');

    const contentRule = result.find((r) => r.id.includes('content-title-required'));
    expect(contentRule).toBeDefined();
    expect(contentRule!.id).toBe('Models/ContentPage.cs::content-title-required');
  });

  // ── Provenance in sourceRef ───────────────────────────────────────────────

  it('sourceRef contains the file path and chunk index', async () => {
    (mockLlm.completeJson as jest.Mock).mockResolvedValueOnce(HOME_CONTROLLER_RULES);

    const repo = makeRepo([
      { path: 'Controllers/HomeController.cs', chunks: [HOME_CONTROLLER_CHUNK] },
    ]);

    const result = await service.extractRules(repo);

    for (const rule of result) {
      expect(rule.sourceRef).toBe('Controllers/HomeController.cs:chunk0');
    }
  });

  it('sourceRef chunk index reflects actual chunk position', async () => {
    const chunk0 = makeChunk('// chunk 0 content', 0);
    const chunk1 = makeChunk('// chunk 1 content', 1);

    const rules0 = makeOutput([
      {
        ruleId: 'rule-from-chunk0',
        statement: 'Rule from chunk 0',
        severity: 'must',
        evidence: '// chunk 0',
        category: 'other',
      },
    ]);
    const rules1 = makeOutput([
      {
        ruleId: 'rule-from-chunk1',
        statement: 'Rule from chunk 1',
        severity: 'must',
        evidence: '// chunk 1',
        category: 'other',
      },
    ]);

    (mockLlm.completeJson as jest.Mock).mockResolvedValueOnce(rules0).mockResolvedValueOnce(rules1);

    const repo = makeRepo([{ path: 'src/service.ts', chunks: [chunk0, chunk1] }]);

    const result = await service.extractRules(repo);

    const r0 = result.find((r) => r.id.includes('rule-from-chunk0'));
    const r1 = result.find((r) => r.id.includes('rule-from-chunk1'));

    expect(r0!.sourceRef).toBe('src/service.ts:chunk0');
    expect(r1!.sourceRef).toBe('src/service.ts:chunk1');
  });

  // ── Category fallback ────────────────────────────────────────────────────

  it('category fallback: ExtractedRule with no category → BusinessRule.category is "other"', async () => {
    const ruleWithoutCategory: RuleExtractionOutput = makeOutput([
      {
        ruleId: 'no-category-rule',
        statement: 'Some rule without a category',
        severity: 'should',
        evidence: 'some code',
        // no category field
      },
    ]);

    (mockLlm.completeJson as jest.Mock).mockResolvedValueOnce(ruleWithoutCategory);

    const repo = makeRepo([{ path: 'src/index.ts', chunks: [makeChunk('some code')] }]);

    const result = await service.extractRules(repo);

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('other');
  });

  // ── Deduplication ────────────────────────────────────────────────────────

  it('deduplication: same ruleId from two chunks of the same file → deduplicated to one', async () => {
    const firstChunk = makeChunk('// first chunk', 0);
    const secondChunk = makeChunk('// second chunk', 1);

    const duplicateRuleFirst: RuleExtractionOutput = makeOutput([
      {
        ruleId: 'duplicate-rule',
        statement: 'First version of the rule',
        severity: 'must',
        evidence: '// first chunk',
        category: 'validation',
      },
    ]);
    const duplicateRuleSecond: RuleExtractionOutput = makeOutput([
      {
        ruleId: 'duplicate-rule',
        statement: 'Second version of the rule (last writer wins)',
        severity: 'must',
        evidence: '// second chunk',
        category: 'data-access',
      },
    ]);

    (mockLlm.completeJson as jest.Mock)
      .mockResolvedValueOnce(duplicateRuleFirst)
      .mockResolvedValueOnce(duplicateRuleSecond);

    const repo = makeRepo([
      { path: 'Controllers/HomeController.cs', chunks: [firstChunk, secondChunk] },
    ]);

    const result = await service.extractRules(repo);

    expect(result).toHaveLength(1);
    // Last writer wins
    expect(result[0].description).toBe('Second version of the rule (last writer wins)');
    expect(result[0].category).toBe('data-access');
  });

  // ── Retry on schema error ────────────────────────────────────────────────

  it('retry on schema error: first call throws SCHEMA_VALIDATION, second succeeds', async () => {
    const schemaError = new LlmError('SCHEMA_VALIDATION', 'Output did not match schema');

    (mockLlm.completeJson as jest.Mock)
      .mockRejectedValueOnce(schemaError)
      .mockResolvedValueOnce(CONTENT_PAGE_RULES);

    const repo = makeRepo([{ path: 'Models/ContentPage.cs', chunks: [CONTENT_PAGE_CHUNK] }]);

    const result = await service.extractRules(repo);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('Models/ContentPage.cs::content-title-required');
    expect(mockLlm.completeJson).toHaveBeenCalledTimes(2);
  });

  it('retry on provider error: first call throws PROVIDER_ERROR, second succeeds', async () => {
    const providerError = new LlmError('PROVIDER_ERROR', 'Provider unavailable');

    (mockLlm.completeJson as jest.Mock)
      .mockRejectedValueOnce(providerError)
      .mockResolvedValueOnce(CONTENT_PAGE_RULES);

    const repo = makeRepo([{ path: 'Models/ContentPage.cs', chunks: [CONTENT_PAGE_CHUNK] }]);

    const result = await service.extractRules(repo);

    expect(result).toHaveLength(1);
    expect(mockLlm.completeJson).toHaveBeenCalledTimes(2);
  });

  // ── Skip chunk after max retries ─────────────────────────────────────────

  it('skip chunk after max retries: all attempts fail → chunk skipped, returns rules from other chunks', async () => {
    const schemaError = new LlmError('SCHEMA_VALIDATION', 'Persistent schema failure');

    (mockLlm.completeJson as jest.Mock)
      // Three attempts for the first chunk (initial + 2 retries), all fail
      .mockRejectedValueOnce(schemaError)
      .mockRejectedValueOnce(schemaError)
      .mockRejectedValueOnce(schemaError)
      // Second file succeeds
      .mockResolvedValueOnce(CONTENT_PAGE_RULES);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const repo = makeRepo([
      { path: 'Controllers/HomeController.cs', chunks: [HOME_CONTROLLER_CHUNK] },
      { path: 'Models/ContentPage.cs', chunks: [CONTENT_PAGE_CHUNK] },
    ]);

    const result = await service.extractRules(repo);

    // HomeController chunk is skipped, ContentPage rules still returned
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('Models/ContentPage.cs::content-title-required');

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Controllers/HomeController.cs'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('2 retries'));

    warnSpy.mockRestore();
  });

  it('does not throw when all chunks fail — just returns empty array', async () => {
    const providerError = new LlmError('PROVIDER_ERROR', 'Provider down');

    (mockLlm.completeJson as jest.Mock).mockRejectedValue(providerError);

    const repo = makeRepo([{ path: 'src/index.ts', chunks: [makeChunk('// only chunk')] }]);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(service.extractRules(repo)).resolves.toEqual([]);

    warnSpy.mockRestore();
  });

  // ── Non-retryable errors are re-thrown ────────────────────────────────────

  it('non-retryable error (RATE_LIMITED) is re-thrown immediately', async () => {
    const rateLimitError = new LlmError('RATE_LIMITED', 'Rate limit exceeded');

    (mockLlm.completeJson as jest.Mock).mockRejectedValue(rateLimitError);

    const repo = makeRepo([{ path: 'src/index.ts', chunks: [makeChunk('// code')] }]);

    await expect(service.extractRules(repo)).rejects.toThrow(LlmError);
    await expect(service.extractRules(repo)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  // ── Empty repo ───────────────────────────────────────────────────────────

  it('empty repo: no files → returns []', async () => {
    const repo: IngestedRepo = { files: [], totalChunks: 0, skippedFiles: [] };

    const result = await service.extractRules(repo);

    expect(result).toEqual([]);
    expect(mockLlm.completeJson).not.toHaveBeenCalled();
  });

  // ── Multiple rules per chunk ──────────────────────────────────────────────

  it('multiple rules per chunk: chunk returns 3 rules → all 3 appear in output', async () => {
    const threeRules: RuleExtractionOutput = makeOutput([
      {
        ruleId: 'rule-one',
        statement: 'First business rule',
        severity: 'must',
        evidence: 'code line 1',
        category: 'validation',
      },
      {
        ruleId: 'rule-two',
        statement: 'Second business rule',
        severity: 'should',
        evidence: 'code line 2',
        category: 'authentication',
      },
      {
        ruleId: 'rule-three',
        statement: 'Third business rule',
        severity: 'may',
        evidence: 'code line 3',
        category: 'navigation',
      },
    ]);

    (mockLlm.completeJson as jest.Mock).mockResolvedValueOnce(threeRules);

    const repo = makeRepo([
      { path: 'Controllers/HomeController.cs', chunks: [HOME_CONTROLLER_CHUNK] },
    ]);

    const result = await service.extractRules(repo);

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id)).toEqual([
      'Controllers/HomeController.cs::rule-one',
      'Controllers/HomeController.cs::rule-three',
      'Controllers/HomeController.cs::rule-two',
    ]);
  });

  // ── Sorting ──────────────────────────────────────────────────────────────

  it('output is sorted by id', async () => {
    const rulesZ: RuleExtractionOutput = makeOutput([
      { ruleId: 'z-rule', statement: 'Z rule', severity: 'must', evidence: 'z', category: 'other' },
    ]);
    const rulesA: RuleExtractionOutput = makeOutput([
      { ruleId: 'a-rule', statement: 'A rule', severity: 'must', evidence: 'a', category: 'other' },
    ]);

    (mockLlm.completeJson as jest.Mock).mockResolvedValueOnce(rulesZ).mockResolvedValueOnce(rulesA);

    const repo = makeRepo([
      { path: 'src/z.ts', chunks: [makeChunk('z')] },
      { path: 'src/a.ts', chunks: [makeChunk('a')] },
    ]);

    const result = await service.extractRules(repo);

    const ids = result.map((r) => r.id);
    const sorted = [...ids].sort((a, b) => a.localeCompare(b));
    expect(ids).toEqual(sorted);
  });

  // ── Language detection via file extension ─────────────────────────────────

  it('uses correct language for .cs files', async () => {
    (mockLlm.completeJson as jest.Mock).mockResolvedValueOnce(makeOutput([]));

    await service.extractRules(
      makeRepo([{ path: 'Controllers/HomeController.cs', chunks: [makeChunk('code')] }])
    );

    const promptArg = (mockLlm.completeJson as jest.Mock).mock.calls[0][0] as string;
    expect(promptArg).toContain('C# ASP.NET');
  });

  it('uses correct language for .ts files', async () => {
    (mockLlm.completeJson as jest.Mock).mockResolvedValueOnce(makeOutput([]));

    await service.extractRules(makeRepo([{ path: 'src/service.ts', chunks: [makeChunk('code')] }]));

    const promptArg = (mockLlm.completeJson as jest.Mock).mock.calls[0][0] as string;
    expect(promptArg).toContain('TypeScript');
  });

  it('uses correct language for .js files', async () => {
    (mockLlm.completeJson as jest.Mock).mockResolvedValueOnce(makeOutput([]));

    await service.extractRules(makeRepo([{ path: 'src/util.js', chunks: [makeChunk('code')] }]));

    const promptArg = (mockLlm.completeJson as jest.Mock).mock.calls[0][0] as string;
    expect(promptArg).toContain('JavaScript');
  });

  it('falls back to "code" for unknown extensions', async () => {
    (mockLlm.completeJson as jest.Mock).mockResolvedValueOnce(makeOutput([]));

    await service.extractRules(makeRepo([{ path: 'src/module.py', chunks: [makeChunk('code')] }]));

    const promptArg = (mockLlm.completeJson as jest.Mock).mock.calls[0][0] as string;
    expect(promptArg).toContain('code');
  });

  // ── BusinessRule shape correctness ────────────────────────────────────────

  it('maps ExtractedRule fields to BusinessRule correctly', async () => {
    const singleRule: RuleExtractionOutput = makeOutput([
      {
        ruleId: 'exact-mapping-check',
        statement: 'Exact statement for mapping test',
        severity: 'must',
        evidence: 'some evidence',
        category: 'authorisation',
      },
    ]);

    (mockLlm.completeJson as jest.Mock).mockResolvedValueOnce(singleRule);

    const repo = makeRepo([{ path: 'Services/AuthService.cs', chunks: [makeChunk('code')] }]);

    const result = await service.extractRules(repo);

    expect(result).toHaveLength(1);
    const rule: BusinessRule = result[0];
    expect(rule.id).toBe('Services/AuthService.cs::exact-mapping-check');
    expect(rule.description).toBe('Exact statement for mapping test');
    expect(rule.category).toBe('authorisation');
    expect(rule.sourceRef).toBe('Services/AuthService.cs:chunk0');
  });
});
