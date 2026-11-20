/**
 * Klijent za moj.esdnevnik.rs.
 *
 * Portal nema javni API. Prijava ide kroz HTML formu (Laravel: `_token`,
 * `username`, `password`), a posle prijave isti kolačić sesije otvara JSON
 * adrese koje koristi i sam sajt:
 *   GET /api/students                 -> deca, škole, godine, odeljenja
 *   GET /api/grades/{studentClassId}  -> ocene po predmetima i polugodištima
 *
 * Na telefonu (Android/iOS) kolačiće automatski čuva sistemski HTTP klijent.
 * Kredencijali se nikad ne loguju.
 */

import {
  componentProps,
  findCourseArrays,
  maskedSkeleton,
  maskPath,
  parseStudentsMenu,
  parseSubjectLinks,
  parseSubjectPage,
  shapeOf,
} from './html';

export const DEFAULT_BASE_URL = 'https://moj.esdnevnik.rs';

export class PortalError extends Error {}
export class LoginError extends PortalError {}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface StudentClass {
  studentClassId: number;
  classId: number;
  section: string;
  yearLabel: string;
  schoolId: string;
  schoolName: string;
  /** HTML način rada: link koji na portalu aktivira ovaj razred. */
  switchHref?: string;
}

export interface Student {
  id: number;
  fullName: string;
  classes: StudentClass[];
}

const HEADERS = {
  'Accept-Language': 'sr,en;q=0.8',
};

class NotFound extends PortalError {}

export class PortalClient {
  loggedIn = false;
  /** 'api' = stare JSON adrese, 'html' = podaci iz stranica portala */
  mode: 'api' | 'html' | null = null;
  constructor(private baseUrl: string = DEFAULT_BASE_URL, private fetchFn: FetchFn = fetch) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private async req(path: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await this.fetchFn(this.baseUrl + path, {
        credentials: 'include',
        ...init,
        headers: { ...HEADERS, ...(init.headers as Record<string, string>) },
      });
    } catch {
      throw new PortalError('Portal moj.esdnevnik.rs nije dostupan. Proverite internet vezu.');
    }
  }

  async login(username: string, password: string): Promise<void> {
    if (!username.trim() || !password) throw new LoginError('Unesite korisničko ime i lozinku.');
    const page = await this.req('/login');
    if (page.status !== 200) throw new PortalError(`Portal je vratio grešku (${page.status}) na stranici za prijavu.`);
    const html = await page.text();
    if (!/name="password"/.test(html)) {
      // Već prijavljeni (kolačić od ranije) -> portal preusmerava na početnu
      if (!isLoginUrl(page.url)) {
        this.loggedIn = true;
        return;
      }
    }
    const token = extractToken(html);
    if (!token) throw new PortalError('Stranica za prijavu je promenjena, aplikaciju treba prilagoditi.');
    if (/g-recaptcha|h-captcha|cf-turnstile/.test(html)) {
      throw new LoginError('Portal trenutno traži CAPTCHA proveru. Prijavite se jednom na sajtu pa pokušajte ponovo.');
    }

    const body =
      `_token=${encodeURIComponent(token)}` +
      `&username=${encodeURIComponent(username.trim())}` +
      `&password=${encodeURIComponent(password)}`;
    const resp = await this.req('/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `${this.baseUrl}/login`,
        Origin: this.baseUrl,
      },
      body,
    });
    if (resp.status === 419) throw new LoginError('Sesija je istekla tokom prijave. Pokušajte ponovo.');
    if (resp.status === 429) throw new LoginError('Previše pokušaja prijave. Sačekajte nekoliko minuta.');
    const text = await resp.text();
    if (isLoginUrl(resp.url) || /name="password"/.test(text)) {
      throw new LoginError(extractLoginError(text) ?? 'Pogrešno korisničko ime ili lozinka.');
    }
    this.loggedIn = true;
  }

  async logout(): Promise<void> {
    try {
      await this.req('/logout');
    } catch {
      /* nebitno */
    }
    this.loggedIn = false;
  }

  private async getJson(path: string): Promise<unknown> {
    if (!this.loggedIn) throw new LoginError('Niste prijavljeni.');
    const resp = await this.req(path, {
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (resp.status === 401 || resp.status === 419 || isLoginUrl(resp.url)) {
      this.loggedIn = false;
      throw new LoginError('Sesija na portalu je istekla. Prijavite se ponovo.');
    }
    if (resp.status === 404) throw new NotFound(`Portal je vratio grešku 404.`);
    if (resp.status !== 200) throw new PortalError(`Portal je vratio grešku ${resp.status}.`);
    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new PortalError('Portal nije vratio podatke u očekivanom obliku (možda je promenjen).');
    }
  }

  private async getHtml(pathOrUrl: string): Promise<{ html: string; url: string }> {
    if (!this.loggedIn) throw new LoginError('Niste prijavljeni.');
    const resp = await this.req(pathOrUrl.startsWith('http') ? pathOrUrl.slice(this.baseUrl.length) : pathOrUrl);
    if (isLoginUrl(resp.url)) {
      this.loggedIn = false;
      throw new LoginError('Sesija na portalu je istekla. Prijavite se ponovo.');
    }
    if (resp.status !== 200) throw new PortalError(`Portal je vratio grešku ${resp.status} za stranicu ${maskPath(pathOrUrl)}.`);
    return { html: await resp.text(), url: resp.url };
  }

  async getStudents(): Promise<Student[]> {
    if (this.mode !== 'html') {
      try {
        const list = parseStudents(await this.getJson('/api/students'));
        this.mode = 'api';
        return list;
      } catch (e) {
        // 404 ili ne-JSON odgovor -> portal više nema stari API, čitamo stranice
        if (e instanceof LoginError || !(e instanceof PortalError)) throw e;
      }
    }
    this.mode = 'html';
    const { html } = await this.getHtml('/');
    const props = componentProps(html);
    const activeScid = Number(props.find((p) => p.name === ':student-class-id')?.raw ?? 0) || 0;
    const rows = parseStudentsMenu(html, this.baseUrl);
    const byStudent = new Map<string, Student>();
    rows.forEach((r, i) => {
      let st = byStudent.get(r.studentId);
      if (!st) {
        st = { id: Number(r.studentId) || byStudent.size + 1, fullName: r.studentName, classes: [] };
        byStudent.set(r.studentId, st);
      }
      const q = r.switchHref.match(/[?&]student=(\d+)/);
      st.classes.push({
        studentClassId: q ? Number(q[1]) : r.active ? activeScid || -1 - i : -1 - i,
        classId: rows.length - i,
        section: r.section,
        yearLabel: r.yearLabel,
        schoolId: r.schoolName,
        schoolName: r.schoolName,
        switchHref: r.switchHref,
      });
    });
    if (!byStudent.size) throw new PortalError('Na početnoj strani portala nije pronađen spisak učenika. Pokrenite „Dijagnostiku“.');
    return [...byStudent.values()];
  }

  async getGrades(cls: StudentClass): Promise<unknown> {
    if (this.mode === 'api') return this.getJson(`/api/grades/${Math.trunc(cls.studentClassId)}`);
    if (cls.switchHref) await this.getHtml(cls.switchHref); // aktivira razred na portalu
    let page;
    try {
      page = await this.getHtml('/grades');
    } catch (e) {
      if (e instanceof LoginError) throw e;
      page = null;
    }
    if (page) {
      // 1) podaci ugrađeni kao Vue svojstva (ako ih portal ikad vrati)
      for (const p of componentProps(page.html)) {
        const arrays = p.json ? findCourseArrays(p.json) : [];
        if (arrays.length) return arrays.sort((a, b) => b.length - a.length)[0];
      }
      // 2) obične HTML stranice: spisak predmeta, pa stranica svakog predmeta
      const links = parseSubjectLinks(page.html);
      if (links.length) {
        const courses: any[] = new Array(links.length).fill(null);
        let next = 0;
        const worker = async () => {
          while (next < links.length) {
            const i = next++;
            const l = links[i];
            try {
              const sub = await this.getHtml(`/grades/${l.id}/show`);
              courses[i] = parseSubjectPage(sub.html, l.name, i + 1) ?? { course: l.name, sequence: i + 1, parts: {} };
            } catch (e) {
              if (e instanceof LoginError) throw e;
              courses[i] = { course: l.name, sequence: i + 1, parts: {} };
            }
          }
        };
        await Promise.all([worker(), worker(), worker(), worker()]);
        if (courses.some((c) => c && Object.values(c.parts).some((p: any) => p.grades?.length))) return courses.filter(Boolean);
        if (courses.length) return courses.filter(Boolean);
      }
      const single = parseSubjectPage(page.html, 'Predmet', 1);
      if (single) return [single];
    }
    throw new PortalError(
      'Prijava je uspela, ali ocene nisu pronađene na stranici portala. Dodirnite „Dijagnostika“ na ekranu za prijavu i pošaljite rezultat.',
    );
  }

  /** Izveštaj o strukturi stranica — bez imena, ocena i drugih ličnih podataka. */
  async diagnose(): Promise<string> {
    const lines: string[] = [`verzija: 3`];
    const check = async (path: string, json: boolean) => {
      try {
        const r = await this.req(path, json ? { headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' } } : {});
        const body = await r.text();
        lines.push(`${maskPath(path)} -> ${r.status} ${maskPath(r.url ?? '')} (${body.length} B)`);
        return { body, url: r.url ?? '' };
      } catch {
        lines.push(`${maskPath(path)} -> greška mreže`);
        return null;
      }
    };
    const home = await check('/', false);
    let scid = 0;
    if (home) {
      const props = componentProps(home.body);
      scid = Number(props.find((p) => p.name === ':student-class-id')?.raw ?? 0) || 0;
      const rows = parseStudentsMenu(home.body, this.baseUrl);
      lines.push(`meni: ${rows.length} razreda, aktivnih ${rows.filter((r) => r.active).length}, godine ${[...new Set(rows.map((r) => r.yearLabel))].join(' ')}`);
      describeProps(lines, '/', props);
      const links = [...new Set([...home.body.matchAll(/href="(https?:\/\/[^"]*esdnevnik[^"]*)"/g)].map((m) => maskPath(m[1])))];
      lines.push(`linkovi: ${links.join(' ')}`);
    }
    for (const p of ['/api/students', `/api/grades/${scid}`, `/api/timeline/${scid}`]) await check(p, true);
    for (const p of ['/grades', '/grades/0/show']) {
      const pg = await check(p, false);
      if (pg) {
        describeProps(lines, p, componentProps(pg.body));
        const links = [...new Set([...pg.body.matchAll(/href="(https?:\/\/[^"]*\/grades[^"]*)"/g)].map((m) => maskPath(m[1])))];
        lines.push(`  linkovi ka ocenama: ${links.slice(0, 15).join(' ')}`);
        const scripts = [...pg.body.matchAll(/<script[^>]*src="([^"]*)"/g)].map((m) => maskPath(m[1]));
        lines.push(`  skripte: ${scripts.join(' ')}`);
        const html = pg.body;
        const count = (re: RegExp) => (html.match(re) ?? []).length;
        lines.push(`  broj: dropdown-item ${count(/dropdown-item/g)}, category-wrap ${count(/class="category-wrap/g)}, category-item-wrap ${count(/category-item-wrap/g)}, table ${count(/<table/g)}, tr ${count(/<tr/g)}`);
        const subjects = parseSubjectLinks(html);
        lines.push(`  predmeta u meniju: ${subjects.length}`);
        const inline = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
        const vars = [...new Set(inline.flatMap((t) => [...t.matchAll(/(window\.[A-Za-z_$][\w$]*|var\s+[A-Za-z_$][\w$]*|const\s+[A-Za-z_$][\w$]*)/g)].map((m) => m[1])))];
        lines.push(`  inline skripte: ${inline.length}, promenljive: ${vars.slice(0, 20).join(' ')}`);
        if (p === '/grades') {
          lines.push(`  kostur glavnog dela: ${maskedSkeleton(html, 'main-content', 2500)}`);
          if (subjects[0]) {
            try {
              const r = await this.req(`/grades/${subjects[0].id}/show`);
              const sh = await r.text();
              const parsed = parseSubjectPage(sh, 'x', 1);
              const nGrades = parsed ? Object.values(parsed.parts).reduce((a: number, x: any) => a + x.grades.length, 0) : -1;
              lines.push(`/grades/N/show (prvi predmet) -> ${r.status} ${maskPath(r.url ?? '')}, prepoznato ocena: ${nGrades}`);
              lines.push(`  kostur: ${maskedSkeleton(sh, 'sections-wrap', 2000) || maskedSkeleton(sh, 'main-content', 2000)}`);
            } catch {
              lines.push('/grades/N/show -> greška');
            }
          }
        }
        const apiRefs = [...new Set([...pg.body.matchAll(/["'](\/api\/[^"']{0,80})["']/g)].map((m) => maskPath(m[1])))];
        if (apiRefs.length) lines.push(`  /api u stranici: ${apiRefs.join(' ')}`);
      }
    }
    return lines.join('\n');
  }
}

function describeProps(lines: string[], page: string, props: ReturnType<typeof componentProps>) {
  lines.push(`komponente na ${page}:`);
  for (const p of props) {
    if (!p.name.startsWith(':') && !/url|data|init/i.test(p.name)) continue;
    const desc = p.json !== undefined ? shapeOf(p.json) : /url/i.test(p.name) ? maskPath(p.raw) : `${typeof p.raw}(${p.raw.length})`;
    lines.push(`  <${p.tag} ${p.name}> ${desc.slice(0, 600)}`);
  }
}

function isLoginUrl(url: string | undefined): boolean {
  return !!url && /\/login\/?(\?.*)?$/.test(url);
}

function extractToken(html: string): string | null {
  const tag = html.match(/<input[^>]*name=["']_token["'][^>]*>/i)?.[0];
  return tag?.match(/value=["']([^"']*)["']/i)?.[1] ?? null;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractLoginError(html: string): string | null {
  const m = html.match(/class="[^"]*(alert-danger|invalid-feedback)[^"]*"[^>]*>([\s\S]*?)<\/(div|span|p)>/i);
  const txt = m ? stripTags(m[2]) : '';
  return txt ? txt.slice(0, 300) : null;
}

function entries(obj: unknown): [string, any][] {
  if (Array.isArray(obj)) return obj.map((v, i) => [String(i), v]);
  if (obj && typeof obj === 'object') return Object.entries(obj as Record<string, unknown>);
  return [];
}

export function parseStudents(payload: any): Student[] {
  const data = payload && !Array.isArray(payload) && 'data' in payload ? payload.data : payload;
  const out: Student[] = [];
  for (const [, s] of entries(data)) {
    if (!s || typeof s !== 'object') continue;
    const st: Student = { id: Number(s.id ?? 0), fullName: String(s.fullName ?? s.name ?? 'Učenik'), classes: [] };
    for (const [schoolKey, school] of entries(s.schools)) {
      if (!school || typeof school !== 'object') continue;
      const schoolId = String(school.id ?? schoolKey);
      const schoolName = String(school.schoolName ?? school.name ?? '');
      for (const [, year] of entries(school.schoolyears ?? school.schoolYears)) {
        if (!year || typeof year !== 'object') continue;
        const yearLabel = String(year.year ?? year.name ?? year.year_id ?? '');
        for (const [classKey, cls] of entries(year.classes)) {
          if (!cls || cls.studentClassId == null) continue;
          st.classes.push({
            studentClassId: Number(cls.studentClassId),
            classId: Number(cls.id ?? classKey) || 0,
            section: String(cls.section ?? cls.name ?? ''),
            yearLabel,
            schoolId,
            schoolName,
          });
        }
      }
    }
    out.push(st);
  }
  return out;
}

function yearKey(label: string): number {
  const m = label.match(/\d+/);
  if (!m) return -1;
  const n = Number(m[0]);
  return n < 100 ? n + 2000 : n;
}

/** Aktuelni razred: najnovija školska godina, pa najveći ID odeljenja. */
export function currentClass(st: Student): StudentClass | null {
  if (!st.classes.length) return null;
  return [...st.classes].sort((a, b) => yearKey(b.yearLabel) - yearKey(a.yearLabel) || b.classId - a.classId)[0];
}
