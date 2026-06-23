import { Module } from '@nestjs/common';

import { RunsModule } from '../runs/runs.module';
import { SecurityModule } from '../security/security.module';

import { ConfluenceAdapter } from './confluence.adapter';
import { ExportController } from './export.controller';

/**
 * Export feature module. Serves the Confluence-publish and Gherkin/OKF download
 * endpoints under /runs/:id/export.
 *
 * Imports RunsModule and SecurityModule so it shares the single RunsService and
 * CredentialStoreService instances rather than re-providing them — the export
 * must see the same run state the pipeline advanced to `review` and the same
 * credential store the pipeline seeded.
 */
@Module({
  imports: [RunsModule, SecurityModule],
  controllers: [ExportController],
  providers: [ConfluenceAdapter],
  exports: [ConfluenceAdapter],
})
export class ExportModule {}
