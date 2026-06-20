import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

const logger = new Logger('Bootstrap');

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');

  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:4200';
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });
  logger.log(`CORS enabled for origin: ${corsOrigin}`);

  const config = new DocumentBuilder()
    .setTitle('BAIA API')
    .setDescription('Business AI Analyst API')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen(port);
  logger.log(`BAIA server listening on port ${port}`);
  logger.log(`Swagger docs available at http://localhost:${port}/api-docs`);
}

bootstrap();
