export const C = {
  bg: '#f4f6fb',
  card: '#ffffff',
  text: '#1d2433',
  muted: '#6b7385',
  line: '#e6e9f0',
  primary: '#2f5fd0',
  danger: '#9b1c1c',
  dangerBg: '#fdecec',
};

export const GRADE_COLORS: Record<number, string> = {
  5: '#1f9d55',
  4: '#2b8fb3',
  3: '#d29a12',
  2: '#e06a1b',
  1: '#d23b3b',
};

export function avgColor(v: number | null): { fg: string; bg: string } {
  if (v === null) return { fg: C.muted, bg: 'transparent' };
  if (v >= 4.5) return { fg: '#1f9d55', bg: '#e7f6ed' };
  if (v >= 3.5) return { fg: '#2b8fb3', bg: '#e5f3f8' };
  if (v >= 2.5) return { fg: '#9a7008', bg: '#fbf3dd' };
  return { fg: '#d23b3b', bg: '#fbe7e7' };
}

export const fmtAvg = (v: number | null) => (v === null ? '–' : v.toFixed(2).replace('.', ','));

export const card = {
  backgroundColor: C.card,
  borderRadius: 14,
  padding: 16,
  marginTop: 12,
  shadowColor: '#14203c',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;
