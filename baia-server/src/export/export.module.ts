import { Module } from '@nestjs/common';

import { RunsModule } from '../runs/runs.module';
import { SecurityModule } from '../security/security.module';

import { ConfluenceAdapter } from './confluence.adapter';
import { ExportController } from './export.controller';

@Module({
  imports: [RunsModule, SecurityModule],
  controllers: [ExportController],
  providers: [ConfluenceAdapter],
  exports: [ConfluenceAdapter],
})
export class ExportModule {}
