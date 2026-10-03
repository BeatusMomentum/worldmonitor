import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getFredSeries } from '../server/worldmonitor/economic/v1/get-fred-series';
import { ALLOWED_FRED_SERIES } from '../server/worldmonitor/economic/v1/_fred-shared';
import { ValidationError } from '../src/generated/server/worldmonitor/economic/v1/service_server';

const SUPPORTED = [...ALLOWED_FRED_SERIES].sort();

test('an unsupported series ID is rejected with the supported IDs in the message', async () => {
  const request = new Request('https://api.worldmonitor.app/api/economic/v1/get-fred-series?series_id=DEXUSEU');
  await assert.rejects(
    getFredSeries({ request, pathParams: {}, headers: {} }, { seriesId: 'DEXUSEU', limit: 0 }),
    (error: unknown) => {
      assert.ok(error instanceof ValidationError);
      assert.equal(error.violations[0]!.description, `Unsupported FRED series ID. Supported: ${SUPPORTED.join(', ')}`);
      return true;
    },
  );
});

test('published OpenAPI lists every supported FRED series ID', () => {
  for (const file of ['EconomicService.openapi.json', 'EconomicService.openapi.yaml', 'worldmonitor.openapi.yaml']) {
    const spec = readFileSync(new URL(`../docs/api/${file}`, import.meta.url), 'utf8');
    for (const id of SUPPORTED) assert.match(spec, new RegExp(`\\b${id}\\b`), `${file} is missing ${id}`);
  }
  const json = JSON.parse(readFileSync(new URL('../docs/api/EconomicService.openapi.json', import.meta.url), 'utf8'));
  const param = json.paths['/api/economic/v1/get-fred-series'].get.parameters.find((p: { name: string }) => p.name === 'series_id');
  assert.deepEqual(param.schema.enum, SUPPORTED);
});
