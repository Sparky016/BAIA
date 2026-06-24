import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ConfigService } from './config/config.service';
import { ExportModule } from './export/export.module';
import { HealthController } from './health/health.controller';
import { PipelineModule } from './pipeline/pipeline.module';
import { RunsModule } from './runs/runs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    RunsModule,
    PipelineModule,
    ExportModule,
  ],
  controllers: [HealthController],
  providers: [ConfigService],
})
export class AppModule {}
