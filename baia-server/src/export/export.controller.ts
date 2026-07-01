import { GherkinDoc, RunStatus, UnifiedDoc } from '@baia/shared';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { toUserMessage } from '../common/user-facing-error';
import { RunsService } from '../runs/runs.service';

import { ConfluenceAdapter, ConfluenceConfig } from './confluence.adapter';
import { gherkinDocToText, gherkinDocToOkfZip, toSafeFilename } from './okf-generator';

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
    private readonly confluenceAdapter: ConfluenceAdapter
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
  async exportRun(@Param('id') id: string, @Body() body: ExportRunBody): Promise<ExportRunResult> {
    const run = this.runsService.getRun(id);

    if (run.status !== RunStatus.Review) {
      throw new ConflictException(
        `Export is only allowed when run is in '${RunStatus.Review}' state; ` +
          `current state is '${run.status}'.`
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

    try {
      const result = await this.confluenceAdapter.publishPage(config, gherkinDoc);
      this.logger.log(`Exported run ${id} to Confluence page ${result.pageUrl}`);

      this.runsService.transitionRun(id, RunStatus.Done);

      return { url: result.pageUrl };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Run ${id}: Export failed — ${message}`, err instanceof Error ? err.stack : err);
      throw new BadRequestException(toUserMessage(err, 'Export'));
    }
  }

  /**
   * Download run documentation as a raw Gherkin .feature file.
   */
  @Get(':id/export/gherkin')
  @ApiOperation({ summary: 'Download run documentation as a raw Gherkin .feature file' })
  @ApiParam({ name: 'id', description: 'The run identifier', example: 'run-0001' })
  async downloadGherkin(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const run = this.runsService.getRun(id);

    const gherkinDoc = run.unifiedDoc
      ? unifiedDocToGherkinDoc(run.unifiedDoc)
      : (run.gherkinDoc ?? null);

    if (!gherkinDoc) {
      throw new BadRequestException('Run has no document to export.');
    }

    const text = gherkinDocToText(gherkinDoc);
    const filename = `${toSafeFilename(gherkinDoc.features[0]?.name || 'run')}.feature`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(text);
  }

  /**
   * Download run documentation as an OKF .zip bundle.
   */
  @Get(':id/export/okf')
  @ApiOperation({ summary: 'Download run documentation as an OKF .zip bundle' })
  @ApiParam({ name: 'id', description: 'The run identifier', example: 'run-0001' })
  async downloadOkf(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const run = this.runsService.getRun(id);

    const gherkinDoc = run.unifiedDoc
      ? unifiedDocToGherkinDoc(run.unifiedDoc)
      : (run.gherkinDoc ?? null);

    if (!gherkinDoc) {
      throw new BadRequestException('Run has no document to export.');
    }

    const zipBuffer = gherkinDocToOkfZip(gherkinDoc, run.targetUrl);
    const filename = `${toSafeFilename(gherkinDoc.features[0]?.name || 'run')}-okf.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(zipBuffer);
  }
}
