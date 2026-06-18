import { REPO_CONNECTOR, RepoConnector, TreeEntry } from './repo-connector';
import { LLM_SERVICE } from '../llm/llm.constants';
import { LlmService } from '../llm/llm.service';
import { MockLlmService } from '../llm/mock-llm.service';
import { IngestionService } from './ingestion.service';

// ── Fixture tree ────────────────────────────────────────────────────────────

const MYCMS_TREE: TreeEntry[] = [
  { path: 'Controllers/HomeController.cs', type: 'file', size: 1024 },
  { path: 'Controllers/AdminController.cs', type: 'file', size: 2048 },
  { path: 'Models/ContentPage.cs', type: 'file', size: 512 },
  { path: 'Views/Home/Index.cshtml', type: 'file', size: 800 },
  { path: 'bin/Debug/net8.0/MyCMS.dll', type: 'file', size: 102400 },
  { path: 'obj/Debug/net8.0/MyCMS.pdb', type: 'file', size: 51200 },
  { path: 'wwwroot/images/logo.png', type: 'file', size: 4096 },
  { path: 'wwwroot/css/site.min.js', type: 'file', size: 999 },
  { path: 'README.md', type: 'file', size: 300 },
  { path: 'Startup.cs', type: 'file', size: 600 },
];

const FILE_CONTENTS: Record<string, string> = {
  'Controllers/HomeController.cs': 'public class HomeController : Controller {\n  public IActionResult Index() { return View(); }\n}',
  'Controllers/AdminController.cs': 'public class AdminController : Controller {\n  public IActionResult Dashboard() { return View(); }\n}',
  'Models/ContentPage.cs': 'public class ContentPage {\n  public int Id { get; set; }\n  public string Title { get; set; }\n}',
  'Views/Home/Index.cshtml': '@{ ViewData["Title"] = "Home"; }\n<h1>Welcome</h1>',
  'Startup.cs': 'public class Startup {\n  public void Configure(IApplicationBuilder app) { }\n}',
  'README.md': '# MyCMS\nA simple CMS built on ASP.NET Core.',
};

// ── Mock RepoConnector ──────────────────────────────────────────────────────

function makeMockConnector(
  treeOverride?: TreeEntry[],
  contentOverride?: Record<string, string>
): jest.Mocked<RepoConnector> {
  const tree = treeOverride ?? MYCMS_TREE;
  const contents = contentOverride ?? FILE_CONTENTS;

  return {
    auth: jest.fn().mockResolvedValue(undefined),
    listTree: jest.fn().mockResolvedValue(tree),
    readFile: jest.fn().mockImplementation((path: string) => {
      const content = contents[path];
      if (content === undefined) {
        return Promise.resolve('');
      }
      return Promise.resolve(content);
    }),
    clone: jest.fn().mockResolvedValue({ files: new Map() }),
  };
}

function makeService(
  connector: RepoConnector,
  llm: LlmService = new MockLlmService()
): IngestionService {
  return new IngestionService(connector, llm);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('IngestionService', () => {
  describe('include rules', () => {
    it('includes Controllers/ files', async () => {
      const connector = makeMockConnector();
      const service = makeService(connector);

      const result = await service.ingestRepo();

      const paths = result.files.map((f) => f.path);
      expect(paths).toContain('Controllers/HomeController.cs');
      expect(paths).toContain('Controllers/AdminController.cs');
    });

    it('includes Models/ files', async () => {
      const connector = makeMockConnector();
      const service = makeService(connector);

      const result = await service.ingestRepo();

      const paths = result.files.map((f) => f.path);
      expect(paths).toContain('Models/ContentPage.cs');
    });

    it('includes Views/ files', async () => {
      const connector = makeMockConnector();
      const service = makeService(connector);

      const result = await service.ingestRepo();

      const paths = result.files.map((f) => f.path);
      expect(paths).toContain('Views/Home/Index.cshtml');
    });

    it('includes .cs extension files not in excluded paths', async () => {
      const connector = makeMockConnector();
      const service = makeService(connector);

      const result = await service.ingestRepo();

      const paths = result.files.map((f) => f.path);
      expect(paths).toContain('Startup.cs');
    });
  });

  describe('exclude rules', () => {
    it('excludes bin/ files', async () => {
      const connector = makeMockConnector();
      const service = makeService(connector);

      const result = await service.ingestRepo();

      const paths = result.files.map((f) => f.path);
      expect(paths).not.toContain('bin/Debug/net8.0/MyCMS.dll');
      expect(result.skippedFiles).toContain('bin/Debug/net8.0/MyCMS.dll');
    });

    it('excludes obj/ files', async () => {
      const connector = makeMockConnector();
      const service = makeService(connector);

      const result = await service.ingestRepo();

      const paths = result.files.map((f) => f.path);
      expect(paths).not.toContain('obj/Debug/net8.0/MyCMS.pdb');
      expect(result.skippedFiles).toContain('obj/Debug/net8.0/MyCMS.pdb');
    });

    it('excludes .dll binary extension', async () => {
      const connector = makeMockConnector();
      const service = makeService(connector);

      const result = await service.ingestRepo();

      expect(result.skippedFiles).toContain('bin/Debug/net8.0/MyCMS.dll');
    });

    it('excludes .png binary extension', async () => {
      const connector = makeMockConnector();
      const service = makeService(connector);

      const result = await service.ingestRepo();

      const paths = result.files.map((f) => f.path);
      expect(paths).not.toContain('wwwroot/images/logo.png');
      expect(result.skippedFiles).toContain('wwwroot/images/logo.png');
    });

    it('excludes .min.js files', async () => {
      const connector = makeMockConnector();
      const service = makeService(connector);

      const result = await service.ingestRepo();

      const paths = result.files.map((f) => f.path);
      expect(paths).not.toContain('wwwroot/css/site.min.js');
      expect(result.skippedFiles).toContain('wwwroot/css/site.min.js');
    });

    it('skips files over 500KB (reported via size in tree entry)', async () => {
      const largeFileTree: TreeEntry[] = [
        { path: 'Controllers/HugeController.cs', type: 'file', size: 600 * 1024 },
        { path: 'Models/Small.cs', type: 'file', size: 100 },
      ];
      const contents = { 'Models/Small.cs': 'public class Small {}' };
      const connector = makeMockConnector(largeFileTree, contents);
      const service = makeService(connector);

      const result = await service.ingestRepo();

      const paths = result.files.map((f) => f.path);
      expect(paths).not.toContain('Controllers/HugeController.cs');
      expect(result.skippedFiles).toContain('Controllers/HugeController.cs');
      expect(paths).toContain('Models/Small.cs');
    });
  });

  describe('skippedFiles', () => {
    it('contains all excluded paths from the MyCMS fixture', async () => {
      const connector = makeMockConnector();
      const service = makeService(connector);

      const result = await service.ingestRepo();

      expect(result.skippedFiles).toContain('bin/Debug/net8.0/MyCMS.dll');
      expect(result.skippedFiles).toContain('obj/Debug/net8.0/MyCMS.pdb');
      expect(result.skippedFiles).toContain('wwwroot/images/logo.png');
      expect(result.skippedFiles).toContain('wwwroot/css/site.min.js');
    });
  });

  describe('chunking', () => {
    it('produces chunks with tokenCount <= maxTokensPerChunk', async () => {
      const connector = makeMockConnector();
      const llm = new MockLlmService();
      const service = makeService(connector, llm);
      const maxTokensPerChunk = 50;

      const result = await service.ingestRepo({ maxTokensPerChunk });

      for (const fileChunks of result.files) {
        for (const c of fileChunks.chunks) {
          expect(c.tokenCount).toBeLessThanOrEqual(maxTokensPerChunk);
        }
      }
    });

    it('totalChunks equals the sum of all per-file chunk counts', async () => {
      const connector = makeMockConnector();
      const service = makeService(connector);

      const result = await service.ingestRepo({ maxTokensPerChunk: 100 });

      const sum = result.files.reduce((acc, f) => acc + f.chunks.length, 0);
      expect(result.totalChunks).toBe(sum);
    });

    it('produces deterministic output for the same input', async () => {
      const connector1 = makeMockConnector();
      const connector2 = makeMockConnector();
      const llm = new MockLlmService();
      const opts = { maxTokensPerChunk: 200, overlapTokens: 20 };

      const result1 = await makeService(connector1, llm).ingestRepo(opts);
      const result2 = await makeService(connector2, llm).ingestRepo(opts);

      expect(result1.totalChunks).toBe(result2.totalChunks);
      expect(result1.files.map((f) => f.path)).toEqual(result2.files.map((f) => f.path));
    });

    it('each chunk has a non-empty text field', async () => {
      const connector = makeMockConnector();
      const service = makeService(connector);

      const result = await service.ingestRepo({ maxTokensPerChunk: 50 });

      for (const fileChunks of result.files) {
        for (const c of fileChunks.chunks) {
          expect(c.text.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('injection token constants', () => {
    it('REPO_CONNECTOR is a Symbol', () => {
      expect(typeof REPO_CONNECTOR).toBe('symbol');
    });

    it('LLM_SERVICE is a Symbol', () => {
      expect(typeof LLM_SERVICE).toBe('symbol');
    });
  });
});
