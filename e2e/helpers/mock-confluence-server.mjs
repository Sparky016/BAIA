/**
 * Mock Confluence REST API server for E2E tests.
 *
 * Handles the minimal Confluence Cloud REST API surface used by
 * ConfluenceAdapter: page search and page create/update.
 * Returns deterministic responses so the export step of the E2E pipeline
 * can assert a stable page URL without hitting a real Confluence instance.
 */
import http from 'node:http';

const PORT = 4002;
const BASE_URL = `http://localhost:${PORT}`;
const MOCK_PAGE_ID = 'mock-page-001';
const MOCK_PAGE_URL = `${BASE_URL}/wiki/spaces/TEST/pages/${MOCK_PAGE_ID}`;

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE_URL);
  const pathname = url.pathname;
  const method = req.method?.toUpperCase() ?? 'GET';

  // GET /wiki/rest/api/content?spaceKey=...&title=... (search for existing page)
  if (method === 'GET' && pathname === '/wiki/rest/api/content') {
    // Return no results — let ConfluenceAdapter create a new page.
    sendJson(res, 200, { results: [] });
    return;
  }

  // POST /wiki/rest/api/content (create page)
  if (method === 'POST' && pathname === '/wiki/rest/api/content') {
    await readBody(req); // consume body
    sendJson(res, 200, {
      id: MOCK_PAGE_ID,
      title: 'BAIA – Generated Documentation',
      version: { number: 1 },
      _links: {
        base: BASE_URL,
        webui: `/wiki/spaces/TEST/pages/${MOCK_PAGE_ID}`,
      },
    });
    return;
  }

  // PUT /wiki/rest/api/content/:id (update page)
  if (method === 'PUT' && pathname.startsWith('/wiki/rest/api/content/')) {
    await readBody(req);
    sendJson(res, 200, {
      id: MOCK_PAGE_ID,
      title: 'BAIA – Generated Documentation',
      version: { number: 2 },
      _links: {
        base: BASE_URL,
        webui: `/wiki/spaces/TEST/pages/${MOCK_PAGE_ID}`,
      },
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', path: pathname }));
});

server.listen(PORT, () => {
  process.stdout.write(`mock-confluence listening on http://localhost:${PORT}\n`);
});

export { MOCK_PAGE_URL };
