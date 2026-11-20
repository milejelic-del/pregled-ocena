import { createContext, useContext } from 'react';
import { ViewStyle } from 'react-native';

export type ThemeChoice = 'system' | 'light' | 'dark';

export interface Palette {
  dark: boolean;
  bg: string;
  card: string;
  text: string;
  muted: string;
  line: string;
  divider: string;
  subtle: string; // blago istaknuta pozadina (sačuvan nalog, kartica u fokusu)
  primary: string;
  onPrimary: string;
  danger: string;
  dangerBg: string;
  pillBg: string;
  pillText: string;
  warnBg: string;
  warnText: string;
  chipDescBg: string;
  avatar: string;
  shadow: string;
}

export const LIGHT: Palette = {
  dark: false,
  bg: '#f4f6fb',
  card: '#ffffff',
  text: '#1d2433',
  muted: '#6b7385',
  line: '#e6e9f0',
  divider: '#f0f2f7',
  subtle: '#f6f8fd',
  primary: '#2f5fd0',
  onPrimary: '#ffffff',
  danger: '#9b1c1c',
  dangerBg: '#fdecec',
  pillBg: '#eef2ff',
  pillText: '#2f5fd0',
  warnBg: '#fff4e0',
  warnText: '#9a6400',
  chipDescBg: '#eef0f5',
  avatar: '#5a6ff0',
  shadow: '#14203c',
};

export const DARK: Palette = {
  dark: true,
  bg: '#0f1420',
  card: '#1a2130',
  text: '#e8ecf4',
  muted: '#98a1b3',
  line: '#2c3546',
  divider: '#252d3c',
  subtle: '#222b3b',
  primary: '#6b93ff',
  onPrimary: '#0b1020',
  danger: '#ffb4b4',
  dangerBg: '#3a1d22',
  pillBg: '#26324d',
  pillText: '#a9bfff',
  warnBg: '#3a2e15',
  warnText: '#f2c46b',
  chipDescBg: '#2a3344',
  avatar: '#5a6ff0',
  shadow: '#000000',
};

export const ThemeContext = createContext<Palette>(LIGHT);
export const useTheme = () => useContext(ThemeContext);

export const GRADE_COLORS: Record<number, string> = {
  5: '#1f9d55',
  4: '#2b8fb3',
  3: '#d29a12',
  2: '#e06a1b',
  1: '#d23b3b',
};

export function avgColor(v: number | null, C: Palette): { fg: string; bg: string } {
  if (v === null) return { fg: C.muted, bg: 'transparent' };
  if (C.dark) {
    if (v >= 4.5) return { fg: '#5ad48c', bg: '#173526' };
    if (v >= 3.5) return { fg: '#62c3e6', bg: '#16303b' };
    if (v >= 2.5) return { fg: '#f0c04e', bg: '#3a3016' };
    return { fg: '#ff8a8a', bg: '#3d1e22' };
  }
  if (v >= 4.5) return { fg: '#1f9d55', bg: '#e7f6ed' };
  if (v >= 3.5) return { fg: '#2b8fb3', bg: '#e5f3f8' };
  if (v >= 2.5) return { fg: '#9a7008', bg: '#fbf3dd' };
  return { fg: '#d23b3b', bg: '#fbe7e7' };
}

export const fmtAvg = (v: number | null) => (v === null ? '–' : v.toFixed(2).replace('.', ','));

export const cardStyle = (C: Palette): ViewStyle => ({
  backgroundColor: C.card,
  borderRadius: 14,
  padding: 16,
  marginTop: 12,
  shadowColor: C.shadow,
  shadowOpacity: C.dark ? 0.3 : 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
  borderWidth: C.dark ? 1 : 0,
  borderColor: C.line,
});
