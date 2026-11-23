/**
 * Rad bez interneta: poslednji učitani podaci čuvaju se u privatnoj fascikli aplikacije
 * (samo na ovom telefonu, bez lozinke). Pri pokretanju se odmah prikazuju, pa se osvežavaju.
 * Isti fajl čita i widget na početnom ekranu.
 */
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { overview, Subject } from './grades';
import type { CalEvent, PageBlock } from './html';
import { isTest } from './html';
import { currentClass, Student, StudentClass } from './portal';

/** v1.8.1: podaci pre ove verzije mogu imati ocene pogrešne škole -> ne koriste se */
const DATA_VERSION = 2;

export interface OfflineData {
  v?: number;
  savedAt: string; // ISO
  students: Student[];
  studentId: number | null;
  grades: Record<string, Subject[]>;
  sections: Record<string, PageBlock[]>;
  tests: Record<string, { events: CalEvent[]; blocks: PageBlock[] }>;
}

export interface WidgetInfo {
  name: string;
  className: string;
  average: number | null;
  last: { subject: string; label: string; date: string } | null;
  next: { date: string; title: string } | null;
  savedAt: string;
}

const native = Platform.OS === 'android' || Platform.OS === 'ios';
export const classKey = (cls: StudentClass) => String(cls.portalKey ?? cls.studentClassId);

function file() {
  return new File(Paths.document, 'poslednji-podaci.json');
}

let mem: OfflineData | null = null;

export function load(): OfflineData | null {
  if (mem) return mem;
  if (!native) return null;
  try {
    const f = file();
    if (f.exists) mem = JSON.parse(f.textSync()) as OfflineData;
    if (mem && mem.v !== DATA_VERSION) mem = null;
  } catch {
    mem = null;
  }
  return mem;
}

function empty(): OfflineData {
  return { v: DATA_VERSION, savedAt: new Date().toISOString(), students: [], studentId: null, grades: {}, sections: {}, tests: {} };
}

let timer: ReturnType<typeof setTimeout> | null = null;
let onSaved: (() => void) | null = null;
/** Widget se osvežava posle svakog upisa (postavlja widget.ts). */
export function setOnSaved(fn: () => void) {
  onSaved = fn;
}

function update(fn: (d: OfflineData) => void) {
  const d = load() ?? empty();
  fn(d);
  d.savedAt = new Date().toISOString();
  mem = d;
  if (!native) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    try {
      file().writeSync(JSON.stringify(d));
      onSaved?.();
    } catch {
      /* nije kritično */
    }
  }, 300);
}

export const saveStudents = (students: Student[], studentId: number | null) =>
  update((d) => {
    d.students = students;
    d.studentId = studentId;
  });
export const saveGrades = (cls: StudentClass, subjects: Subject[]) => update((d) => void (d.grades[classKey(cls)] = subjects));
export const saveSection = (kind: string, cls: StudentClass, blocks: PageBlock[]) =>
  update((d) => void (d.sections[`${kind}|${classKey(cls)}`] = blocks));
export const saveTests = (cls: StudentClass, r: { events: CalEvent[]; blocks: PageBlock[] }) =>
  update((d) => void (d.tests[classKey(cls)] = r));

/** Briše sačuvane podatke (pri odjavi / brisanju podataka). */
export function clear() {
  mem = null;
  if (timer) clearTimeout(timer);
  timer = null;
  if (!native) return;
  try {
    const f = file();
    if (f.exists) f.delete();
  } catch {
    /* ništa */
  }
  onSaved?.();
}

export function savedLabel(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  const today = new Date().toDateString() === d.toDateString();
  return `${today ? 'danas' : `${d.getDate()}.${d.getMonth() + 1}.`} u ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const todayIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/** Sažetak za widget: za svako dete tekući razred, prosek, poslednja ocena i sledeća provera. */
export function widgetInfo(d: OfflineData | null = load()): WidgetInfo[] {
  if (!d) return [];
  const out: WidgetInfo[] = [];
  const order = [...d.students].sort((a, b) => (a.id === d.studentId ? -1 : b.id === d.studentId ? 1 : 0));
  for (const st of order) {
    const cls = currentClass(st);
    if (!cls) continue;
    const subjects = d.grades[classKey(cls)];
    const o = subjects ? overview(subjects) : null;
    const r = o?.recent[0];
    const today = todayIso();
    const evs = (d.tests[classKey(cls)]?.events ?? []).filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    const next = evs.find((e) => isTest(e.title)) ?? evs[0] ?? null;
    out.push({
      name: st.fullName,
      className: cls.section,
      average: o?.overallAverage ?? null,
      last: r ? { subject: r.subject, label: r.grade.value ? String(r.grade.value) : r.grade.label, date: r.grade.date } : null,
      next: next ? { date: next.date, title: next.title } : null,
      savedAt: d.savedAt,
    });
  }
  return out;
}
