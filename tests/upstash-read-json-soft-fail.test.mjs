/**
 * Soft-fail contract for readJsonFromUpstash (Sentry WORLDMONITOR-176).
 *
 * AbortSignal.timeout rejects with TimeoutError before the HTTP/parse paths
 * that already returned null. MCP cache tools Promise.all these reads; an
 * uncaught timeout became a tool-execution error instead of a null that F6
 * can turn into cache_all_null. Pin soft-fail for abort/timeout/network.
 */
import { strict as assert } from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'upstash-token';
delete process.env.VERCEL_ENV;
delete process.env.VERCEL_GIT_COMMIT_SHA;
delete process.env.LOCAL_API_MODE;

const upstash = await import('../api/_upstash-json.js');

after(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
});

beforeEach(() => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'upstash-token';
});

describe('readJsonFromUpstash soft-fail on AbortSignal.timeout', () => {
  it('returns null when fetch rejects with TimeoutError (AbortSignal.timeout)', async () => {
    globalThis.fetch = async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    };
    assert.equal(await upstash.readJsonFromUpstash('news:insights:v1', 3_000, true), null);
  });

  it('returns null when fetch rejects with AbortError', async () => {
    globalThis.fetch = async () => {
      throw new DOMException('The operation was aborted', 'AbortError');
    };
    assert.equal(await upstash.readJsonFromUpstash('news:insights:v1', 3_000, true), null);
  });

  it('returns null on network TypeError', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('fetch failed');
    };
    assert.equal(await upstash.readJsonFromUpstash('news:insights:v1', 3_000, true), null);
  });

  it('still returns unwrapped data on a hit', async () => {
    globalThis.fetch = async () => Response.json({
      result: JSON.stringify({ _seed: { fetchedAt: 1 }, data: { ok: 1 } }),
    });
    assert.deepEqual(await upstash.readJsonFromUpstash('news:insights:v1', 3_000, true), { ok: 1 });
  });
});
