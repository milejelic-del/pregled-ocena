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
