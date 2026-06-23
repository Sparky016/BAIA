import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { AZURE_API_CLIENT_FACTORY } from './code-analyst/azure-connector';
import { GITHUB_API_CLIENT_FACTORY } from './code-analyst/github-connector';
import { ConfluenceAdapter } from './export/confluence.adapter';
import { ExportController } from './export/export.controller';
import { StartController } from './pipeline/start.controller';
import { RunsService } from './runs/runs.service';
import { CredentialStoreService } from './security/credential-store.service';

/**
 * Integration test for the production module graph.
 *
 * Regression guard for the §2.1 defect: ExportModule was only registered in the
 * E2E module, so in production all /runs/:id/export routes returned 404 and the
 * run lifecycle could never reach `exporting`/`done`. These tests boot the real
 * AppModule and assert the export feature is both routable and correctly shares
 * the singleton RunsService / CredentialStoreService with the pipeline.
 */
describe('AppModule (production graph)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Override the repo API-client factories so the ESM-only @octokit/rest and
    // Azure SDK are never imported under ts-jest (CommonJS). This isolates the
    // wiring-under-test from the network SDKs without altering the module graph.
    const noopFactory = (): unknown => () => ({});
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GITHUB_API_CLIENT_FACTORY)
      .useValue(noopFactory())
      .overrideProvider(AZURE_API_CLIENT_FACTORY)
      .useValue(noopFactory())
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function buildDocument(): OpenAPIObject {
    const config = new DocumentBuilder().setTitle('BAIA API').setVersion('1.0').build();
    return SwaggerModule.createDocument(app, config);
  }

  it('registers the ExportController in the production graph', () => {
    expect(app.get(ExportController)).toBeInstanceOf(ExportController);
  });

  it('exposes POST /runs/{id}/export', () => {
    const document = buildDocument();
    expect(document.paths['/runs/{id}/export']?.['post']).toBeDefined();
  });

  it('exposes the Gherkin and OKF download routes', () => {
    const document = buildDocument();
    expect(document.paths['/runs/{id}/export/gherkin']?.['get']).toBeDefined();
    expect(document.paths['/runs/{id}/export/okf']?.['get']).toBeDefined();
  });

  it('shares a single RunsService between the pipeline and the export feature', () => {
    const runsService = app.get(RunsService);
    const exportController = app.get(ExportController) as unknown as { runsService: RunsService };
    const startController = app.get(StartController) as unknown as { runsService: RunsService };

    // All three must be the identical instance, otherwise the export cannot see
    // the run the pipeline advanced to `review`.
    expect(exportController.runsService).toBe(runsService);
    expect(startController.runsService).toBe(runsService);
  });

  it('shares a single CredentialStoreService between the pipeline and the export feature', () => {
    const credentialStore = app.get(CredentialStoreService);
    const startController = app.get(StartController) as unknown as {
      credentialStore: CredentialStoreService;
    };
    const confluenceAdapter = app.get(ConfluenceAdapter) as unknown as {
      credentialStore: CredentialStoreService;
    };

    // A duplicate store would mean export can't read credentials the pipeline seeded.
    expect(startController.credentialStore).toBe(credentialStore);
    expect(confluenceAdapter.credentialStore).toBe(credentialStore);
  });
});
