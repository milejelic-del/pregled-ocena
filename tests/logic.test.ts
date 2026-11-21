import { test } from 'node:test';
import assert from 'node:assert/strict';
import demo from '../src/demoData.json';
import { overview, parseGrades } from '../src/grades';
import { currentClass, FetchFn, LoginError, parseStudents, PortalClient } from '../src/portal';

const BASE = process.env.MOCK_URL ?? 'http://127.0.0.1:5077';

/** fetch sa kolačićima i ručnim praćenjem preusmerenja (kao na telefonu). */
function cookieFetch(): FetchFn {
  const jar = new Map<string, string>();
  const f: FetchFn = async (url, init = {}) => {
    let current = url;
    let opts: RequestInit = init;
    for (let i = 0; i < 5; i++) {
      const headers = new Headers(opts.headers);
      if (jar.size) headers.set('Cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
      const r = await fetch(current, { ...opts, headers, redirect: 'manual' });
      for (const c of r.headers.getSetCookie()) {
        const [kv] = c.split(';');
        const idx = kv.indexOf('=');
        jar.set(kv.slice(0, idx), kv.slice(idx + 1));
      }
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
        current = new URL(r.headers.get('location')!, current).toString();
        opts = { method: 'GET' };
        continue;
      }
      Object.defineProperty(r, 'url', { value: current });
      return r;
    }
    throw new Error('too many redirects');
  };
  return f;
}

test('parse students & current class', () => {
  const s = parseStudents(demo.students);
  assert.equal(s[0].classes.length, 3);
  assert.equal(currentClass(s[0])!.yearLabel, '25/26');
});

test('parse grades & overview', () => {
  const subj = parseGrades(demo.grades);
  const mat = subj.find((x) => x.name === 'Математика')!;
  assert.deepEqual(mat.parts['1'].grades.map((g) => g.value).sort(), [2, 3, 3, 4]);
  assert.equal(mat.parts['1'].finalValue, 3);
  const vers = subj.find((x) => !x.numeric)!;
  assert.equal(vers.final!.finalLabel, 'истиче се');
  assert.ok(overview(subj).atRisk.includes('Физика'));
});

test('login + fetch against mock portal', async () => {
  const c = new PortalClient(BASE, cookieFetch());
  await c.login('roditelj.test', 'TajnaLozinka1!');
  const st = await c.getStudents();
  const g = parseGrades(await c.getGrades(currentClass(st[0])!));
  assert.ok(g.length > 5);
  await c.logout();
});

test('bad password', async () => {
  const c = new PortalClient(BASE, cookieFetch());
  await assert.rejects(c.login('roditelj.test', 'pogresna'), (e: unknown) => e instanceof LoginError && /нису тачни/.test((e as Error).message));
});

const HTML_BASE = process.env.HTML_MOCK_URL ?? 'http://127.0.0.1:5078';

test('html portal: no /api, data embedded in pages', async () => {
  const c = new PortalClient(HTML_BASE, cookieFetch());
  await c.login('roditelj.test', 'TajnaLozinka1!');
  const st = await c.getStudents();
  assert.equal(c.mode, 'html');
  assert.equal(st.length, 1);
  assert.equal(st[0].fullName, 'Ана Петровић');
  assert.equal(st[0].classes.length, 3);
  const cur = currentClass(st[0])!;
  assert.equal(cur.yearLabel, '25/26');
  assert.equal(cur.section, 'VI 2');
  const subjects = parseGrades(await c.getGrades(cur));
  const ref = parseGrades(demo.grades);
  assert.equal(subjects.length, ref.length);
  const mat = subjects.find((s) => s.name === 'Математика')!;
  const refMat = ref.find((s) => s.name === 'Математика')!;
  assert.deepEqual(mat.allGrades.map((g) => [g.value, g.date, g.category, g.note]), refMat.allGrades.map((g) => [g.value, g.date, g.category, g.note]));
  assert.equal(mat.parts['1'].finalValue, 3);
  assert.equal(mat.parts['1'].average, refMat.parts['1'].average);
  const vers = subjects.find((s) => !s.numeric)!;
  assert.equal(vers.allGrades[0].value, null);
  assert.equal(vers.final?.finalLabel, 'истиче се');
  const old = st[0].classes.find((k) => k.yearLabel === '24/25')!;
  assert.ok(old.switchHref!.includes('student=6001'));
  // promena godine mora da promeni podatke, i povratak na aktuelnu da ih vrati
  const oldMat = parseGrades(await c.getGrades(old)).find((s) => s.name === 'Математика')!;
  assert.ok(oldMat.allGrades[0].date.startsWith('2024'), 'stara godina ima stare datume');
  assert.notDeepEqual(oldMat.allGrades.map((g) => g.value), mat.allGrades.map((g) => g.value));
  const backMat = parseGrades(await c.getGrades(cur)).find((s) => s.name === 'Математика')!;
  assert.deepEqual(backMat.allGrades.map((g) => g.value), mat.allGrades.map((g) => g.value));
  const music = st[0].classes.find((k) => k.section === 'II клавир')!;
  await c.getGrades(music);
  const again = parseGrades(await c.getGrades(old)).find((s) => s.name === 'Математика')!;
  assert.ok(again.allGrades[0].date.startsWith('2024'));
  const report = await c.diagnose();
  assert.ok(report.includes('/api/students -> 404'));
  assert.ok(/prepoznato ocena: [1-9]/.test(report), report);
  assert.ok(!report.includes('Ана') && !report.includes('Математика'), 'no personal data in report');
});

test('html portal: absences and behavior pages', async () => {
  const c = new PortalClient(HTML_BASE, cookieFetch());
  await c.login('roditelj.test', 'TajnaLozinka1!');
  const st = await c.getStudents();
  const cur = currentClass(st[0])!;
  const old = st[0].classes.find((k) => k.yearLabel === '24/25')!;
  const abs = await c.getSection('/absents', cur);
  assert.equal(abs.length, 1);
  assert.equal(abs[0].title, 'прво полугодиште');
  assert.deepEqual(abs[0].summary, ['Оправдано: 2', 'Неоправдано: 1']);
  assert.equal(abs[0].lines.length, 3);
  assert.equal(abs[0].lines[2], 'Историја · 03. 12. 2025. · 5. час · неоправдан');
  assert.ok(!JSON.stringify(abs).includes('Сакривено'));
  const absOld = await c.getSection('/absents', old);
  assert.equal(absOld[0].lines.length, 1);
  const beh = await c.getSection('/behavior', cur);
  assert.deepEqual(beh.map((b) => b.title), ['Оцене из владања', 'Похвале и мере', 'Владање на часу']);
  assert.deepEqual(beh[0].lines, ['04. 11. 2026. · Примерно (5)']);
  assert.deepEqual(beh[1].lines, []);
  assert.ok(!JSON.stringify(beh).includes('container'));
  // nazad na tekući razred
  const back = await c.getSection('/absents', cur);
  assert.equal(back[0].lines.length, 3);
});

test('back to the class that was active at login, from a fresh client', async () => {
  const c = new PortalClient(HTML_BASE, cookieFetch());
  await c.login('roditelj.test', 'TajnaLozinka1!');
  const st = await c.getStudents();
  const cur = currentClass(st[0])!;
  const old = st[0].classes.find((k) => k.yearLabel === '24/25')!;
  await c.getGrades(old);
  const mat = parseGrades(await c.getGrades(cur)).find((s) => s.name === 'Математика')!;
  assert.ok(mat.allGrades[0].date.startsWith('2025'));
});

test('html portal: upcoming tests from the home calendar', async () => {
  const c = new PortalClient(HTML_BASE, cookieFetch());
  await c.login('roditelj.test', 'TajnaLozinka1!');
  const st = await c.getStudents();
  const cur = currentClass(st[0])!;
  const r = await c.getUpcoming(cur);
  assert.equal(r.events.length, 4);
  assert.equal(r.events[1].title, 'Писмени задатак - Математика');
  assert.ok(r.events.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date)));
  assert.equal(r.blocks[0].title, 'Распоред писмених провера');
  assert.equal(r.blocks[0].lines[1], '24. 11. 2026. · Математика · Писмени задатак');
  const old = st[0].classes.find((k) => k.yearLabel === '24/25')!;
  assert.equal((await c.getUpcoming(old)).events.length, 1);
});

test('page parsing stays fast on long Latin text (no regex freeze)', async () => {
  const { parsePageBlocks } = await import('../src/html');
  const line = 'Kontrolni zadatak iz matematike za sledecu nedelju obavezno ponoviti gradivo';
  const html = `<html><body><main class="main-content container"><div class="es-card"><h3>Najave</h3>${Array.from({ length: 50 }, () => `<p>${line}</p>`).join('')}</div></main></body></html>`;
  const t = Date.now();
  const r = parsePageBlocks(html);
  assert.ok(Date.now() - t < 500, `parsiranje je trajalo ${Date.now() - t} ms`);
  assert.equal(r[0].lines[0], line);
});
