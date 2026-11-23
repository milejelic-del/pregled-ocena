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
  parsePageBlocks,
  PageBlock,
  parseCalendarEvents,
  CalEvent,
} from './html';

export const DEFAULT_BASE_URL = 'https://moj.esdnevnik.rs';

export class PortalError extends Error {}
export class LoginError extends PortalError {}
/** Nema veze sa portalom (internet). */
export class NetworkError extends PortalError {
  /** tehnički razlog (za dijagnostiku) */
  detail = '';
}

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
  /** HTML način rada: stabilan ključ razreda (učenik|škola|godina|odeljenje). */
  portalKey?: string;
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
  /** ključ razreda -> ID za ?student=N (uči se iz menija na svakoj stranici) */
  private knownIds = new Map<string, string>();
  /** razred koji je trenutno aktivan na portalu (sesija) */
  private serverActive: string | null = null;
  /**
   * Portal pamti aktivan razred u sesiji, pa se upiti za različite škole/razrede ne smeju preplitati.
   * Upiti za isti razred idu paralelno; za drugi razred čekaju da se tekući završe.
   */
  private holder: string | null = null;
  private holders = 0;
  private waiters: (() => void)[] = [];
  private async withClass<T>(cls: StudentClass, fn: () => Promise<T>): Promise<T> {
    const key = cls.portalKey ?? String(cls.studentClassId);
    while (this.holders > 0 && this.holder !== key) await new Promise<void>((r) => this.waiters.push(r));
    this.holder = key;
    this.holders++;
    try {
      return await fn();
    } finally {
      this.holders--;
      if (!this.holders) {
        this.holder = null;
        this.waiters.splice(0).forEach((w) => w());
      }
    }
  }

  /** ključ razreda -> link iz menija portala (tačno onakav kakav portal daje) */
  private switchHrefs = new Map<string, string>();
  /** zapis pokušaja prebacivanja (za dijagnostiku, bez ličnih podataka) */
  switchLog: string[] = [];
  private learnMenu(html: string) {
    const rows = parseStudentsMenu(html, this.baseUrl);
    for (const r of rows) {
      const key = classKey(r);
      const q = r.switchHref.match(/[?&]student=(\d+)/);
      if (q) this.knownIds.set(key, q[1]);
      if (!r.active) this.switchHrefs.set(key, r.switchHref);
      if (r.active) this.serverActive = key;
    }
    return rows.length;
  }
  constructor(private baseUrl: string = DEFAULT_BASE_URL, private fetchFn: FetchFn = fetch) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private async req(path: string, init: RequestInit = {}): Promise<Response> {
    // bez odgovora 25 s -> prekid, da aplikacija ne čeka unedogled na lošoj vezi
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 25000) : null;
    try {
      return await this.fetchFn(this.baseUrl + path, {
        credentials: 'include',
        ...init,
        ...(ctrl ? { signal: ctrl.signal } : {}),
        headers: { ...HEADERS, ...(init.headers as Record<string, string>) },
      });
    } catch (e) {
      const err = new NetworkError('Portal moj.esdnevnik.rs nije dostupan. Proverite internet vezu.');
      err.detail = ctrl?.signal.aborted ? 'nema odgovora 25 s' : String((e as Error)?.message ?? e).slice(0, 80);
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
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
    this.learnMenu(html);
    const byStudent = new Map<string, Student>();
    // isto dete upisano u više škola (npr. osnovna i muzička) može imati više kartica na portalu -> jedan učenik
    const sameKid = (n: string) => n.normalize('NFC').toLocaleLowerCase('sr').replace(/\s+/g, ' ').trim();
    rows.forEach((r, i) => {
      const k = r.studentName && r.studentName !== 'Učenik' ? `n:${sameKid(r.studentName)}` : `id:${r.studentId}`;
      let st = byStudent.get(k);
      if (!st) {
        st = { id: Number(r.studentId) || byStudent.size + 1, fullName: r.studentName, classes: [] };
        byStudent.set(k, st);
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
        portalKey: classKey(r),
      });
    });
    if (!byStudent.size) throw new PortalError('Na početnoj strani portala nije pronađen spisak učenika. Pokrenite „Dijagnostiku“.');
    return [...byStudent.values()];
  }

  async getGrades(cls: StudentClass): Promise<unknown> {
    if (this.mode === 'api') return this.getJson(`/api/grades/${Math.trunc(cls.studentClassId)}`);
    return this.withClass(cls, () => this.gradesHtml(cls));
  }

  private async gradesHtml(cls: StudentClass): Promise<unknown> {
    let page: { html: string; url: string } | null = null;
    try {
      page = await this.openGradesFor(cls);
    } catch (e) {
      if (e instanceof LoginError) throw e;
      if (e instanceof PortalError && /prebac/.test(e.message)) throw e;
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

  /** Druge stranice portala (izostanci, vladanje) za izabrani razred, kao blokovi teksta. */
  async getSection(path: '/absents' | '/behavior', cls: StudentClass): Promise<PageBlock[]> {
    if (this.mode === 'api') throw new PortalError('Ova stranica nije dostupna na ovom portalu.');
    return this.withClass(cls, () => this.sectionHtml(path, cls));
  }

  private async sectionHtml(path: string, cls: StudentClass): Promise<PageBlock[]> {
    // stranica ocena se otvara samo kad treba prebaciti razred (inače je to suvišan spor zahtev)
    if (cls.portalKey && cls.portalKey !== this.serverActive) await this.openGradesFor(cls);
    const page = await this.getHtml(path);
    try {
      this.learnMenu(page.html);
      return parsePageBlocks(page.html);
    } catch (e) {
      throw new PortalError(`Stranica nije mogla da se pročita (${e instanceof Error ? e.message : String(e)}).`);
    }
  }

  /** Najave provera: kalendar sa početne strane i stranica rasporeda provera. */
  async getUpcoming(cls: StudentClass): Promise<{ events: CalEvent[]; blocks: PageBlock[] }> {
    if (this.mode === 'api') throw new PortalError('Ova stranica nije dostupna na ovom portalu.');
    return this.withClass(cls, () => this.upcomingHtml(cls));
  }

  private async upcomingHtml(cls: StudentClass): Promise<{ events: CalEvent[]; blocks: PageBlock[] }> {
    // ako je razred već aktivan na portalu, ne otvaramo ponovo stranicu ocena
    if (cls.portalKey && cls.portalKey !== this.serverActive) await this.openGradesFor(cls);
    // početna strana (kalendar) i raspored provera se učitavaju istovremeno
    const [home, sched] = await Promise.all([
      this.getHtml('/'),
      this.getHtml('/task-schedules').catch((e) => {
        if (e instanceof LoginError) throw e;
        return null;
      }),
    ]);
    // svaki deo posebno: ako jedan ne uspe da se pročita, drugi se ipak prikaže
    let events: CalEvent[] = [];
    let blocks: PageBlock[] = [];
    let err: unknown = null;
    try {
      this.learnMenu(home.html);
      events = parseCalendarEvents(home.html);
    } catch (e) {
      err = e;
    }
    if (sched) {
      try {
        blocks = parsePageBlocks(sched.html);
      } catch (e) {
        err = err ?? e;
      }
    }
    if (err && !events.length && !blocks.length) {
      throw new PortalError(`Najave provera nisu mogle da se pročitaju (${err instanceof Error ? err.message : String(err)}).`);
    }
    return { events, blocks };
  }

  /**
   * Otvara /grades tako da je na portalu aktivan traženi razred (dete/škola).
   * Prelazak se uvek proverava po meniju portala; ako ne uspe, javlja se greška umesto pogrešnih ocena.
   */
  private async openGradesFor(cls: StudentClass): Promise<{ html: string; url: string }> {
    const key = cls.portalKey;
    const grades = async () => {
      const page = await this.getHtml('/grades');
      return { page, rows: this.learnMenu(page.html) };
    };
    if (!key) return (await grades()).page;
    if (key === this.serverActive) {
      const g = await grades();
      if (this.serverActive === key || !g.rows) return g.page;
    }
    if (!this.knownIds.has(key) && !this.switchHrefs.has(key)) {
      // razred još nije viđen u meniju -> pogledaj meni na početnoj
      await this.getHtml('/').then((p) => this.learnMenu(p.html)).catch(() => 0);
      if (this.serverActive === key) {
        const g = await grades();
        if (this.serverActive === key) return g.page;
      }
    }
    const id = this.knownIds.get(key);
    const href = this.switchHrefs.get(key);
    const tries = [
      ...(href ? [href.startsWith(this.baseUrl) ? href.slice(this.baseUrl.length) || '/' : href] : []),
      ...(id ? [`/?student=${id}`, `/grades?student=${id}`] : []),
    ].filter((v, i, arr) => arr.indexOf(v) === i);
    if (!tries.length) throw new PortalError('Ne mogu da prebacim na ovu školu. Osvežite (povucite nadole) pa pokušajte ponovo.');
    for (const path of tries) {
      const sw = await this.getHtml(path.startsWith('http') || path.startsWith('/') ? path : `/${path}`);
      const swRows = this.learnMenu(sw.html);
      const g = await grades();
      const ok = this.serverActive === key || (!g.rows && !swRows);
      this.switchLog.push(`${maskPath(path)} -> meni ${swRows}/${g.rows}, prebačeno ${ok ? 'da' : 'ne'}`);
      if (ok) {
        this.serverActive = key;
        return g.page;
      }
    }
    throw new PortalError(
      `Portal nije prebacio na „${cls.schoolName} · ${cls.section}“. Pokušajte ponovo; ako se ponavlja, pokrenite „Dijagnostiku“ i pošaljite rezultat.`,
    );
  }

  /** Izveštaj o strukturi stranica — bez imena, ocena i drugih ličnih podataka. */
  async diagnose(): Promise<string> {
    const lines: string[] = [`verzija: 6`];
    const check = async (path: string, json: boolean) => {
      const t0 = Date.now();
      try {
        const r = await this.req(path, json ? { headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' } } : {});
        const body = await r.text();
        lines.push(`${maskPath(path)} -> ${r.status} ${maskPath(r.url ?? '')} (${body.length} B)`);
        return { body, url: r.url ?? '' };
      } catch (e) {
        lines.push(`${maskPath(path)} -> greška mreže (${e instanceof NetworkError ? e.detail : String(e).slice(0, 60)}, ${Date.now() - t0} ms)`);
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
      const evs = parseCalendarEvents(home.body);
      lines.push(`kalendar: ${evs.length} događaja, naslovi (maskirano): ${[...new Set(evs.map((e) => e.title.replace(/\d/g, 'N').replace(/[^\s\-–:.,()N]+/g, (w) => (w.length > 3 ? w.slice(0, 3) + '…' : w))))].slice(0, 12).join(' | ')}`);
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
    // izostanci, vladanje, zaključne
    for (const p of ['/absents', '/behavior', '/task-schedules', '/grades/final']) {
      const pg = await check(p, false);
      if (!pg) continue;
      const blocksFound = parsePageBlocks(pg.body);
      lines.push(`  blokova: ${blocksFound.length}, redova: ${blocksFound.map((b) => b.lines.length).join('/')}`);
      lines.push(`  kostur: ${maskedSkeleton(pg.body, 'sections-wrap', 2500) || maskedSkeleton(pg.body, 'main-content', 2500)}`);
    }
    // prebacivanje između dece i škola tekuće godine
    try {
      const homeHtml = home?.body ?? '';
      const cards = homeHtml.split(/<div class="card student/).slice(1);
      lines.push(`kartice dece na početnoj: ${cards.length}, upisa po kartici: ${cards.map((c) => (c.match(/student-school-class-wrap/g) ?? []).length).join('/')}`);
      const rows = parseStudentsMenu(homeHtml, this.baseUrl);
      lines.push(`linkovi upisa: ${rows.map((r) => `${maskPath(r.switchHref) || '/'}${r.active ? '*' : ''}[${r.yearLabel}]`).join(' ')}`);
      const students = await this.getStudents();
      lines.push(`dece: ${students.length}, upisa tekuće godine: ${students.map((s) => currentClasses(s).length).join('+')}`);
      const sig = (html: string) => {
        const ids = parseSubjectLinks(html).map((x) => x.id).join(',');
        let h = 5381;
        for (let i = 0; i < ids.length; i++) h = ((h * 33) ^ ids.charCodeAt(i)) >>> 0;
        return `${parseSubjectLinks(html).length} predmeta, otisak ${(h % 65536).toString(16)}`;
      };
      for (const [i, st] of students.entries()) {
        for (const [j, cls] of currentClasses(st).entries()) {
          this.switchLog = [];
          try {
            const page = await this.openGradesFor(cls);
            lines.push(`dete ${i + 1}, škola ${j + 1}: ${sig(page.html)}; ${this.switchLog.join('; ') || 'već aktivno'}`);
          } catch (e) {
            lines.push(`dete ${i + 1}, škola ${j + 1}: NIJE PREBAČENO; ${this.switchLog.join('; ')}; ${(e as Error).message?.slice(0, 60)}`);
          }
        }
      }
    } catch (e) {
      lines.push(`prebacivanje: greška ${(e as Error).message?.slice(0, 80)}`);
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

function classKey(r: { studentId: string; schoolName: string; yearLabel: string; section: string }): string {
  return [r.studentId, r.schoolName, r.yearLabel, r.section].join('|');
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

/** Svi upisi u tekućoj školskoj godini (npr. osnovna i muzička škola); prvi je glavni. */
export function currentClasses(st: Student): StudentClass[] {
  const cur = currentClass(st);
  if (!cur) return [];
  return st.classes.filter((c) => c.yearLabel === cur.yearLabel).sort((a, b) => (a === cur ? -1 : b === cur ? 1 : b.classId - a.classId));
}

/** Aktuelni razred: najnovija školska godina, pa najveći ID odeljenja. */
export function currentClass(st: Student): StudentClass | null {
  if (!st.classes.length) return null;
  return [...st.classes].sort((a, b) => yearKey(b.yearLabel) - yearKey(a.yearLabel) || b.classId - a.classId)[0];
}
