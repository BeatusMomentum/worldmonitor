// Both MCP server cards must satisfy the required fields of the Server Card
// extension schema (SEP-2127, successor to SEP-1649), defined in
// modelcontextprotocol/experimental-ext-server-card `schema.ts`. Scanners such
// as geo.new mark a card Invalid when `$schema` is missing; the same schema also
// requires a reverse-DNS `name` and a description of at most 100 characters.
// The card's other keys (serverInfo, transport, tools, ...) are additional
// properties the schema allows.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SERVER_CARD_SCHEMA = 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json';
const NAME_PATTERN = /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/;

const CARDS = ['server-card.json', 'docs-server-card.json'];

function readCard(file) {
  return JSON.parse(readFileSync(new URL(`../public/.well-known/mcp/${file}`, import.meta.url), 'utf8'));
}

describe('MCP server card schema conformance', () => {
  for (const file of CARDS) {
    it(`${file} declares the v1 Server Card $schema and its required fields`, () => {
      const card = readCard(file);
      assert.equal(card.$schema, SERVER_CARD_SCHEMA);
      assert.equal(typeof card.name, 'string');
      assert.ok(card.name.length >= 3 && card.name.length <= 200, `${file} name length`);
      assert.match(card.name, NAME_PATTERN, `${file} name must be reverse-DNS namespace/name`);
      assert.equal(typeof card.version, 'string');
      assert.ok(card.version.length > 0 && card.version.length <= 255, `${file} version length`);
      assert.equal(typeof card.description, 'string');
      assert.ok(
        card.description.length >= 1 && card.description.length <= 100,
        `${file} description is ${card.description.length} chars; the schema allows 100`,
      );
    });
  }

  it('the product card name matches the MCP Registry server.json name', () => {
    const registry = JSON.parse(readFileSync(new URL('../server.json', import.meta.url), 'utf8'));
    assert.equal(readCard('server-card.json').name, registry.name);
  });
});
