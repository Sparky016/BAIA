import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GherkinDoc, RunStatus, UnifiedDoc } from '@baia/shared';

import { RunsService } from '../runs/runs.service';
import { ConfluenceAdapter, ConfluenceConfig } from './confluence.adapter';

export interface ExportRunBody {
  baseUrl: string;
  spaceKey: string;
  credentialsRef: string;
  parentPageId?: string;
}

export interface ExportRunResult {
  url: string;
}

function unifiedDocToGherkinDoc(doc: UnifiedDoc): GherkinDoc {
  return {
    generatedAt: doc.generatedAt,
    features: doc.features.map((f) => ({
      name: f.name,
      description: f.description,
      scenarios: f.scenarios.map((s) => ({
        name: s.name,
        steps: s.steps.map((step) => ({
          keyword: step.keyword,
          text: step.text,
          provenance: step.provenance,
        })),
        conflictNote: s.conflicts?.length
          ? s.conflicts.map((c) => c.description).join('; ')
          : undefined,
      })),
    })),
  };
}

/**
 * Export endpoint for a completed run.
 *
 * POST /runs/:id/export transitions the run review → exporting → done
 * and pushes the reconciled document to a Confluence space.
 */
@ApiTags('export')
@Controller('runs')
export class ExportController {
  private readonly logger = new Logger(ExportController.name);

  constructor(
    private readonly runsService: RunsService,
    private readonly confluenceAdapter: ConfluenceAdapter,
  ) {}

  /**
   * Export a run's unified (or Gherkin) document to Confluence.
   *
   * The run must be in `review` state. Transitions: review → exporting → done.
   * Returns the URL of the created/updated Confluence page.
   */
  @Post(':id/export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Export run documentation to Confluence' })
  @ApiParam({ name: 'id', description: 'The run identifier', example: 'run-0001' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['baseUrl', 'spaceKey', 'credentialsRef'],
      properties: {
        baseUrl: { type: 'string', example: 'https://mycompany.atlassian.net' },
        spaceKey: { type: 'string', example: 'ENG' },
        credentialsRef: { type: 'string', example: 'confluence-creds' },
        parentPageId: { type: 'string', example: '123456' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Export succeeded; returns the Confluence page URL.',
    schema: { type: 'object', properties: { url: { type: 'string' } } },
  })
  @ApiResponse({ status: 400, description: 'Run has no document to export.' })
  @ApiResponse({ status: 404, description: 'Run not found.' })
  @ApiResponse({ status: 409, description: 'Run is not in review state.' })
  async exportRun(
    @Param('id') id: string,
    @Body() body: ExportRunBody,
  ): Promise<ExportRunResult> {
    const run = this.runsService.getRun(id);

    if (run.status !== RunStatus.Review) {
      throw new ConflictException(
        `Export is only allowed when run is in '${RunStatus.Review}' state; ` +
          `current state is '${run.status}'.`,
      );
    }

    const gherkinDoc = run.unifiedDoc
      ? unifiedDocToGherkinDoc(run.unifiedDoc)
      : (run.gherkinDoc ?? null);

    if (!gherkinDoc) {
      throw new BadRequestException('Run has no document to export.');
    }

    const config: ConfluenceConfig = {
      baseUrl: body.baseUrl,
      spaceKey: body.spaceKey,
      credentialsRef: body.credentialsRef,
      parentPageId: body.parentPageId,
    };

    this.runsService.transitionRun(id, RunStatus.Exporting);

    const result = await this.confluenceAdapter.publishPage(config, gherkinDoc);
    this.logger.log(`Exported run ${id} to Confluence page ${result.pageUrl}`);

    this.runsService.transitionRun(id, RunStatus.Done);

    return { url: result.pageUrl };
  }
}
