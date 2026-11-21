/**
 * Čitanje podataka iz HTML stranica portala (bez DOM-a, samo regex).
 *
 * Portal danas uglavnom prikazuje podatke tako što ih server ugradi u
 * stranicu kao Vue svojstva, npr. <timeline :student-class-id="123" :init-data='{...}'>.
 * Spisak dece i razreda je u meniju „students-list“ kao linkovi `?student=N`.
 */

const NAMED: Record<string, string> = {
  quot: '"', apos: "'", lt: '<', gt: '>', amp: '&', nbsp: ' ', bull: '•', middot: '·', ndash: '–', mdash: '—',
  hellip: '…', laquo: '«', raquo: '»', bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', sbquo: '‚',
  scaron: 'š', Scaron: 'Š', ccaron: 'č', Ccaron: 'Č', zcaron: 'ž', Zcaron: 'Ž', cacute: 'ć', Cacute: 'Ć',
  dstrok: 'đ', Dstrok: 'Đ', deg: '°', times: '×', euro: '€', copy: '©', shy: '',
};

function decodeOnce(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);?/g, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return e in NAMED ? NAMED[e] : m;
  });
}

/** Dekodira HTML entitete, i dvostruko kodirane (npr. „&amp;bull;“). */
export function decodeEntities(s: string): string {
  let out = decodeOnce(s);
  for (let i = 0; i < 2 && /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/.test(out); i++) out = decodeOnce(out);
  return out;
}

export function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export interface Prop {
  tag: string;
  name: string;
  raw: string;
  json?: unknown;
}

/** Sva svojstva custom (Vue) elemenata: <neki-tag :ime='...' ime2="...">. */
export function componentProps(html: string): Prop[] {
  const out: Prop[] = [];
  const tagRe = /<([a-z][a-z0-9]*-[a-z0-9-]+)\b((?:\s+[:@a-zA-Z0-9_.-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html))) {
    const attrRe = /([:@a-zA-Z0-9_.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(m[2]))) {
      const raw = decodeEntities(a[3] ?? a[4] ?? '');
      const prop: Prop = { tag: m[1], name: a[1], raw };
      const t = raw.trim();
      if (t.startsWith('{') || t.startsWith('[')) {
        try {
          prop.json = JSON.parse(t);
        } catch {
          /* nije JSON */
        }
      }
      out.push(prop);
    }
  }
  return out;
}

/** Nalazi nizove objekata koji liče na predmete sa ocenama. */
export function findCourseArrays(obj: unknown, depth = 0): any[][] {
  if (depth > 6 || !obj || typeof obj !== 'object') return [];
  const found: any[][] = [];
  const arr = Array.isArray(obj) ? obj : null;
  if (arr && arr.length && arr.every((x) => x && typeof x === 'object')) {
    const looksLike = arr.filter(
      (x: any) => ('course' in x || 'courseName' in x || 'subject' in x) && ('parts' in x || 'grades' in x),
    ).length;
    if (looksLike >= Math.max(1, arr.length / 2)) found.push(arr);
  }
  for (const v of Array.isArray(obj) ? obj : Object.values(obj as object)) found.push(...findCourseArrays(v, depth + 1));
  return found;
}

export interface HtmlClass {
  studentId: string;
  studentName: string;
  switchHref: string; // link koji aktivira razred na portalu
  active: boolean;
  schoolName: string;
  yearLabel: string;
  section: string;
}

/** Spisak dece i razreda iz menija na početnoj strani. */
export function parseStudentsMenu(html: string, baseUrl: string): HtmlClass[] {
  const out: HtmlClass[] = [];
  const cards = html.split(/<div class="card student"/).slice(1);
  for (const card of cards) {
    const header = card.match(/<h5[^>]*data-bs-target="#student-(\d+)"[^>]*>([\s\S]*?)<\/h5>/);
    const studentId = header?.[1] ?? '';
    const studentName = header
      ? textOf(header[2].replace(/<div class="student-no-avatar">[\s\S]*?<\/div>/, '').replace(/<svg[\s\S]*?<\/svg>/g, ''))
      : '';
    const linkRe = /<a href="([^"]*)" class="student-school-class-wrap([^"]*)">([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(card))) {
      const items = [...m[3].matchAll(/<div class="student-school-class-item[^"]*">([\s\S]*?)<\/div>/g)].map((x) => x[1]);
      const school = textOf(items[0] ?? '');
      const yearSection = textOf((items[1] ?? '').replace(/<sub>[\s\S]*?<\/sub>/g, ''));
      const ym = yearSection.match(/^(\d{2}\/\d{2})\s*(.*)$/);
      const href = decodeEntities(m[1]);
      out.push({
        studentId,
        studentName: studentName || 'Učenik',
        switchHref: href.startsWith('http') ? href : baseUrl + href,
        active: /\bactive\b/.test(m[2]),
        schoolName: school,
        yearLabel: ym ? ym[1] : '',
        section: ym ? ym[2] : yearSection,
      });
    }
  }
  return out;
}

/** Opis oblika JSON-a bez vrednosti (za dijagnostiku, bez ličnih podataka). */
export function shapeOf(v: unknown, depth = 0): string {
  if (depth > 4) return '…';
  if (Array.isArray(v)) return v.length ? `[${shapeOf(v[0], depth + 1)}]x${v.length}` : '[]';
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length && keys.every((k) => /^\d+$/.test(k))) return `{<id>:${shapeOf((v as any)[keys[0]], depth + 1)}}x${keys.length}`;
    return `{${keys.map((k) => `${k}:${shapeOf((v as any)[k], depth + 1)}`).join(',')}}`;
  }
  return v === null ? 'null' : typeof v;
}

export const maskPath = (url: string) => url.replace(/^https?:\/\/[^/]+/, '').replace(/\d+/g, 'N');

// ---------------- Stranice sa ocenama (/grades i /grades/{id}/show) ----------------

/** Linkovi ka predmetima iz padajućeg menija: [{id, name}] (bez „Svi predmeti“ = 0). */
export function parseSubjectLinks(html: string): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  const re = /<a[^>]*href="[^"]*\/grades\/(\d+)\/show[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const [, id, inner] = m;
    if (id === '0' || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: textOf(inner) });
  }
  return out;
}

/** "26. 11. 2025." -> "2025-11-26" */
export function toIsoDate(s: string): string {
  const m = s.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

/** Deli HTML na blokove koji počinju elementom sa datom klasom (grubo, ali dovoljno za ovu stranicu). */
function blocks(html: string, cls: string): string[] {
  const re = new RegExp(`<div class="${cls}(?:\\s[^"]*)?"`, 'g');
  const idx: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) idx.push(m.index);
  return idx.map((start, i) => html.slice(start, idx[i + 1] ?? html.length));
}

function firstText(html: string, cls: string): string {
  const m = html.match(new RegExp(`<div class="${cls}(?:\\s[^"]*)?"[^>]*>([\\s\\S]*?)<\\/div>`));
  return m ? textOf(m[1]) : '';
}

/** Brojčana ocena iz simbola („5“, „5 одличан“, „одличан (5)“) ili iz naziva („одличан (5)“). */
export function gradeValue(symbol: string, label: string): number | null {
  const s = symbol.trim();
  if (/^[1-5]$/.test(s)) return Number(s);
  const inSym = s.match(/^([1-5])(?![\d.,])/) ?? s.match(/\(([1-5])\)/);
  if (inSym) return Number(inSym[1]);
  const inLabel = label.match(/\(([1-5])\)\s*$/);
  if (inLabel && !/[a-zA-Zа-яА-Я]{3,}/.test(s.replace(/\(.*\)/, ''))) return Number(inLabel[1]);
  if (!s) {
    const words: Record<string, number> = { одличан: 5, врлодобар: 4, 'врло добар': 4, добар: 3, довољан: 2, недовољан: 1, odličan: 5, 'vrlo dobar': 4, dobar: 3, dovoljan: 2, nedovoljan: 1 };
    const l = label.toLowerCase().replace(/\s*\(.*$/, '').trim();
    if (l in words) return words[l];
  }
  return null;
}

const num = (s: string) => {
  const m = s.match(/(\d+[.,]\d+|\d+)/);
  return m ? Number(m[1].replace(',', '.')) : null;
};

/**
 * Jedan predmet sa stranice /grades/{id}/show, u obliku koji razume parseGrades():
 * { course, parts: { '1': { grades:[...], average, final } } }
 */
export function parseSubjectPage(html: string, fallbackName: string, sequence: number): any | null {
  const title = html.match(/<h4 class="es__card__title[^"]*"[^>]*>([\s\S]*?)<\/h4>/);
  const name = (title ? textOf(title[1]) : '') || fallbackName;
  const cats = blocks(html, 'category-wrap');
  if (!cats.length && !/category-item-wrap/.test(html)) return null;
  const parts: Record<string, any> = {};
  let numeric = false;
  cats.forEach((cat, i) => {
    const titleHtml = cat.match(/<div class="category-title"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
    const partName = textOf(titleHtml.replace(/<span[\s\S]*?<\/span>/g, '')).toLowerCase();
    let key = String(i + 1);
    if (/прв|prv/.test(partName)) key = '1';
    else if (/друг|drug/.test(partName)) key = '2';
    const finalBox = cat.match(/<div class="final-grade-field"[^>]*>([\s\S]*?)<div class="category-items-wrap/)?.[1] ?? '';
    let average: number | null = null;
    let final: any = null;
    for (const sm of finalBox.matchAll(/<small[^>]*>([\s\S]*?)<\/small>/g)) {
      const t = textOf(sm[1]);
      if (/закљ|zaklj/i.test(t)) {
        const after = t.split(':').slice(1).join(':').trim() || t;
        const v = num(after);
        final = { name: after.replace(/\(?\d\)?/g, '').trim(), value: v && v >= 1 && v <= 5 ? Math.round(v) : 0 };
      } else if (/ср|sr|просек|prosek/i.test(t)) {
        average = num(t.split(':').slice(1).join(':')) ?? num(t);
      }
    }
    // zaključna ocena ponekad stoji kao zaseban element bez <small>
    if (!final) {
      const f = textOf(finalBox);
      if (/закљ|zaklj/i.test(f)) {
        const v = num(f.split(/закључна|zaključna/i)[1] ?? '');
        if (v && v >= 1 && v <= 5) final = { name: '', value: Math.round(v) };
      }
    }
    const grades = blocks(cat, 'category-item-wrap').map((item) => {
      const symbol = firstText(item, 'category-symbol');
      const label = firstText(item, 'name');
      const subtitleHtml = item.match(/<div class="name-subtitle"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/)?.[1] ?? '';
      const date = toIsoDate(textOf(subtitleHtml));
      const category = textOf(subtitleHtml.match(/<div class="name-subtitle-suffix"[^>]*>([\s\S]*?)(?:<\/div>|$)/)?.[1] ?? '').replace(/^[•·\s\u00a0]+/, '').trim();
      const note = firstText(item, 'category-item-bottom-note');
      const v = gradeValue(symbol, label);
      if (v) numeric = true;
      return {
        descriptive: v === null,
        date,
        fullGrade: v ? `${label} (${v})` : label || symbol,
        grade: v ?? 0,
        gradeCategory: category,
        note,
      };
    });
    if (parts[key]) parts[key].grades.push(...grades);
    else parts[key] = { grades, average, final };
  });
  return { course: name, sequence, classCourseGradeTypeId: numeric || !Object.keys(parts).length ? 1 : 2, parts };
}

/** Maskirani kostur HTML-a (samo tagovi i klase; tekst -> X, cifre -> N) za dijagnostiku. */
export function maskedSkeleton(html: string, from: string, maxLen = 2500): string {
  const i = html.indexOf(from);
  if (i < 0) return '';
  return html
    .slice(i, i + maxLen * 4)
    .replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>')
    .replace(/<script[\s\S]*?<\/script>/g, '<script/>')
    .replace(/\s(?:href|src)="[^"]*"/g, (a) => a.replace(/\d+/g, 'N').replace(/https?:\/\/[^/"]+/, ''))
    .replace(/>([^<]+)</g, (_, t: string) => '>' + t.replace(/\d/g, 'N').replace(/[^\sN.,:;()\-–—•/]+/g, 'X').replace(/\s+/g, ' ') + '<')
    .replace(/\s+/g, ' ')
    .slice(0, maxLen);
}

// ---------------- Ostale stranice (izostanci, vladanje...) ----------------

export interface PageBlock {
  title: string;
  summary: string[];
  lines: string[];
}

/** Tekstualni delovi HTML-a, po jedan za svaki komad teksta između tagova. */
function segments(html: string): string[] {
  const first = html.indexOf('<');
  if (first > 0 && /^[^<]*">/.test(html)) html = html.slice(first); // odsečen kraj taga na početku
  return html
    .replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, ' ')
    .split(/<[^>]+>/)
    .map((t) => decodeEntities(t).replace(/\s+/g, ' ').replace(/^[•·\s\u00a0]+/, '').trim())
    .filter((t) => t && t !== '-' && !/^[\w-]*\s*(?:[\w-]+\s*)*"\s*\/?>$/.test(t) && !/="[^"]*"/.test(t));
}

const DATE_ONLY = /^\d{1,2}\.\s*\d{1,2}\.\s*\d{4}\.?$/;

/** Spaja red koji je samo datum sa redom posle njega: „04. 11. 2026.“ + „Примерно (5)“. */
function mergeDates(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (DATE_ONLY.test(lines[i]) && i + 1 < lines.length && !DATE_ONLY.test(lines[i + 1])) {
      out.push(`${lines[i]} · ${lines[i + 1]}`);
      i++;
    } else out.push(lines[i]);
  }
  return out;
}

/** Kartice (tabovi) na stranici: dugme/link sa #id i panel sa tim id-jem. */
function tabPanes(body: string): PageBlock[] {
  const tabs: { id: string; label: string }[] = [];
  const re = /<(a|button|li)\b[^>]*(?:data-bs-target|data-target|href|aria-controls)="#?([A-Za-z][\w-]*)"[^>]*>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const [, , id, inner] = m;
    const label = textOf(inner);
    if (label && !tabs.some((t) => t.id === id) && new RegExp(`id="${id}"`).test(body)) tabs.push({ id, label });
  }
  if (tabs.length < 2) return [];
  const starts = tabs.map((t) => {
    const i = body.search(new RegExp(`id="${t.id}"`));
    return Math.max(0, body.lastIndexOf('<', i));
  });
  const order = starts.map((st, i) => ({ st, i })).sort((a, b) => a.st - b.st);
  return tabs.map((t, i) => {
    const idx = order.findIndex((o) => o.i === i);
    const end = order[idx + 1]?.st ?? body.length;
    const pane = body.slice(starts[i], end).replace(/^<[^>]*>/, '');
    return { title: t.label, summary: [], lines: mergeDates(segments(pane)).slice(0, 300) };
  });
}

function mainPart(html: string): string {
  let start = html.indexOf('sections-wrap');
  if (start < 0) start = html.indexOf('main-content');
  if (start < 0) start = Math.max(0, html.indexOf('<body'));
  // kreni od početka taga, da ostatak atributa (class="… container">) ne završi kao tekst
  else start = Math.max(0, html.lastIndexOf('<', start));
  return html
    .slice(start)
    .replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, ' ')
    .replace(/<(nav|footer)\b[\s\S]*?<\/\1>/g, ' ')
    .replace(/<div class="modal[\s"][\s\S]*$/, ' ')
    .replace(/<div class="dropdown-menu[\s\S]*?<\/div>/g, ' ');
}

/**
 * Opšti čitač stranica portala: kartice (category-wrap / tabele / es-card) u blokove teksta.
 * Ne zna unapred šta piše na stranici, ali čuva redosled i grupisanje kakvo je na portalu.
 */
export function parsePageBlocks(html: string): PageBlock[] {
  const body = mainPart(html);
  const out: PageBlock[] = [];
  const cats = blocks(body, 'category-wrap');
  if (cats.length) {
    for (const cat of cats) {
      const titleHtml = cat.match(/<div class="category-title"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
      const title = segments(titleHtml).join(' · ');
      const summaryHtml = cat.match(/<div class="final-grade-field"[^>]*>([\s\S]*?)<div class="category-items-wrap/)?.[1] ?? '';
      const items = blocks(cat, 'category-item-wrap');
      out.push({
        title,
        summary: segments(summaryHtml),
        lines: items.length ? items.map((it) => segments(it).join(' · ')) : segments(cat.slice(titleHtml.length)).slice(1),
      });
    }
    return out.filter((b) => b.title || b.lines.length);
  }
  if (/<table/.test(body)) {
    const re = /<table[\s\S]*?<\/table>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
      const before = body.slice(Math.max(0, m.index - 1500), m.index);
      const heads = [...before.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/g)];
      const title = heads.length ? textOf(heads[heads.length - 1][1]) : '';
      const rows = [...m[0].matchAll(/<tr[\s\S]*?<\/tr>/g)].map((r) =>
        [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => textOf(c[1])).filter(Boolean).join(' · '),
      );
      out.push({ title, summary: [], lines: rows.filter(Boolean) });
    }
    if (out.length) return out;
  }
  const panes = tabPanes(body);
  if (panes.length) return panes;
  const cards = body.split(/<article\b|<div class="es-card[\s"]/).slice(1);
  for (const c of cards.length ? cards : [body]) {
    const h = c.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/);
    const title = h ? textOf(h[1]) : '';
    const rest = h ? c.slice((h.index ?? 0) + h[0].length) : c;
    const lines = mergeDates(segments(rest)).slice(0, 300);
    if (title || lines.length) out.push({ title, summary: [], lines });
  }
  return out;
}

// ---------------- Najave provera (kalendar na početnoj) ----------------

export interface CalEvent {
  date: string; // ISO yyyy-mm-dd
  title: string;
  color: string;
}

/** Događaji iz <mini-event-calendar :events='[...]'> na početnoj strani portala. */
export function parseCalendarEvents(html: string): CalEvent[] {
  const out: CalEvent[] = [];
  for (const p of componentProps(html)) {
    if (!/event/i.test(p.tag + p.name) || !Array.isArray(p.json)) continue;
    for (const e of p.json as any[]) {
      if (!e || typeof e !== 'object') continue;
      const raw = String(e.dbStart ?? e.start ?? e.date ?? '');
      const iso = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? toIsoDate(raw);
      const title = textOf(String(e.title ?? e.name ?? ''));
      if (iso && title) out.push({ date: iso, title, color: String(e.color ?? '') });
    }
  }
  const seen = new Set<string>();
  return out
    .filter((e) => (seen.has(e.date + e.title) ? false : (seen.add(e.date + e.title), true)))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Da li naslov liči na proveru znanja (kontrolni, pismeni, test...). */
export function isTest(title: string): boolean {
  return /контрол|kontrol|писмен|pismen|тест|test|провер|prover|испит|ispit|квиз|kviz|усмен|usmen/i.test(title);
}
