// Run with: npm run test:graph (plain node, no test framework needed)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, type Commit } from './graph.ts';

const c = (hash: string, ...parents: string[]): Commit => ({
  hash, parents, author: '', email: '', date: 0, refs: [], subject: '',
});

test('linear history stays in lane 0', () => {
  const { rows, width } = buildGraph([c('c', 'b'), c('b', 'a'), c('a')]);
  assert.deepEqual(rows.map((r) => r.lane), [0, 0, 0]);
  assert.equal(width, 1);
  assert.equal(rows[0].lines.length, 1); // tip: only outgoing line
  assert.equal(rows[2].lines.length, 1); // root: only incoming line
});

test('merge opens a second lane and closes it at the fork point', () => {
  // m merges f into main; f and b both come from a.
  const { rows, width } = buildGraph([c('m', 'b', 'f'), c('f', 'a'), c('b', 'a'), c('a')]);
  assert.deepEqual(rows.map((r) => r.lane), [0, 1, 0, 0]);
  assert.equal(width, 2);
  // a collects both lanes: two incoming lines end at its node.
  assert.equal(rows[3].lines.filter((l) => l.y2 === 0.5).length, 2);
});

test('two unrelated tips get separate lanes', () => {
  const { rows } = buildGraph([c('x', 'a'), c('y', 'a'), c('a')]);
  assert.deepEqual(rows.map((r) => r.lane), [0, 1, 0]);
});
