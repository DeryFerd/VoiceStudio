import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROUTE_WEIGHTS, routesForShard } from './crawler-shards.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const crawler = readFileSync(join(dir, 'ui-crawler.mjs'), 'utf8');
const ci = readFileSync(join(dir, '../../.github/workflows/ci.yml'), 'utf8');

const job = ci.match(/\n {2}ui-crawler:\n([\s\S]*?)\n {2}[\w-]+:\n/)[1];

test('CI crawls every fault mode, split only by route shard', () => {
  // The crawler runs the modes concurrently itself. A mode x shard matrix queued twelve jobs per
  // push behind the runner limit, so the only axis is the route shard, kept at three.
  assert.doesNotMatch(job, /matrix\.mode/, 'shard by route only, never by fault mode');
  assert.match(job, /shard: \[1, 2, 3\]/);
  assert.match(job, /VOICESTUDIO_CRAWL_SHARD: \$\{\{ matrix\.shard \}\}\/3/);
  // Narrowing the modes or routes in CI would silently skip the faults this job exists for.
  assert.doesNotMatch(job, /VOICESTUDIO_CRAWL_(MODES|ROUTES)/);
  assert.match(crawler, /const MODES = \['fixture', 'http-500', 'network-error', 'bad-json'\]/);
});

test('each shard leaves room for a full crawl', () => {
  const minutes = Number(job.match(/timeout-minutes: (\d+)/)[1]);
  assert.ok(minutes >= 30, `timeout-minutes ${minutes} is too short for every mode and route`);
});

test('crawler findings are fixed, not allowlisted', () => {
  assert.match(crawler, /export const KNOWN_FINDINGS = \{\};/);
});


test('the route shards cover every route exactly once and share the cost evenly', () => {
  const routes = [...Object.keys(ROUTE_WEIGHTS), ...Array.from({ length: 24 }, (_, i) => `/route-${i}`)];
  const owned = [1, 2, 3].map((shard) => routesForShard(routes, shard, 3));
  assert.deepEqual(owned.flat().sort(), [...routes].sort(), 'each route is crawled by exactly one shard');
  const cost = owned.map((set) => set.reduce((sum, route) => sum + (ROUTE_WEIGHTS[route] ?? 1), 0));
  assert.ok(Math.max(...cost) - Math.min(...cost) <= 14, `shard costs ${cost} are too uneven`);
  assert.ok(owned.every((set) => set.length), 'no shard is left empty');
});

test('a route without a weight still lands on a shard', () => {
  const owned = [1, 2, 3].map((shard) => routesForShard(['/new-route'], shard, 3));
  assert.equal(owned.flat().length, 1);
});
