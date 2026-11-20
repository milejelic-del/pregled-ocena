/** Prepoznavanje novih ocena između dve provere (čista logika, bez telefona). */
import { GradeEntry, Subject } from './grades';

export interface NewGrade {
  subject: string;
  grade: GradeEntry;
}

/** Otisak jedne ocene. Iste ocene istog dana dobijaju redni broj (#2, #3...). */
export function fingerprints(subjects: Subject[]): Map<string, NewGrade> {
  const out = new Map<string, NewGrade>();
  for (const s of subjects) {
    for (const g of s.allGrades) {
      const base = [s.name, g.part, g.date.slice(0, 10), g.label, g.category].join('|');
      let k = 1;
      while (out.has(`${base}#${k}`)) k++;
      out.set(`${base}#${k}`, { subject: s.name, grade: g });
    }
  }
  return out;
}

/** Ocene kojih nije bilo u prethodnom snimku. Bez prethodnog snimka nema „novih“ (da ne zatrpamo telefon). */
export function findNew(previous: string[] | undefined, now: Map<string, NewGrade>): NewGrade[] {
  if (!previous) return [];
  const seen = new Set(previous);
  return [...now.entries()].filter(([k]) => !seen.has(k)).map(([, v]) => v);
}

export function notificationText(child: string, g: NewGrade): { title: string; body: string } {
  const what = g.grade.value ? `ocena ${g.grade.value}` : g.grade.label || 'nova ocena';
  const emoji = g.grade.value ? ['', '😟', '😐', '🙂', '😊', '🌟'][g.grade.value] : '📝';
  const first = child.split(/\s+/)[0] || child;
  return {
    title: `${emoji} ${first}: ${what} iz predmeta ${g.subject}`,
    body: [g.grade.category, g.grade.note].filter(Boolean).join(' · ') || 'Nova ocena u eDnevniku',
  };
}

export function summaryText(child: string, list: NewGrade[]): { title: string; body: string } {
  const first = child.split(/\s+/)[0] || child;
  return {
    title: `📚 ${first}: ${list.length} novih ocena`,
    body: list
      .slice(0, 6)
      .map((g) => `${g.subject}: ${g.grade.value ?? g.grade.label}`)
      .join(', '),
  };
}
