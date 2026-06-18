import { Action, ClickAction, FillAction, NavigateAction, SelectAction } from '@baia/shared';
import { Inject, Injectable } from '@nestjs/common';

import { LLM_SERVICE } from '../llm/llm.constants';
import { LlmError, LlmService } from '../llm/llm.service';
import {
  ACTION_PLANNING_OUTPUT_SCHEMA,
  ActionPlanningOutput,
  PlannedAction,
  renderActionPlanningPrompt,
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

const DEFAULT_MAX_STEPS = 10;

@Injectable()
export class ActionPlannerService {
  constructor(@Inject(LLM_SERVICE) private readonly llmService: LlmService) {}

  async planActions(input: ActionPlannerInput): Promise<ActionPlannerResult> {
    const maxSteps = input.maxSteps ?? DEFAULT_MAX_STEPS;
    const allActions: Action[] = [];
    let goalSummary = '';

    for (let step = 0; step < maxSteps; step++) {
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
          try {
            output = await this.llmService.completeJson<ActionPlanningOutput>(
              prompt,
              ACTION_PLANNING_OUTPUT_SCHEMA
            );
          } catch {
            return {
              actions: allActions,
              goalSummary,
              stepsUsed: step,
              stopReason: 'error',
            };
          }
        } else {
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
      }

      if (output.actions.length === 0) {
        return {
          actions: allActions,
          goalSummary,
          stepsUsed: step,
          stopReason: allActions.length === 0 ? 'no-progress' : 'goal-reached',
        };
      }

      const mapped = output.actions.map((planned) => mapPlannedAction(planned));
      allActions.push(...mapped);
    }

    return {
      actions: allActions,
      goalSummary,
      stepsUsed: maxSteps,
      stopReason: 'max-steps',
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
