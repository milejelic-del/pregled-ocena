/**
 * Čitanje podataka iz HTML stranica portala (bez DOM-a, samo regex).
 *
 * Portal danas uglavnom prikazuje podatke tako što ih server ugradi u
 * stranicu kao Vue svojstva, npr. <timeline :student-class-id="123" :init-data='{...}'>.
 * Spisak dece i razreda je u meniju „students-list“ kao linkovi `?student=N`.
 */

export function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
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
      const category = textOf(subtitleHtml.match(/<div class="name-subtitle-suffix"[^>]*>([\s\S]*?)(?:<\/div>|$)/)?.[1] ?? '').replace(/^[•·\s]+/, '');
      const note = firstText(item, 'category-item-bottom-note');
      const v = /^\d$/.test(symbol) ? Number(symbol) : null;
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
