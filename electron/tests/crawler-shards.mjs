/**
 * Splits the crawler's routes across CI shards by cost, not by position.
 *
 * Crawl time is dominated by a few routes: measured locally in fixture mode, /pro took 28s,
 * /settings/account and /settings/appearance about 20s each and /settings/performance 15s, while
 * most routes take under 6s. Dealing every n-th route in sorted order left one shard at 11
 * minutes and another at 5. Heaviest routes go first, each to the currently lightest shard
 * (ties to the lowest number), so every shard computes the same split without coordinating.
 *
 * A route missing from ROUTE_WEIGHTS counts as 1, so a new route is still crawled by exactly one
 * shard; add it here when a crawl shows it is slow.
 */
export const ROUTE_WEIGHTS = {
  '/pro': 14,
  '/settings/account': 10,
  '/settings/appearance': 10,
  '/settings/performance': 7,
  '/settings/storage': 5,
  '/settings/credentials': 3,
  '/settings/sharing': 3,
  '/settings/pronunciation': 3,
  '/settings/media': 2,
  '/settings/support': 2,
};

/** The routes shard `shard` (1-based) of `shards` crawls, in a stable order. */
export function routesForShard(routes, shard, shards, weights = ROUTE_WEIGHTS) {
  const weight = (route) => weights[route] ?? 1;
  const load = Array.from({ length: shards }, () => 0);
  const owned = Array.from({ length: shards }, () => []);
  const heaviestFirst = [...routes].sort((a, b) => weight(b) - weight(a) || (a < b ? -1 : 1));
  for (const route of heaviestFirst) {
    const lightest = load.indexOf(Math.min(...load));
    load[lightest] += weight(route);
    owned[lightest].push(route);
  }
  return owned[shard - 1].sort();
}
