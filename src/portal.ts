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
}

export interface Student {
  id: number;
  fullName: string;
  classes: StudentClass[];
}

const HEADERS = {
  'Accept-Language': 'sr,en;q=0.8',
};

export class PortalClient {
  loggedIn = false;
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
    if (resp.status !== 200) throw new PortalError(`Portal je vratio grešku ${resp.status}.`);
    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new PortalError('Portal nije vratio podatke u očekivanom obliku (možda je promenjen).');
    }
  }

  async getStudents(): Promise<Student[]> {
    return parseStudents(await this.getJson('/api/students'));
  }

  async getGrades(studentClassId: number): Promise<unknown> {
    return this.getJson(`/api/grades/${Math.trunc(studentClassId)}`);
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
