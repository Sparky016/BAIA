#!/usr/bin/env node
/**
 * Reads coverage-summary.json from each workspace and prints an aggregated
 * coverage report. Exits non-zero if any aggregate metric falls below the
 * §A7 thresholds (≥85% lines / ≥80% branches / ≥80% functions / ≥85% statements).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SOURCES = [
  { name: 'baia-server', path: resolve(ROOT, 'baia-server/coverage/coverage-summary.json') },
  { name: 'baia-ui',     path: resolve(ROOT, 'baia-ui/coverage/baia-ui/coverage-summary.json') },
];

const THRESHOLDS = { lines: 85, branches: 80, functions: 80, statements: 85 };

const totals = { lines: { total: 0, covered: 0 }, branches: { total: 0, covered: 0 }, functions: { total: 0, covered: 0 }, statements: { total: 0, covered: 0 } };
const missing = [];

for (const source of SOURCES) {
  if (!existsSync(source.path)) {
    console.warn(`[coverage:aggregate] WARNING: ${source.name} summary not found at ${source.path} — skipping.`);
    continue;
  }
  const data = JSON.parse(readFileSync(source.path, 'utf8'));
  const summary = data.total ?? data;
  for (const metric of Object.keys(totals)) {
    const m = summary[metric];
    if (m) {
      totals[metric].total   += m.total   ?? 0;
      totals[metric].covered += m.covered ?? 0;
    }
  }
}

console.log('\n╔══════════════════════════════════════════════════════╗');
console.log('║          BAIA — Aggregate Coverage Report            ║');
console.log('╠══════════════════════════════════════════════════════╣');

let exitCode = 0;
for (const [metric, counts] of Object.entries(totals)) {
  const pct = counts.total === 0 ? 100 : (counts.covered / counts.total) * 100;
  const threshold = THRESHOLDS[metric];
  const status = pct >= threshold ? '✅' : '❌';
  if (pct < threshold) {
    missing.push(`${metric}: ${pct.toFixed(1)}% < ${threshold}%`);
    exitCode = 1;
  }
  console.log(`║  ${status} ${metric.padEnd(12)} ${pct.toFixed(1).padStart(6)}%  (${counts.covered}/${counts.total})  threshold: ${threshold}%`);
}

console.log('╚══════════════════════════════════════════════════════╝\n');

if (exitCode !== 0) {
  console.error('Coverage gate FAILED — thresholds not met:');
  for (const msg of missing) console.error('  •', msg);
  process.exit(1);
}

console.log('Coverage gate PASSED — all thresholds met.\n');
