// Both MCP server cards must validate against the Server Card extension schema
// (SEP-2127, successor to SEP-1649). tests/fixtures/mcp-server-card.schema.json
// is a pinned copy of schema.json from
// modelcontextprotocol/experimental-ext-server-card; its published $schema URL
// does not resolve yet. Scanners such as geo.new mark a card Invalid when
// `$schema` is missing. The card's other keys (serverInfo, transport, tools, ...)
// are additional properties the schema allows.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

const SERVER_CARD_SCHEMA = 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json';
const CARDS = ['server-card.json', 'docs-server-card.json'];

function readJson(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

const schema = readJson('./fixtures/mcp-server-card.schema.json');
const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
const validate = ajv.compile({ ...schema, $ref: '#/$defs/ServerCard' });

describe('MCP server card schema conformance', () => {
  for (const file of CARDS) {
    it(`${file} validates against the v1 Server Card schema`, () => {
      const card = readJson(`../public/.well-known/mcp/${file}`);
      assert.equal(card.$schema, SERVER_CARD_SCHEMA);
      assert.ok(validate(card), `${file}: ${ajv.errorsText(validate.errors)}`);
    });
  }

  it('the product card name matches the MCP Registry server.json name', () => {
    assert.equal(readJson('../public/.well-known/mcp/server-card.json').name, readJson('../server.json').name);
  });
});
