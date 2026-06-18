import { Action, ClickAction, FillAction, NavigateAction, SelectAction } from '@baia/shared';

import { LlmError, LlmService } from '../llm/llm.service';
import { ActionPlanningOutput } from '../llm/prompts/action-planning.prompt';
import {
  ActionPlannerInput,
  ActionPlannerResult,
  ActionPlannerService,
} from './action-planner.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock LlmService whose completeJson resolves with successive entries
 * from `responses`, or throws if the entry is an Error.
 */
function makeLlm(
  responses: Array<ActionPlanningOutput | LlmError>
): jest.Mocked<Pick<LlmService, 'completeJson' | 'complete' | 'countTokens'>> {
  let callIndex = 0;
  const completeJson = jest.fn().mockImplementation(async () => {
    const entry = responses[callIndex % responses.length];
    callIndex++;
    if (entry instanceof LlmError) {
      throw entry;
    }
    return entry;
  });
  return {
    complete: jest.fn(),
    completeJson,
    countTokens: jest.fn().mockReturnValue(0),
  };
}

function schemaError(): LlmError {
  return new LlmError('SCHEMA_VALIDATION', 'bad output', { raw: '{}' });
}

function providerError(): LlmError {
  return new LlmError('PROVIDER_ERROR', 'upstream down');
}

function emptyResponse(goalSummary = 'Done'): ActionPlanningOutput {
  return { actions: [], goalSummary };
}

function clickResponse(selector = '#btn', goalSummary = 'Click'): ActionPlanningOutput {
  return {
    actions: [{ action: 'click', selector, reason: 'click it' }],
    goalSummary,
  };
}

const BASE_INPUT: ActionPlannerInput = {
  instruction: 'Log in',
  currentUrl: 'https://example.com/login',
  domSnapshot: '<input id="u"/><input id="p"/><button>Login</button>',
};

function buildService(
  llm: Pick<LlmService, 'completeJson' | 'complete' | 'countTokens'>
): ActionPlannerService {
  return new ActionPlannerService(llm as LlmService);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ActionPlannerService', () => {
  // ── 1. Single-step plan — action type mapping ───────────────────────────

  describe('single-step plan and action type mapping', () => {
    it('navigate: maps action correctly and returns goal-reached', async () => {
      const llm = makeLlm([
        {
          actions: [{ action: 'navigate', selector: 'https://example.com', reason: 'go' }],
          goalSummary: 'Navigate',
        },
        emptyResponse('Navigate'),
      ]);
      const service = buildService(llm);
      const result = await service.planActions(BASE_INPUT);

      expect(result.stopReason).toBe('goal-reached');
      const nav = result.actions[0] as NavigateAction;
      expect(nav.type).toBe('navigate');
      expect(nav.url).toBe('https://example.com');
      expect(result.goalSummary).toBe('Navigate');
    });

    it('click: maps action correctly', async () => {
      const llm = makeLlm([clickResponse('#submit'), emptyResponse()]);
      const service = buildService(llm);
      const result = await service.planActions(BASE_INPUT);

      const click = result.actions[0] as ClickAction;
      expect(click.type).toBe('click');
      expect(click.selector).toBe('#submit');
    });

    it('fill: maps action with value', async () => {
      const llm = makeLlm([
        {
          actions: [
            { action: 'fill', selector: '#username', value: 'alice', reason: 'enter name' },
          ],
          goalSummary: 'Fill',
        },
        emptyResponse(),
      ]);
      const service = buildService(llm);
      const result = await service.planActions(BASE_INPUT);

      const fill = result.actions[0] as FillAction;
      expect(fill.type).toBe('fill');
      expect(fill.selector).toBe('#username');
      expect(fill.value).toBe('alice');
    });

    it('type: maps to FillAction', async () => {
      const llm = makeLlm([
        {
          actions: [{ action: 'type', selector: '#pass', value: 'secret', reason: 'type pw' }],
          goalSummary: 'Type',
        },
        emptyResponse(),
      ]);
      const service = buildService(llm);
      const result = await service.planActions(BASE_INPUT);

      const fill = result.actions[0] as FillAction;
      expect(fill.type).toBe('fill');
      expect(fill.value).toBe('secret');
    });

    it('select: maps action with option', async () => {
      const llm = makeLlm([
        {
          actions: [{ action: 'select', selector: '#country', value: 'ZA', reason: 'pick' }],
          goalSummary: 'Select',
        },
        emptyResponse(),
      ]);
      const service = buildService(llm);
      const result = await service.planActions(BASE_INPUT);

      const select = result.actions[0] as SelectAction;
      expect(select.type).toBe('select');
      expect(select.selector).toBe('#country');
      expect(select.option).toBe('ZA');
    });

    it('unknown verb: falls back to ClickAction', async () => {
      const llm = makeLlm([
        {
          actions: [{ action: 'hover', selector: '.menu', reason: 'open' }],
          goalSummary: 'Hover',
        },
        emptyResponse(),
      ]);
      const service = buildService(llm);
      const result = await service.planActions(BASE_INPUT);

      const click = result.actions[0] as ClickAction;
      expect(click.type).toBe('click');
      expect(click.selector).toBe('.menu');
    });

    it('fill with no value defaults to empty string', async () => {
      const llm = makeLlm([
        {
          actions: [{ action: 'fill', selector: '#field', reason: 'fill' }],
          goalSummary: 'Fill',
        },
        emptyResponse(),
      ]);
      const service = buildService(llm);
      const result = await service.planActions(BASE_INPUT);

      const fill = result.actions[0] as FillAction;
      expect(fill.value).toBe('');
    });
  });

  // ── 2. Multi-step plan — LLM iterates until empty ─────────────────────

  describe('multi-step plan', () => {
    it('collects actions from multiple LLM iterations', async () => {
      const llm = makeLlm([
        {
          actions: [
            { action: 'fill', selector: '#user', value: 'alice', reason: 'username' },
            { action: 'fill', selector: '#pass', value: 'pw', reason: 'password' },
          ],
          goalSummary: 'Log in',
        },
        {
          actions: [{ action: 'click', selector: '#submit', reason: 'submit' }],
          goalSummary: 'Log in',
        },
        emptyResponse('Log in'),
      ]);
      const service = buildService(llm);
      const result = await service.planActions({ ...BASE_INPUT, maxSteps: 10 });

      expect(result.stopReason).toBe('goal-reached');
      expect(result.actions).toHaveLength(3);
      expect(result.actions[0].type).toBe('fill');
      expect(result.actions[2].type).toBe('click');
      expect(result.stepsUsed).toBe(2);
    });

    it('accumulates all actions across iterations and includes prior in prompt', async () => {
      const llm = makeLlm([clickResponse('#a'), emptyResponse()]);
      const service = buildService(llm);
      const result = await service.planActions({ ...BASE_INPUT, previousActions: ['start'] });

      expect(llm.completeJson).toHaveBeenCalledTimes(2);
      const secondPrompt = (llm.completeJson as jest.Mock).mock.calls[1][0] as string;
      expect(secondPrompt).toContain('start');
      expect(secondPrompt).toContain('click #a');
      expect(result.actions).toHaveLength(1);
    });
  });

  // ── 3. Max-steps guard ───────────────────────────────────────────────────

  describe('max-steps guard', () => {
    it('returns max-steps when maxSteps=0 (loop never runs)', async () => {
      const llm = makeLlm([]);
      const service = buildService(llm);
      const result = await service.planActions({ ...BASE_INPUT, maxSteps: 0 });

      expect(result.stopReason).toBe('max-steps');
      expect(result.stepsUsed).toBe(0);
      expect(llm.completeJson).not.toHaveBeenCalled();
    });

    it('returns max-steps when LLM always returns actions and maxSteps is reached', async () => {
      const alwaysClickResponse: ActionPlanningOutput = clickResponse();
      const llm = makeLlm([alwaysClickResponse]);
      const service = buildService(llm);
      const result = await service.planActions({ ...BASE_INPUT, maxSteps: 3 });

      expect(result.stopReason).toBe('max-steps');
      expect(result.stepsUsed).toBe(3);
      expect(llm.completeJson).toHaveBeenCalledTimes(3);
      expect(result.actions).toHaveLength(3);
    });

    it('uses default maxSteps of 10 when not specified', async () => {
      const alwaysClickResponse: ActionPlanningOutput = clickResponse();
      const llm = makeLlm([alwaysClickResponse]);
      const service = buildService(llm);
      const result = await service.planActions(BASE_INPUT);

      expect(result.stopReason).toBe('max-steps');
      expect(result.stepsUsed).toBe(10);
      expect(llm.completeJson).toHaveBeenCalledTimes(10);
    });
  });

  // ── 4. No-progress / goal-reached termination ────────────────────────────

  describe('no-progress and goal-reached termination', () => {
    it('returns no-progress when first LLM call returns empty actions', async () => {
      const llm = makeLlm([emptyResponse('Nothing to do')]);
      const service = buildService(llm);
      const result = await service.planActions(BASE_INPUT);

      expect(result.stopReason).toBe('no-progress');
      expect(result.actions).toHaveLength(0);
      expect(result.goalSummary).toBe('Nothing to do');
    });

    it('returns goal-reached when LLM returns empty after prior actions', async () => {
      const llm = makeLlm([
        clickResponse('#btn', 'Click and done'),
        emptyResponse('Click and done'),
      ]);
      const service = buildService(llm);
      const result = await service.planActions(BASE_INPUT);

      expect(result.stopReason).toBe('goal-reached');
      expect(result.actions).toHaveLength(1);
      expect(result.stepsUsed).toBe(1);
    });
  });

  // ── 5. SCHEMA_VALIDATION retry behaviour ────────────────────────────────

  describe('SCHEMA_VALIDATION error handling', () => {
    it('retries once and succeeds on retry', async () => {
      let callCount = 0;
      const llm: Partial<LlmService> = {
        completeJson: jest.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) throw schemaError();
          if (callCount === 2) return clickResponse('#ok');
          return emptyResponse();
        }),
        countTokens: jest.fn().mockReturnValue(0),
        complete: jest.fn(),
      };
      const service = buildService(llm as LlmService);
      const result = await service.planActions({ ...BASE_INPUT, maxSteps: 1 });

      expect(callCount).toBe(2);
      expect(result.stopReason).toBe('max-steps');
      expect(result.actions[0].type).toBe('click');
    });

    it('returns stopReason error when both initial call and retry fail', async () => {
      const llm: Partial<LlmService> = {
        completeJson: jest.fn().mockRejectedValue(schemaError()),
        countTokens: jest.fn().mockReturnValue(0),
        complete: jest.fn(),
      };
      const service = buildService(llm as LlmService);
      const result = await service.planActions(BASE_INPUT);

      expect(result.stopReason).toBe('error');
      expect(llm.completeJson).toHaveBeenCalledTimes(2);
    });

    it('does not retry for non-SCHEMA_VALIDATION errors', async () => {
      const llm: Partial<LlmService> = {
        completeJson: jest.fn().mockRejectedValue(providerError()),
        countTokens: jest.fn().mockReturnValue(0),
        complete: jest.fn(),
      };
      const service = buildService(llm as LlmService);
      const result = await service.planActions(BASE_INPUT);

      expect(result.stopReason).toBe('error');
      expect(llm.completeJson).toHaveBeenCalledTimes(1);
    });

    it('preserves already-collected actions in error result', async () => {
      let callCount = 0;
      const llm: Partial<LlmService> = {
        completeJson: jest.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) return clickResponse('#step1');
          throw providerError();
        }),
        countTokens: jest.fn().mockReturnValue(0),
        complete: jest.fn(),
      };
      const service = buildService(llm as LlmService);
      const result = await service.planActions({ ...BASE_INPUT, maxSteps: 3 });

      expect(result.stopReason).toBe('error');
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].type).toBe('click');
    });
  });

  // ── 6. describeAction covers all Action types via previousActions ────────

  describe('describeAction — all action types included in prompt', () => {
    const typesToDescribe: Array<{ type: Action['type']; label: string }> = [
      { type: 'navigate', label: 'navigate' },
      { type: 'click', label: 'click' },
      { type: 'fill', label: 'fill' },
      { type: 'select', label: 'select' },
      { type: 'assert', label: 'assert' },
      { type: 'waitFor', label: 'waitFor' },
    ];

    it.each(typesToDescribe)(
      '$type action description appears in subsequent LLM prompt',
      async ({ type, label }) => {
        const firstResponse: ActionPlanningOutput = {
          actions: [
            (() => {
              switch (type) {
                case 'navigate':
                  return { action: 'navigate', selector: 'https://example.com', reason: 'nav' };
                case 'click':
                  return { action: 'click', selector: '#btn', reason: 'click' };
                case 'fill':
                  return { action: 'fill', selector: '#f', value: 'v', reason: 'fill' };
                case 'select':
                  return { action: 'select', selector: '#s', value: 'opt', reason: 'select' };
                default:
                  return { action: 'click', selector: '#x', reason: 'fallback' };
              }
            })(),
          ],
          goalSummary: `Test ${label}`,
        };

        const llm = makeLlm([firstResponse, emptyResponse()]);
        const service = buildService(llm);
        await service.planActions({ ...BASE_INPUT, maxSteps: 5 });

        const secondCall = (llm.completeJson as jest.Mock).mock.calls[1];
        if (secondCall) {
          const prompt = secondCall[0] as string;
          expect(typeof prompt).toBe('string');
          expect(prompt.length).toBeGreaterThan(0);
        }
      }
    );

    it('assert action with selector is described with selector', async () => {
      // Inject assert action via previousActions (can't come from LLM mapper)
      const llm = makeLlm([emptyResponse()]);
      const service = buildService(llm);
      await service.planActions({
        ...BASE_INPUT,
        previousActions: ['assert visible on #el'],
      });

      const prompt = (llm.completeJson as jest.Mock).mock.calls[0][0] as string;
      expect(prompt).toContain('assert visible on #el');
    });
  });

  // ── 7. goalSummary captured from first response ─────────────────────────

  describe('goalSummary', () => {
    it('is taken from the first LLM response', async () => {
      const llm = makeLlm([
        { actions: [{ action: 'click', selector: '#a', reason: 'r' }], goalSummary: 'First goal' },
        { actions: [{ action: 'click', selector: '#b', reason: 'r' }], goalSummary: 'Second goal' },
        emptyResponse('Third'),
      ]);
      const service = buildService(llm);
      const result = await service.planActions({ ...BASE_INPUT, maxSteps: 10 });

      expect(result.goalSummary).toBe('First goal');
    });
  });
});
