import { Action, ClickAction, FillAction, NavigateAction, SelectAction } from '@baia/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { LLM_SERVICE } from '../llm/llm.constants';
import { LlmError, LlmService } from '../llm/llm.service';
import {
  ACTION_PLANNING_OUTPUT_SCHEMA,
  ActionPlanningOutput,
  PlannedAction,
  STEP_PLANNER_OUTPUT_SCHEMA,
  StepPlannerInput,
  StepPlannerOutput,
  renderActionPlanningPrompt,
  renderStepPlannerPrompt,
} from '../llm/prompts/action-planning.prompt';

export interface ActionPlannerInput {
  readonly instruction: string;
  readonly currentUrl: string;
  readonly domSnapshot: string;
  readonly previousActions?: readonly string[];
  readonly maxSteps?: number;
}

export interface ActionPlannerResult {
  actions: Action[];
  goalSummary: string;
  stepsUsed: number;
  stopReason: 'goal-reached' | 'max-steps' | 'no-progress' | 'error';
}

export type { StepPlannerInput };

export interface StepPlannerResult {
  /** The single action to execute next, or null when goalReached is true. */
  readonly action: Action | null;
  /** True when the LLM determined the goal is complete. */
  readonly goalReached: boolean;
  /** LLM's description of the current page state. */
  readonly pageDescription: string;
}

const DEFAULT_MAX_STEPS = 10;

@Injectable()
export class ActionPlannerService {
  private readonly logger = new Logger(ActionPlannerService.name);

  constructor(@Inject(LLM_SERVICE) private readonly llmService: LlmService) {}

  async planActions(input: ActionPlannerInput): Promise<ActionPlannerResult> {
    const maxSteps = input.maxSteps ?? DEFAULT_MAX_STEPS;
    const allActions: Action[] = [];
    let goalSummary = '';

    this.logger.log(`Action planning started — url=${input.currentUrl}, maxSteps=${maxSteps}`);

    for (let step = 0; step < maxSteps; step++) {
      this.logger.debug(
        `Planning step ${step + 1}/${maxSteps} (${allActions.length} action(s) accumulated so far)`
      );

      const priorDescriptions: string[] = [
        ...(input.previousActions ?? []),
        ...allActions.map((a) => describeAction(a)),
      ];

      const prompt = renderActionPlanningPrompt({
        instruction: input.instruction,
        currentUrl: input.currentUrl,
        domSnapshot: input.domSnapshot,
        previousActions: priorDescriptions,
      });

      let output: ActionPlanningOutput;
      try {
        output = await this.llmService.completeJson<ActionPlanningOutput>(
          prompt,
          ACTION_PLANNING_OUTPUT_SCHEMA
        );
      } catch (err) {
        if (err instanceof LlmError && err.code === 'SCHEMA_VALIDATION') {
          this.logger.warn(
            `Action planning schema validation failed at step ${step + 1} — retrying once`
          );
          try {
            output = await this.llmService.completeJson<ActionPlanningOutput>(
              prompt,
              ACTION_PLANNING_OUTPUT_SCHEMA
            );
          } catch (retryErr) {
            this.logger.error(
              `Action planning retry failed at step ${step + 1}: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`
            );
            return {
              actions: allActions,
              goalSummary,
              stepsUsed: step,
              stopReason: 'error',
            };
          }
        } else {
          this.logger.error(
            `Action planning LLM error at step ${step + 1}: ${err instanceof Error ? err.message : String(err)}`
          );
          return {
            actions: allActions,
            goalSummary,
            stepsUsed: step,
            stopReason: 'error',
          };
        }
      }

      if (goalSummary === '') {
        goalSummary = output.goalSummary;
        this.logger.log(`Goal summary: ${goalSummary}`);
      }

      if (output.actions.length === 0) {
        const stopReason = allActions.length === 0 ? 'no-progress' : 'goal-reached';
        this.logger.log(
          `Action planning stopped at step ${step + 1}: stopReason=${stopReason}, totalActions=${allActions.length}`
        );
        return {
          actions: allActions,
          goalSummary,
          stepsUsed: step,
          stopReason,
        };
      }

      const mapped = output.actions.map((planned) => mapPlannedAction(planned));
      allActions.push(...mapped);
      this.logger.debug(
        `Step ${step + 1}: added ${mapped.length} action(s) — types=[${mapped.map((a) => a.type).join(', ')}]`
      );
    }

    this.logger.log(
      `Action planning hit maxSteps=${maxSteps}: totalActions=${allActions.length}, stopReason=max-steps`
    );
    return {
      actions: allActions,
      goalSummary,
      stepsUsed: maxSteps,
      stopReason: 'max-steps',
    };
  }

  /**
   * Plan the single next action to take based on the current page state.
   *
   * Uses vision (screenshot) when available and the active {@link LlmService}
   * supports {@link LlmService.completeWithVision}; falls back to DOM-only
   * planning otherwise.
   */
  async planNextStep(input: StepPlannerInput): Promise<StepPlannerResult> {
    this.logger.log(`Step planning — url=${input.currentUrl}, vision=${!!input.screenshotBase64}`);

    const prompt = renderStepPlannerPrompt(input);

    let output: StepPlannerOutput;
    try {
      if (
        input.screenshotBase64 &&
        typeof (this.llmService as { completeWithVision?: unknown }).completeWithVision ===
          'function'
      ) {
        output = await (
          this.llmService as Required<Pick<LlmService, 'completeWithVision'>>
        ).completeWithVision<StepPlannerOutput>(
          prompt,
          STEP_PLANNER_OUTPUT_SCHEMA,
          input.screenshotBase64
        );
      } else {
        output = await this.llmService.completeJson<StepPlannerOutput>(
          prompt,
          STEP_PLANNER_OUTPUT_SCHEMA
        );
      }
    } catch (err) {
      if (err instanceof LlmError && err.code === 'SCHEMA_VALIDATION') {
        this.logger.warn('Step planning schema validation failed — retrying once');
        try {
          output = await this.llmService.completeJson<StepPlannerOutput>(
            prompt,
            STEP_PLANNER_OUTPUT_SCHEMA
          );
        } catch (retryErr) {
          this.logger.error(
            `Step planning retry failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`
          );
          throw retryErr;
        }
      } else {
        throw err;
      }
    }

    const { pageDescription, nextAction, goalReached } = output;
    this.logger.log(
      `Step plan — goalReached=${goalReached}, nextAction=${nextAction?.action ?? 'none'}`
    );

    return {
      action: nextAction ? mapPlannedAction(nextAction) : null,
      goalReached,
      pageDescription,
    };
  }
}

function mapPlannedAction(planned: PlannedAction): Action {
  switch (planned.action) {
    case 'navigate': {
      const nav: NavigateAction = { type: 'navigate', url: planned.selector };
      return nav;
    }
    case 'click': {
      const click: ClickAction = { type: 'click', selector: planned.selector };
      return click;
    }
    case 'fill':
    case 'type': {
      const fill: FillAction = {
        type: 'fill',
        selector: planned.selector,
        value: planned.value ?? '',
      };
      return fill;
    }
    case 'select': {
      const select: SelectAction = {
        type: 'select',
        selector: planned.selector,
        option: planned.value ?? '',
      };
      return select;
    }
    default: {
      const fallback: ClickAction = { type: 'click', selector: planned.selector };
      return fallback;
    }
  }
}

function describeAction(action: Action): string {
  switch (action.type) {
    case 'navigate':
      return `navigate to ${action.url}`;
    case 'click':
      return `click ${action.selector}`;
    case 'fill':
      return `fill ${action.selector} with value`;
    case 'select':
      return `select ${action.option} in ${action.selector}`;
    case 'assert':
      return `assert ${action.kind}${action.selector ? ` on ${action.selector}` : ''}`;
    case 'waitFor':
      return `waitFor ${action.kind}`;
  }
  // Unreachable — exhaustive switch over Action discriminated union.
  return '';
}
