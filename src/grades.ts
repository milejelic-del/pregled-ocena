/** Pretvara JSON ocena sa portala u strukturu za prikaz. */

export const PART_NAMES: Record<string, string> = { '1': 'Prvo polugodište', '2': 'Drugo polugodište' };

export interface GradeEntry {
  value: number | null; // 1-5, null za opisnu ocenu
  label: string;
  category: string;
  note: string;
  date: string; // ISO
  part: string;
}

export interface PartSummary {
  grades: GradeEntry[];
  average: number | null;
  finalValue: number | null;
  finalLabel: string;
}

export interface Subject {
  name: string;
  sequence: number;
  numeric: boolean;
  parts: Record<string, PartSummary>;
  allGrades: GradeEntry[];
  average: number | null;
  final: PartSummary | null;
}

const toGrade = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
};
const toAvg = (v: unknown): number | null => {
  const f = parseFloat(String(v ?? '').replace(',', '.'));
  return f > 0 ? Math.round(f * 100) / 100 : null;
};
const avgOf = (vals: number[]): number | null =>
  vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;

export function formatDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}.` : iso;
}

export function parseGrades(payload: any): Subject[] {
  let courses: any[] = [];
  if (Array.isArray(payload)) courses = payload;
  else if (payload && typeof payload === 'object')
    courses = payload.data ?? payload.courses ?? Object.values(payload);

  const subjects: Subject[] = [];
  for (const c of courses) {
    if (!c || typeof c !== 'object') continue;
    const numeric = c.classCourseGradeTypeId == null || String(c.classCourseGradeTypeId) === '1';
    let rawParts = c.parts ?? {};
    if (Array.isArray(rawParts)) rawParts = Object.fromEntries(rawParts.map((p: any, i: number) => [String(i + 1), p]));
    const parts: Record<string, PartSummary> = {};
    for (const [key, p] of Object.entries<any>(rawParts)) {
      if (!p || typeof p !== 'object') continue;
      const grades: GradeEntry[] = (p.grades ?? [])
        .filter((g: any) => g && typeof g === 'object')
        .map((g: any) => ({
          value: g.descriptive ? null : toGrade(g.grade),
          label: String(g.fullGrade ?? g.grade ?? ''),
          category: String(g.gradeCategory ?? ''),
          note: String(g.note ?? ''),
          date: String(g.date ?? ''),
          part: key,
        }))
        .sort((a: GradeEntry, b: GradeEntry) => a.date.localeCompare(b.date));
      const final = p.final && typeof p.final === 'object' ? p.final : null;
      parts[key] = {
        grades,
        average: toAvg(p.average) ?? avgOf(grades.flatMap((g) => (g.value ? [g.value] : []))),
        finalValue: final ? toGrade(final.value) : null,
        finalLabel: final ? String(final.name ?? '') : '',
      };
    }
    for (const k of ['1', '2']) parts[k] ??= { grades: [], average: null, finalValue: null, finalLabel: '' };
    const allGrades = Object.keys(parts).sort().flatMap((k) => parts[k].grades);
    const finalPart = ['2', '1'].map((k) => parts[k]).find((p) => p && (p.finalValue || p.finalLabel)) ?? null;
    subjects.push({
      name: String(c.course ?? c.name ?? 'Predmet'),
      sequence: Number(c.sequence ?? 999),
      numeric,
      parts,
      allGrades,
      average: avgOf(allGrades.flatMap((g) => (g.value ? [g.value] : []))),
      final: finalPart,
    });
  }
  return subjects.sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name));
}

export interface Overview {
  gradeCount: number;
  overallAverage: number | null;
  finalAverage: number | null;
  finalsCount: number;
  distribution: Record<number, number>;
  recent: { grade: GradeEntry; subject: string }[];
  atRisk: string[];
}

export function overview(subjects: Subject[]): Overview {
  const numeric = subjects.filter((s) => s.numeric);
  const finals = numeric.flatMap((s) => (s.final?.finalValue ? [s.final.finalValue] : []));
  const averages = numeric.flatMap((s) => (s.average ? [s.average] : []));
  const distribution: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  for (const s of subjects) for (const g of s.allGrades) if (g.value) distribution[g.value]++;
  const recent = subjects
    .flatMap((s) => s.allGrades.map((grade) => ({ grade, subject: s.name })))
    .sort((a, b) => b.grade.date.localeCompare(a.grade.date))
    .slice(0, 6);
  return {
    gradeCount: Object.values(distribution).reduce((a, b) => a + b, 0),
    overallAverage: avgOf(averages),
    finalAverage: avgOf(finals),
    finalsCount: finals.length,
    distribution,
    recent,
    atRisk: numeric.filter((s) => s.average !== null && s.average < 2.5).map((s) => s.name),
  };
}

// ---------------- Trend proseka kroz vreme ----------------

export type TrendMode = 'month' | 'quarter';

export interface TrendPoint {
  key: string;
  label: string;
  average: number | null; // prosek ocena dobijenih u tom periodu
  cumulative: number | null; // ukupan prosek do kraja perioda
  count: number;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec'];

/** Tromesečja školske godine: I (sep–okt), II (nov–dec), III (jan–mar), IV (apr–jun). */
function quarterOf(month: number): { idx: number; label: string } {
  if (month >= 9 && month <= 10) return { idx: 1, label: 'I trom.' };
  if (month >= 11) return { idx: 2, label: 'II trom.' };
  if (month <= 3) return { idx: 3, label: 'III trom.' };
  return { idx: 4, label: 'IV trom.' };
}

export function trend(grades: GradeEntry[], mode: TrendMode): TrendPoint[] {
  const vals = grades.filter((g) => g.value && /^\d{4}-\d{2}/.test(g.date)).sort((a, b) => a.date.localeCompare(b.date));
  const buckets = new Map<string, { label: string; sum: number; n: number; order: string }>();
  for (const g of vals) {
    const y = Number(g.date.slice(0, 4));
    const m = Number(g.date.slice(5, 7));
    const schoolYear = m >= 8 ? y : y - 1;
    let key: string;
    let label: string;
    if (mode === 'month') {
      key = g.date.slice(0, 7);
      label = MONTHS[m - 1];
    } else {
      const q = quarterOf(m);
      key = `${schoolYear}-Q${q.idx}`;
      label = q.label;
    }
    const b = buckets.get(key) ?? { label, sum: 0, n: 0, order: key };
    b.sum += g.value!;
    b.n += 1;
    buckets.set(key, b);
  }
  let cumSum = 0;
  let cumN = 0;
  return [...buckets.entries()]
    .sort((a, b) => a[1].order.localeCompare(b[1].order))
    .map(([key, b]) => {
      cumSum += b.sum;
      cumN += b.n;
      return {
        key,
        label: b.label,
        average: Math.round((b.sum / b.n) * 100) / 100,
        cumulative: Math.round((cumSum / cumN) * 100) / 100,
        count: b.n,
      };
    });
}

/** Da li je ocena „nova“ (poslednjih N dana). */
export function isRecent(g: GradeEntry, days = 7, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}/.test(g.date)) return false;
  const d = new Date(g.date.slice(0, 10) + 'T12:00:00');
  return (now.getTime() - d.getTime()) / 86400000 <= days && d.getTime() <= now.getTime() + 86400000;
}

// ---------------- Kalkulator „šta treba“ ----------------

export interface TargetPlan {
  target: number; // ocena koju želimo (2–5)
  threshold: number; // potreban prosek (npr. 4,50 za 5)
  reached: boolean;
  fives: number | null; // koliko petica zaredom treba (null = nemoguće)
  fours: number | null; // koliko četvorki zaredom (null = nemoguće ili nema smisla)
}

export interface Calculation {
  partKey: string; // polugodište na koje se odnosi
  count: number;
  average: number;
  plans: TargetPlan[];
  ifOne: number; // prosek ako dobije jedinicu
  ifTwo: number;
  ifFive: number;
}

const THRESHOLDS: Record<number, number> = { 5: 4.5, 4: 3.5, 3: 2.5, 2: 1.5 };

/** Koliko ocena vrednosti v treba dodati da prosek bude ≥ T. */
export function gradesNeeded(sum: number, n: number, v: number, T: number): number | null {
  if (n > 0 && sum / n >= T - 1e-9) return 0;
  if (v <= T) return null;
  return Math.max(0, Math.ceil((T * n - sum) / (v - T) - 1e-9));
}

/** Aktuelno polugodište: drugo ako ima ocena, inače prvo. */
export function calculate(s: Subject): Calculation | null {
  const key = s.parts['2']?.grades.some((g) => g.value) ? '2' : '1';
  const vals = (s.parts[key]?.grades ?? []).flatMap((g) => (g.value ? [g.value] : []));
  if (!s.numeric || !vals.length) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  const n = vals.length;
  const avg = sum / n;
  const r = (x: number) => Math.round(x * 100) / 100;
  const plans = [5, 4, 3, 2]
    .filter((t) => t <= 5)
    .map((t) => {
      const T = THRESHOLDS[t];
      const reached = avg >= T - 1e-9;
      return {
        target: t,
        threshold: T,
        reached,
        fives: reached ? 0 : gradesNeeded(sum, n, 5, T),
        fours: reached ? 0 : gradesNeeded(sum, n, 4, T),
      };
    });
  return {
    partKey: key,
    count: n,
    average: r(avg),
    plans,
    ifOne: r((sum + 1) / (n + 1)),
    ifTwo: r((sum + 2) / (n + 1)),
    ifFive: r((sum + 5) / (n + 1)),
  };
}

// ---------------- Tekst za deljenje ----------------

export function shareText(student: string, className: string, subjects: Subject[], o: Overview): string {
  const f = (v: number | null) => (v === null ? '–' : v.toFixed(2).replace('.', ','));
  const lines = [`📚 ${student} · ${className}`, `Prosek: ${f(o.overallAverage)} · ocena: ${o.gradeCount}`];
  if (o.finalsCount) lines.push(`Zaključne (prosek): ${f(o.finalAverage)}`);
  lines.push('');
  for (const s of subjects) {
    const vals = s.allGrades.map((g) => (g.value ? String(g.value) : g.label)).filter(Boolean);
    if (!vals.length && !s.final) continue;
    const fin = s.final ? ` · zaklj. ${s.final.finalValue ?? s.final.finalLabel}` : '';
    lines.push(`${s.name}: ${s.numeric ? f(s.average) : ''}${s.numeric ? ' (' : ''}${vals.join(', ')}${s.numeric ? ')' : ''}${fin}`);
  }
  if (o.atRisk.length) lines.push('', `⚠️ Pažnja: ${o.atRisk.join(', ')}`);
  lines.push('', 'Poslato iz aplikacije Pregled ocena');
  return lines.join('\n');
}
