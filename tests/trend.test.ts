import { test } from 'node:test';
import assert from 'node:assert/strict';
import demo from '../src/demoData.json';
import { parseGrades, trend } from '../src/grades';
import { decodeEntities } from '../src/html';

test('trend by month and quarter', () => {
  const all = parseGrades(demo.grades).flatMap((s) => s.allGrades);
  const m = trend(all, 'month');
  assert.deepEqual(m.map((p) => p.label), ['sep', 'okt', 'nov', 'dec', 'jan', 'feb']);
  assert.equal(m.reduce((a, p) => a + p.count, 0), all.filter((g) => g.value).length);
  const q = trend(all, 'quarter');
  assert.deepEqual(q.map((p) => p.label), ['I trom.', 'II trom.', 'III trom.']);
  const total = all.filter((g) => g.value).map((g) => g.value!);
  assert.equal(q[q.length - 1].cumulative, Math.round((total.reduce((a, b) => a + b, 0) / total.length) * 100) / 100);
});

test('html entities incl. &bull;', () => {
  assert.equal(decodeEntities('&nbsp;&bull;&nbsp;Тест'), ' • Тест');
  assert.equal(decodeEntities('&amp;bull;'), '•');
});
