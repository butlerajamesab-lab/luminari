'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const dbLegacy = readFileSync(
  join(__dirname, '..', 'server', 'db-legacy.ts'),
  'utf8',
);
const schema = readFileSync(
  join(__dirname, '..', 'drizzle', 'schema.ts'),
  'utf8',
);
const migration = readFileSync(
  join(__dirname, '..', 'supabase', 'migrations', '20260822043111_harden_lighthouse_suggestion_board_writes.sql'),
  'utf8',
);

test('Suggestion Board inserts use PostgreSQL RETURNING instead of MySQL result tuples', () => {
  const createBlock = dbLegacy.slice(
    dbLegacy.indexOf('export async function createSuggestion'),
    dbLegacy.indexOf('export async function listSuggestions'),
  );
  assert.match(createBlock, /\.returning\(\{ id: lighthouseSuggestions\.id \}\)/);
  assert.doesNotMatch(createBlock, /insertId|affectedRows|const \[result\]/);
});

test('vote and unvote update the ledger and counter transactionally', () => {
  const voteBlock = dbLegacy.slice(
    dbLegacy.indexOf('export async function voteSuggestion'),
    dbLegacy.indexOf('export async function getUserVotedSuggestionIds'),
  );
  assert.match(voteBlock, /db\.transaction/);
  assert.match(voteBlock, /\.returning\(\{ id: lighthouseSuggestions\.id \}\)/);
  assert.match(voteBlock, /e\?\.code === "23505"/);
  assert.match(voteBlock, /e\?\.code === "23503"/);
  assert.match(voteBlock, /\.returning\(\{ id: lighthouseSuggestionVotes\.id \}\)/);
  assert.doesNotMatch(voteBlock, /ER_DUP_ENTRY|affectedRows/);
});

test('vote rows are bound to existing suggestions with cascade cleanup', () => {
  assert.match(
    schema,
    /suggestionId: integer\("suggestionId"\)\.notNull\(\)\.references\(\(\) => lighthouseSuggestions\.id, \{ onDelete: "cascade" \}\)/,
  );
  assert.match(migration, /foreign key \("suggestionId"\)/i);
  assert.match(migration, /references public\.lighthouse_suggestions\(id\)/i);
  assert.match(migration, /on delete cascade/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.lighthouse_suggestion_votes/i);
});
