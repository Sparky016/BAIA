import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { E2eAppModule } from './e2e/e2e-app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(E2eAppModule, { logger: ['error', 'warn', 'log'] });

  app.enableCors({ origin: '*' });
  app.setGlobalPrefix('api');

  const port = parseInt(process.env['PORT'] ?? '3001', 10);
  await app.listen(port);
  // Signal to the parent process / webServer wait logic that the server is up.
  process.stdout.write(`E2E server listening on http://localhost:${port}\n`);
}

bootstrap().catch((err: unknown) => {
  console.error('E2E server failed to start:', err);
  process.exit(1);
});
