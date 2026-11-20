import { test } from 'node:test';
import assert from 'node:assert/strict';
import demo from '../src/demoData.json';
import { calculate, gradesNeeded, parseGrades, trend } from '../src/grades';
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


test('gradesNeeded math', () => {
  // ocene 3,2,4,3 (zbir 12, n 4): za 4,50 sa peticama: (4.5*4-12)/(5-4.5)=12
  assert.equal(gradesNeeded(12, 4, 5, 4.5), 12);
  assert.equal(gradesNeeded(12, 4, 5, 3.5), 2); // (14-12)/1.5=1,33 -> 2 petice
  assert.equal(gradesNeeded(12, 4, 4, 3.5), 4);
  assert.equal(gradesNeeded(12, 4, 4, 4.5), null); // sa četvorkama nemoguće
  assert.equal(gradesNeeded(18, 4, 5, 4.5), 0);
});

test('calculate uses current semester', () => {
  const g = (value: number, part: string) => ({ value, label: String(value), category: '', note: '', date: '2025-10-01', part });
  const s: any = { name: 'X', sequence: 1, numeric: true, allGrades: [], average: null, final: null,
    parts: { '1': { grades: [g(5, '1'), g(5, '1')], average: 5, finalValue: null, finalLabel: '' },
             '2': { grades: [g(3, '2'), g(4, '2')], average: 3.5, finalValue: null, finalLabel: '' } } };
  const c = calculate(s)!;
  assert.equal(c.partKey, '2');
  assert.equal(c.average, 3.5);
  const five = c.plans.find((p) => p.target === 5)!;
  assert.equal(five.fives, 4); // (4,5·2−7)/0,5 = 4
});

import { findNew, fingerprints, notificationText } from '../src/newGrades';

test('new grades are detected by fingerprint', () => {
  const subjects = parseGrades(demo.grades);
  const before = fingerprints(subjects);
  assert.ok(before.size > 10);
  assert.deepEqual(findNew(undefined, before), []); // prvi put: ništa
  assert.deepEqual(findNew([...before.keys()], before), []);
  // dodamo jednu ocenu iz matematike, istog dana kao postojeća sa istom vrednošću
  const s0 = subjects[0];
  const copy = { ...s0.allGrades[0] };
  const changed = subjects.map((s, i) => (i === 0 ? { ...s, allGrades: [...s.allGrades, copy] } : s));
  const after = fingerprints(changed);
  const fresh = findNew([...before.keys()], after);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].subject, s0.name);
  const t = notificationText('Ana Petrović', { subject: 'Matematika', grade: { ...copy, value: 5 } });
  assert.match(t.title, /^🌟 Ana: ocena 5 iz predmeta Matematika$/);
});

import { gradeValue } from '../src/html';

test('grade value from various symbol formats', () => {
  assert.equal(gradeValue('5', 'одличан'), 5);
  assert.equal(gradeValue('4 врлодобар', ''), 4);
  assert.equal(gradeValue('одличан (5)', 'одличан (5)'), 5);
  assert.equal(gradeValue('', 'добар (3)'), 3);
  assert.equal(gradeValue('', 'довољан'), 2);
  assert.equal(gradeValue('истиче се', 'истиче се'), null);
  assert.equal(gradeValue('4,5', ''), null);
});

import { overview, shareText } from '../src/grades';

test('share text lists subjects and average', () => {
  const subjects = parseGrades(demo.grades);
  const t = shareText('Ана Петровић', 'VI 2 · 25/26', subjects, overview(subjects));
  assert.match(t, /^📚 Ана Петровић · VI 2 · 25\/26\nProsek: \d,\d\d/);
  assert.ok(t.includes('Математика: '));
  assert.ok(!t.includes('undefined') && !t.includes('null'));
});
