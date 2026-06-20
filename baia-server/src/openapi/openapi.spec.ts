import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

import { RunsController } from '../runs/runs.controller';
import { RunsService } from '../runs/runs.service';
import { RunsSseController } from '../runs/runs.sse.controller';
import { RunsEventsService } from '../runs/runs.events';

function buildDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('BAIA API')
    .setDescription('Business AI Analyst API')
    .setVersion('1.0')
    .build();
  return SwaggerModule.createDocument(app, config);
}

describe('OpenAPI contract', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RunsController, RunsSseController],
      providers: [
        { provide: RunsService, useValue: {} },
        { provide: RunsEventsService, useValue: {} },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    document = buildDocument(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('document has openapi version 3.x', () => {
    expect(document.openapi).toMatch(/^3\./);
  });

  it('POST /runs is present', () => {
    expect(document.paths['/runs']).toBeDefined();
    expect(document.paths['/runs']['post']).toBeDefined();
  });

  it('GET /runs is present', () => {
    expect(document.paths['/runs']).toBeDefined();
    expect(document.paths['/runs']['get']).toBeDefined();
  });

  it('GET /runs/{id} is present', () => {
    expect(document.paths['/runs/{id}']).toBeDefined();
    expect(document.paths['/runs/{id}']['get']).toBeDefined();
  });

  it('GET /runs/{id}/events is present', () => {
    expect(document.paths['/runs/{id}/events']).toBeDefined();
    expect(document.paths['/runs/{id}/events']['get']).toBeDefined();
  });

  it('POST /runs response has 201 status', () => {
    const postRuns = document.paths['/runs']['post'] as { responses: Record<string, unknown> };
    expect(postRuns.responses['201']).toBeDefined();
  });

  it('GET /runs/{id} response has 404 status for not found', () => {
    const getRun = document.paths['/runs/{id}']['get'] as { responses: Record<string, unknown> };
    expect(getRun.responses['404']).toBeDefined();
  });

  it('GET /runs/{id}/events includes id path parameter', () => {
    const eventsEndpoint = document.paths['/runs/{id}/events']['get'] as {
      parameters: Array<{ name: string; in: string }>;
    };
    const idParam = eventsEndpoint.parameters?.find((p) => p.name === 'id' && p.in === 'path');
    expect(idParam).toBeDefined();
  });

  it('POST /runs request body schema includes required RunRequest fields', () => {
    const postRuns = document.paths['/runs']['post'] as {
      requestBody: {
        content: {
          'application/json': {
            schema: { required: string[]; properties: Record<string, unknown> };
          };
        };
      };
    };
    const schema = postRuns.requestBody?.content?.['application/json']?.schema;
    expect(schema).toBeDefined();
    expect(schema.required).toEqual(expect.arrayContaining(['targetUrl', 'instructions']));
    expect(schema.properties['targetUrl']).toBeDefined();
    expect(schema.properties['repoProvider']).toBeDefined();
  });

  it('POST /runs 201 response schema includes RunSummary fields', () => {
    const postRuns = document.paths['/runs']['post'] as {
      responses: Record<
        string,
        { content?: { 'application/json': { schema: { properties: Record<string, unknown> } } } }
      >;
    };
    const schema = postRuns.responses['201']?.content?.['application/json']?.schema;
    expect(schema).toBeDefined();
    expect(schema.properties['runId']).toBeDefined();
    expect(schema.properties['status']).toBeDefined();
    expect(schema.properties['targetUrl']).toBeDefined();
  });

  it('GET /runs/{id}/events has a 200 response defined', () => {
    const eventsEndpoint = document.paths['/runs/{id}/events']['get'] as {
      responses: Record<string, unknown>;
    };
    expect(eventsEndpoint.responses['200']).toBeDefined();
  });
});
