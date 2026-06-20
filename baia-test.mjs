/**
 * Full Playwright UI test of the BAIA app.
 * Pipeline: Input → (manual /start trigger) → Progress → Review → Export
 *
 * The Angular UI proxies /api to the e2e server (port 3001) which has:
 *   - POST /api/runs          (create)
 *   - GET  /api/runs/:id      (get)
 *   - GET  /api/runs/:id/events (SSE)
 *   - POST /api/runs/:id/start (trigger pipeline)
 *   - POST /api/runs/:id/export
 */
import { chromium } from 'playwright';

const UI = 'http://localhost:4200';
const API = 'http://localhost:3000/api';
const MYCMS_URL = 'http://localhost:51234';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() !== 'debug') console.log(`[browser ${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', err => console.error(`[page error] ${err.message}`));

  // ── STEP 1: Load BAIA UI ──────────────────────────────────────────────────
  console.log('\n=== STEP 1: Navigate to BAIA UI ===');
  await page.goto(UI, { waitUntil: 'networkidle' });
  console.log('Page title:', await page.title());
  await page.screenshot({ path: 'screenshot-01-home.png' });

  // ── STEP 2: Fill Input Form ───────────────────────────────────────────────
  console.log('\n=== STEP 2: Fill Input Form ===');
  await page.waitForSelector('[data-testid="target-url"]');

  await page.fill('[data-testid="target-url"]', MYCMS_URL);
  await page.fill('[data-testid="instructions"]',
    'Navigate the MyCMS home page, explore all navigation links, click on articles and pages, and document the visible content and user interactions.');
  await page.fill('[data-testid="repo-url"]', 'https://github.com/Sparky016/BAIA');
  // repoProvider stays "github"
  await page.fill('[data-testid="credentials-ref"]', 'my-pat-secret');

  await page.screenshot({ path: 'screenshot-02-form-filled.png' });
  console.log('Form filled. Submit button disabled?', await page.locator('[data-testid="start-btn"]').isDisabled());

  // ── STEP 3: Submit → creates run (queued) ─────────────────────────────────
  console.log('\n=== STEP 3: Submit Form → Create Run ===');
  await page.locator('[data-testid="start-btn"]').click();

  await page.waitForURL(/\/progress\/run-/, { timeout: 15000 });
  const progressUrl = page.url();
  const runId = progressUrl.split('/progress/')[1];
  console.log('Navigated to progress page. Run ID:', runId);
  await page.screenshot({ path: 'screenshot-03-progress-queued.png' });
  console.log('Progress page text:', (await page.textContent('body'))?.slice(0, 200));

  // ── STEP 4: Trigger the pipeline via /start ───────────────────────────────
  console.log('\n=== STEP 4: Trigger Pipeline via POST /start ===');
  const startResponse = await fetch(`${API}/runs/${runId}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instructions: 'Navigate the MyCMS home page, explore all navigation links, and document the visible content.',
      repoUrl: 'https://github.com/Sparky016/BAIA',
      repoProvider: 'github',
      credentialsRef: 'my-pat-secret',
      confluenceCredentialsRef: 'e2e-confluence-creds',
    }),
  });
  const startBody = await startResponse.json();
  console.log(`POST /start → ${startResponse.status}:`, JSON.stringify(startBody));

  // ── STEP 5: Watch progress page transition ────────────────────────────────
  console.log('\n=== STEP 5: Monitor Progress Page ===');
  let onReviewPage = false;
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    await sleep(2000);
    const currentUrl = page.url();
    const bodyText = await page.textContent('body').catch(() => '');

    console.log(`[${new Date().toISOString().slice(11,19)}] URL: ${currentUrl}`);
    console.log(`  Status text: ${bodyText?.slice(0, 150)?.trim()}`);
    await page.screenshot({ path: `screenshot-progress-${Date.now()}.png` });

    if (currentUrl.includes('/review/')) {
      console.log('Auto-navigated to review page!');
      onReviewPage = true;
      break;
    }
    if (bodyText?.includes('failed')) {
      console.log('Pipeline FAILED on progress page');
      break;
    }
  }

  // ── STEP 6: Review page ───────────────────────────────────────────────────
  if (!onReviewPage) {
    console.log('\nNot on review page — navigating manually');
    await page.goto(`${UI}/review/${runId}`, { waitUntil: 'networkidle' });
  }

  console.log('\n=== STEP 6: Review Page ===');
  await page.screenshot({ path: 'screenshot-06-review.png' });
  const reviewText = await page.textContent('body');
  console.log('Review page text:', reviewText?.slice(0, 400)?.trim());

  // Check run status via API
  const runRes = await fetch(`${API}/runs/${runId}`);
  const runData = await runRes.json();
  console.log('Run status from API:', runData.status);
  console.log('Has gherkinDoc:', !!runData.gherkinDoc);
  console.log('Has unifiedDoc:', !!runData.unifiedDoc);

  // Approve first — inputs are disabled until approved
  const approveBtn = page.locator('button:has-text("Approve")');
  if (await approveBtn.count() > 0 && !(await approveBtn.isDisabled())) {
    await approveBtn.click();
    console.log('Approved the document');
    await sleep(1000);
    await page.screenshot({ path: 'screenshot-07-approved.png' });
  } else {
    console.log('Approve button not clickable — count:', await approveBtn.count());
  }

  // ── STEP 7: Fill Export Form (inputs enabled after approve) ──────────────
  console.log('\n=== STEP 7: Fill Export Form ===');
  // Wait for baseUrl input to become enabled
  await page.waitForSelector('#baseUrl:not([disabled])', { timeout: 5000 }).catch(() =>
    console.log('baseUrl input did not become enabled within 5s')
  );
  await page.screenshot({ path: 'screenshot-08-pre-export.png' });

  // Use Angular-friendly fill: fill + dispatch 'input' event
  await page.locator('#baseUrl').fill('http://localhost:4002');
  await page.locator('#baseUrl').dispatchEvent('input');
  console.log('Filled Confluence Base URL');

  await page.locator('#spaceKey').fill('TEST');
  await page.locator('#spaceKey').dispatchEvent('input');
  console.log('Filled Space Key');

  await page.locator('#credentialsRef').fill('e2e-confluence-creds');
  await page.locator('#credentialsRef').dispatchEvent('input');
  console.log('Filled Credentials Ref');

  await sleep(500);
  await page.screenshot({ path: 'screenshot-09-export-form-filled.png' });

  const exportBtn = page.locator('[data-testid="confluence-export-btn"]');
  const exportBtnCount = await exportBtn.count();
  console.log('Export buttons found:', exportBtnCount);
  if (exportBtnCount > 0) {
    const disabled = await exportBtn.first().isDisabled();
    console.log('Export btn disabled:', disabled);
    if (!disabled) {
      await exportBtn.first().click();
      console.log('Clicked Export');
      await sleep(5000);
      await page.screenshot({ path: 'screenshot-10-exported.png' });
      console.log('Post-export text:', (await page.textContent('body'))?.slice(0, 300)?.trim());
    } else {
      // Debug: check store state via page evaluation
      const storeDebug = await page.evaluate(() => {
        // Try to get Angular store state from the window for debugging
        return {
          approved: document.querySelector('[data-testid="confluence-export-btn"]')?.hasAttribute('disabled'),
          inputs: Array.from(document.querySelectorAll('input')).map(i => ({ id: i.id, value: i.value, disabled: i.disabled })),
        };
      });
      console.log('Debug state:', JSON.stringify(storeDebug));
    }
  }

  // ── Final state check ─────────────────────────────────────────────────────
  console.log('\n=== FINAL STATE ===');
  const finalRes = await fetch(`${API}/runs/${runId}`);
  const finalRun = await finalRes.json();
  console.log('Final run status:', finalRun.status);
  console.log('Final URL:', page.url());
  await page.screenshot({ path: 'screenshot-11-final.png' });

  await sleep(3000);
  await browser.close();

  console.log('\n=== TEST SUMMARY ===');
  console.log('Run ID:', runId);
  console.log('Final status:', finalRun.status);
  const success = ['review', 'done'].includes(finalRun.status);
  console.log('Pipeline worked:', success ? 'YES ✓' : 'NO ✗');
  process.exit(success ? 0 : 1);
}

main().catch(err => {
  console.error('\nTest script error:', err.message);
  process.exit(1);
});
