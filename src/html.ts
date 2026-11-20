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
