import 'reflect-metadata';

// Set E2E mode before any module is imported so that PipelineModule and
// StartController can read process.env['E2E'] at module-evaluation time.
process.env['E2E'] = 'true';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });

  app.enableCors({ origin: '*' });
  app.setGlobalPrefix('api');

  app.enableShutdownHooks();

  const port = parseInt(process.env['PORT'] ?? '3001', 10);
  await app.listen(port);
  // Signal to the parent process / webServer wait logic that the server is up.
  process.stdout.write(`E2E server listening on http://localhost:${port}\n`);
}

bootstrap().catch((err: unknown) => {
  console.error('E2E server failed to start:', err);
  process.exit(1);
});
