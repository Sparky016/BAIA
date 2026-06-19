import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RunStatus, RunSummary, GherkinDoc, UnifiedDoc } from '@baia/shared';

import { RunsService } from '../runs/runs.service';
import { ConfluenceAdapter, ConfluencePageResult } from './confluence.adapter';
import { ExportController, ExportRunBody } from './export.controller';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2025-01-01T00:00:00Z');

const EXPORT_BODY: ExportRunBody = {
  baseUrl: 'https://mycompany.atlassian.net',
  spaceKey: 'ENG',
  credentialsRef: 'confluence-creds',
};

const MOCK_GHERKIN_DOC: GherkinDoc = {
  generatedAt: NOW,
  features: [
    {
      name: 'Login',
      scenarios: [
        {
          name: 'Successful login',
          steps: [
            { keyword: 'Given', text: 'I am on the login page', provenance: 'ui' },
            { keyword: 'When', text: 'I enter valid credentials', provenance: 'ui' },
            { keyword: 'Then', text: 'I am redirected to the dashboard', provenance: 'ui' },
          ],
        },
      ],
    },
  ],
};

const MOCK_UNIFIED_DOC: UnifiedDoc = {
  generatedAt: NOW,
  sourceRunId: 'run-0001',
  conflicts: [],
  features: [
    {
      name: 'Login',
      scenarios: [
        {
          name: 'Successful login with code rules',
          steps: [
            { keyword: 'Given', text: 'I am on the login page', provenance: 'ui' },
            { keyword: 'When', text: 'I enter valid credentials', provenance: 'merged' },
            { keyword: 'Then', text: 'the session token is set', provenance: 'code' },
          ],
          conflicts: [
            { scenarioName: 'Successful login with code rules', description: 'Token TTL mismatch' },
          ],
        },
      ],
    },
  ],
};

const MOCK_PAGE_RESULT: ConfluencePageResult = {
  pageId: 'page-42',
  pageUrl: 'https://mycompany.atlassian.net/wiki/spaces/ENG/pages/42',
  title: 'BAIA: Login',
  action: 'created',
};

function makeRun(partial: Partial<RunSummary> = {}): RunSummary {
  return {
    runId: 'run-0001',
    status: RunStatus.Review,
    targetUrl: 'https://example.com',
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExportController', () => {
  let controller: ExportController;
  let runsService: jest.Mocked<Pick<RunsService, 'getRun' | 'transitionRun'>>;
  let confluenceAdapter: jest.Mocked<Pick<ConfluenceAdapter, 'publishPage'>>;

  beforeEach(async () => {
    runsService = {
      getRun: jest.fn(),
      transitionRun: jest.fn(),
    };

    confluenceAdapter = {
      publishPage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExportController],
      providers: [
        { provide: RunsService, useValue: runsService },
        { provide: ConfluenceAdapter, useValue: confluenceAdapter },
      ],
    }).compile();

    controller = module.get<ExportController>(ExportController);
  });

  // ── Happy path: unifiedDoc ────────────────────────────────────────────────

  describe('exportRun() — happy path with unifiedDoc', () => {
    it('returns the Confluence page URL', async () => {
      runsService.getRun.mockReturnValue(makeRun({ unifiedDoc: MOCK_UNIFIED_DOC }));
      runsService.transitionRun.mockReturnValue(makeRun());
      confluenceAdapter.publishPage.mockResolvedValue(MOCK_PAGE_RESULT);

      const result = await controller.exportRun('run-0001', EXPORT_BODY);

      expect(result).toEqual({ url: MOCK_PAGE_RESULT.pageUrl });
    });

    it('transitions review → exporting before calling Confluence', async () => {
      const transitions: RunStatus[] = [];
      runsService.getRun.mockReturnValue(makeRun({ unifiedDoc: MOCK_UNIFIED_DOC }));
      runsService.transitionRun.mockImplementation((_id, to) => {
        transitions.push(to);
        return makeRun({ status: to });
      });
      confluenceAdapter.publishPage.mockResolvedValue(MOCK_PAGE_RESULT);

      await controller.exportRun('run-0001', EXPORT_BODY);

      expect(transitions[0]).toBe(RunStatus.Exporting);
    });

    it('transitions exporting → done after publishing', async () => {
      const transitions: RunStatus[] = [];
      runsService.getRun.mockReturnValue(makeRun({ unifiedDoc: MOCK_UNIFIED_DOC }));
      runsService.transitionRun.mockImplementation((_id, to) => {
        transitions.push(to);
        return makeRun({ status: to });
      });
      confluenceAdapter.publishPage.mockResolvedValue(MOCK_PAGE_RESULT);

      await controller.exportRun('run-0001', EXPORT_BODY);

      expect(transitions).toEqual([RunStatus.Exporting, RunStatus.Done]);
    });

    it('converts unified doc conflict notes into conflictNote string', async () => {
      runsService.getRun.mockReturnValue(makeRun({ unifiedDoc: MOCK_UNIFIED_DOC }));
      runsService.transitionRun.mockReturnValue(makeRun());
      confluenceAdapter.publishPage.mockResolvedValue(MOCK_PAGE_RESULT);

      await controller.exportRun('run-0001', EXPORT_BODY);

      const publishedDoc = confluenceAdapter.publishPage.mock.calls[0][1];
      expect(publishedDoc.features[0].scenarios[0].conflictNote).toBe('Token TTL mismatch');
    });

    it('passes ConfluenceConfig with provided body fields', async () => {
      runsService.getRun.mockReturnValue(makeRun({ unifiedDoc: MOCK_UNIFIED_DOC }));
      runsService.transitionRun.mockReturnValue(makeRun());
      confluenceAdapter.publishPage.mockResolvedValue(MOCK_PAGE_RESULT);

      const bodyWithParent = { ...EXPORT_BODY, parentPageId: '999' };
      await controller.exportRun('run-0001', bodyWithParent);

      const [config] = confluenceAdapter.publishPage.mock.calls[0];
      expect(config.baseUrl).toBe(EXPORT_BODY.baseUrl);
      expect(config.spaceKey).toBe(EXPORT_BODY.spaceKey);
      expect(config.credentialsRef).toBe(EXPORT_BODY.credentialsRef);
      expect(config.parentPageId).toBe('999');
    });
  });

  // ── Happy path: gherkinDoc fallback ───────────────────────────────────────

  describe('exportRun() — happy path with gherkinDoc (no unifiedDoc)', () => {
    it('falls back to gherkinDoc when unifiedDoc is absent', async () => {
      runsService.getRun.mockReturnValue(makeRun({ gherkinDoc: MOCK_GHERKIN_DOC }));
      runsService.transitionRun.mockReturnValue(makeRun());
      confluenceAdapter.publishPage.mockResolvedValue(MOCK_PAGE_RESULT);

      const result = await controller.exportRun('run-0001', EXPORT_BODY);

      expect(result).toEqual({ url: MOCK_PAGE_RESULT.pageUrl });
      const publishedDoc = confluenceAdapter.publishPage.mock.calls[0][1];
      expect(publishedDoc.features[0].name).toBe('Login');
    });
  });

  // ── Guard: run not in review (409) ────────────────────────────────────────

  describe('exportRun() — guard: run not in review', () => {
    const nonReviewStatuses: RunStatus[] = [
      RunStatus.Queued,
      RunStatus.Exploring,
      RunStatus.Analyzing,
      RunStatus.Reconciling,
      RunStatus.Exporting,
      RunStatus.Done,
      RunStatus.Failed,
    ];

    it.each(nonReviewStatuses)(
      'throws ConflictException when run is in "%s" state',
      async (status) => {
        runsService.getRun.mockReturnValue(makeRun({ status, gherkinDoc: MOCK_GHERKIN_DOC }));

        await expect(controller.exportRun('run-0001', EXPORT_BODY)).rejects.toThrow(
          ConflictException
        );
      }
    );

    it('does not call Confluence when guard rejects', async () => {
      runsService.getRun.mockReturnValue(
        makeRun({ status: RunStatus.Queued, gherkinDoc: MOCK_GHERKIN_DOC })
      );

      await expect(controller.exportRun('run-0001', EXPORT_BODY)).rejects.toThrow(
        ConflictException
      );
      expect(confluenceAdapter.publishPage).not.toHaveBeenCalled();
    });

    it('conflict message mentions current state', async () => {
      runsService.getRun.mockReturnValue(
        makeRun({ status: RunStatus.Queued, gherkinDoc: MOCK_GHERKIN_DOC })
      );

      let caught: unknown;
      try {
        await controller.exportRun('run-0001', EXPORT_BODY);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(ConflictException);
      expect((caught as ConflictException).message).toContain(RunStatus.Queued);
    });
  });

  // ── Guard: no doc to export (400) ────────────────────────────────────────

  describe('exportRun() — guard: no document', () => {
    it('throws BadRequestException when run has no gherkinDoc or unifiedDoc', async () => {
      runsService.getRun.mockReturnValue(makeRun({ gherkinDoc: undefined, unifiedDoc: undefined }));

      await expect(controller.exportRun('run-0001', EXPORT_BODY)).rejects.toThrow(
        BadRequestException
      );
    });

    it('does not call Confluence when no doc is available', async () => {
      runsService.getRun.mockReturnValue(makeRun());

      await expect(controller.exportRun('run-0001', EXPORT_BODY)).rejects.toThrow(
        BadRequestException
      );
      expect(confluenceAdapter.publishPage).not.toHaveBeenCalled();
    });
  });

  // ── Guard: run not found (404) ────────────────────────────────────────────

  describe('exportRun() — guard: run not found', () => {
    it('re-throws NotFoundException from RunsService', async () => {
      runsService.getRun.mockImplementation(() => {
        throw new NotFoundException("Run 'run-9999' not found.");
      });

      await expect(controller.exportRun('run-9999', EXPORT_BODY)).rejects.toThrow(
        NotFoundException
      );
    });
  });

  // ── unified doc conversion ────────────────────────────────────────────────

  describe('unifiedDoc → GherkinDoc conversion', () => {
    it('maps unified doc steps preserving keyword, text, and provenance', async () => {
      runsService.getRun.mockReturnValue(makeRun({ unifiedDoc: MOCK_UNIFIED_DOC }));
      runsService.transitionRun.mockReturnValue(makeRun());
      confluenceAdapter.publishPage.mockResolvedValue(MOCK_PAGE_RESULT);

      await controller.exportRun('run-0001', EXPORT_BODY);

      const doc = confluenceAdapter.publishPage.mock.calls[0][1];
      const step = doc.features[0].scenarios[0].steps[0];
      expect(step).toMatchObject({
        keyword: 'Given',
        text: 'I am on the login page',
        provenance: 'ui',
      });
    });

    it('sets conflictNote to undefined when scenario has no conflicts', async () => {
      const docWithNoConflicts: UnifiedDoc = {
        ...MOCK_UNIFIED_DOC,
        features: [
          {
            name: 'Checkout',
            scenarios: [
              {
                name: 'Complete purchase',
                steps: [{ keyword: 'When', text: 'I checkout', provenance: 'ui' }],
                conflicts: [],
              },
            ],
          },
        ],
      };

      runsService.getRun.mockReturnValue(makeRun({ unifiedDoc: docWithNoConflicts }));
      runsService.transitionRun.mockReturnValue(makeRun());
      confluenceAdapter.publishPage.mockResolvedValue(MOCK_PAGE_RESULT);

      await controller.exportRun('run-0001', EXPORT_BODY);

      const doc = confluenceAdapter.publishPage.mock.calls[0][1];
      expect(doc.features[0].scenarios[0].conflictNote).toBeUndefined();
    });

    it('joins multiple conflicts into a single conflictNote string', async () => {
      const docWithMultipleConflicts: UnifiedDoc = {
        ...MOCK_UNIFIED_DOC,
        features: [
          {
            name: 'Payment',
            scenarios: [
              {
                name: 'Payment validation',
                steps: [{ keyword: 'Then', text: 'payment is validated', provenance: 'code' }],
                conflicts: [
                  { scenarioName: 'Payment validation', description: 'Amount rounding differs' },
                  { scenarioName: 'Payment validation', description: 'Currency code missing' },
                ],
              },
            ],
          },
        ],
      };

      runsService.getRun.mockReturnValue(makeRun({ unifiedDoc: docWithMultipleConflicts }));
      runsService.transitionRun.mockReturnValue(makeRun());
      confluenceAdapter.publishPage.mockResolvedValue(MOCK_PAGE_RESULT);

      await controller.exportRun('run-0001', EXPORT_BODY);

      const doc = confluenceAdapter.publishPage.mock.calls[0][1];
      expect(doc.features[0].scenarios[0].conflictNote).toBe(
        'Amount rounding differs; Currency code missing'
      );
    });

    it('prefers unifiedDoc over gherkinDoc when both are present', async () => {
      runsService.getRun.mockReturnValue(
        makeRun({ unifiedDoc: MOCK_UNIFIED_DOC, gherkinDoc: MOCK_GHERKIN_DOC })
      );
      runsService.transitionRun.mockReturnValue(makeRun());
      confluenceAdapter.publishPage.mockResolvedValue(MOCK_PAGE_RESULT);

      await controller.exportRun('run-0001', EXPORT_BODY);

      const doc = confluenceAdapter.publishPage.mock.calls[0][1];
      // The unified doc scenario name differs from the gherkin doc scenario name
      expect(doc.features[0].scenarios[0].name).toBe('Successful login with code rules');
    });
  });
});
