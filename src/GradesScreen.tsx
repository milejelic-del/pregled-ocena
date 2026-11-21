import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { calculate, formatDate, GradeEntry, isRecent, Overview, PART_NAMES, PartSummary, Subject } from './grades';
import TrendChart from './TrendChart';
import { Student, StudentClass } from './portal';
import { avgColor, cardStyle, fmtAvg, GRADE_COLORS, Palette, ThemeChoice, useTheme } from './theme';
import ThemePicker from './ThemePicker';
import NotifyCard, { NotifyProps } from './NotifyCard';
import SectionView, { SectionKey, SectionState } from './SectionView';

interface Props {
  students: Student[];
  student: Student;
  selected: StudentClass;
  currentYear: StudentClass[];
  otherYears: StudentClass[];
  isCurrent: boolean;
  subjects: Subject[];
  summary: Overview;
  demo: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onSelectStudent: (id: number) => void;
  onSelectClass: (c: StudentClass) => void;
  onLogout: () => void;
  themeChoice: ThemeChoice;
  onThemeChange: (t: ThemeChoice) => void;
  notify: NotifyProps;
  error: string | null;
  section: SectionKey;
  onSection: (s: SectionKey) => void;
  sectionState: SectionState;
  onShare: () => void;
  onBackToCurrent: () => void;
  security: { available: boolean; on: boolean; onToggle: (on: boolean) => void };
}

function Chip({ g, small }: { g: GradeEntry; small?: boolean }) {
  const C = useTheme();
  const st = useMemo(() => makeStyles(C), [C]);
  const card = st.card;
  if (!g.value)
    return (
      <View style={[st.chip, st.chipDesc]}>
        <Text style={st.chipDescText}>{g.label}</Text>
      </View>
    );
  return (
    <View style={[st.chip, small && st.chipSm, { backgroundColor: GRADE_COLORS[g.value] }]}>
      <Text style={[st.chipText, small && { fontSize: 12 }]}>{g.value}</Text>
    </View>
  );
}

function Avg({ v, big }: { v: number | null; big?: boolean }) {
  const C = useTheme();
  const st = useMemo(() => makeStyles(C), [C]);
  const card = st.card;
  const c = avgColor(v, C);
  return (
    <View style={[st.avg, { backgroundColor: c.bg }, big && { paddingHorizontal: 12, paddingVertical: 4 }]}>
      <Text style={[st.avgText, { color: c.fg }, big && { fontSize: 28 }]}>{fmtAvg(v)}</Text>
    </View>
  );
}

function Final({ p }: { p: PartSummary | null }) {
  const C = useTheme();
  const st = useMemo(() => makeStyles(C), [C]);
  const card = st.card;
  if (p?.finalValue)
    return (
      <View style={[st.final, { backgroundColor: GRADE_COLORS[p.finalValue] }]}>
        <Text style={st.finalText}>{p.finalValue}</Text>
      </View>
    );
  if (p?.finalLabel)
    return (
      <View style={[st.chip, st.chipDesc]}>
        <Text style={st.chipDescText}>{p.finalLabel}</Text>
      </View>
    );
  return <Text style={st.muted}>–</Text>;
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function CalcBox({ s }: { s: Subject }) {
  const C = useTheme();
  const st = useMemo(() => makeStyles(C), [C]);
  const c = calculate(s);
  if (!c) return null;
  const now = c.plans.find((p) => p.reached)?.target ?? 1;
  const goals = c.plans.filter((p) => !p.reached).reverse().slice(0, 2); // najbliži ciljevi
  const n = (x: number, w: [string, string, string]) => `${x} ${plural(x, ...w)}`;
  return (
    <View style={st.calc}>
      <Text style={st.calcHead}>🎯 ŠTA TREBA · {PART_NAMES[c.partKey].toLowerCase()}</Text>
      <Text style={st.detailMain}>
        Sada: prosek <Text style={{ fontWeight: '800', color: avgColor(c.average, C).fg }}>{fmtAvg(c.average)}</Text> iz {n(c.count, ['ocene', 'ocene', 'ocena'])}, to je ocena{' '}
        <Text style={{ fontWeight: '800' }}>{now}</Text>.
      </Text>
      {goals.length === 0 ? (
        <Text style={[st.small, { marginTop: 4 }]}>Ocena 5 je obezbeđena. Bravo! 🎉</Text>
      ) : (
        goals.map((g) => (
          <Text key={g.target} style={[st.small, { marginTop: 4 }]}>
            Za <Text style={{ fontWeight: '800' }}>{g.target}</Text> (prosek {fmtAvg(g.threshold)}):{' '}
            {g.fives ? n(g.fives, ['petica', 'petice', 'petica']) : ''}
            {g.fours ? ` ili ${n(g.fours, ['četvorka', 'četvorke', 'četvorki'])}` : ''}
            {Math.max(g.fives ?? 0, g.fours ?? 0) > 1 ? ' zaredom' : ''}
          </Text>
        ))
      )}
      <Text style={[st.small, st.muted, { marginTop: 6 }]}>
        Sledeća ocena: 5 → {fmtAvg(c.ifFive)} · 2 → {fmtAvg(c.ifTwo)} · 1 → {fmtAvg(c.ifOne)}
      </Text>
    </View>
  );
}

function SubjectCard({ s }: { s: Subject }) {
  const C = useTheme();
  const st = useMemo(() => makeStyles(C), [C]);
  const card = st.card;
  const [open, setOpen] = useState(false);
  const accent = s.average ? GRADE_COLORS[Math.min(5, Math.max(1, Math.round(s.average)))] : C.line;
  const newCount = s.allGrades.filter((g) => isRecent(g)).length;
  return (
    <Pressable style={[card, st.subject, { borderLeftWidth: 5, borderLeftColor: accent }]} onPress={() => setOpen(!open)} accessibilityRole="button">
      <View style={st.subjHead}>
        <View style={{ flex: 1 }}>
          <Text style={st.subjName}>
            {s.name}
            {newCount ? <Text style={st.newBadge}>{`  NOVO ${newCount}`}</Text> : null}
          </Text>
          {s.average ? (
            <View style={st.progress}>
              <View style={[st.progressFill, { width: `${((s.average - 1) / 4) * 100}%`, backgroundColor: accent }]} />
            </View>
          ) : null}
        </View>
        {s.final ? (
          <View style={st.subjFinal}>
            <Text style={st.tiny}>ZAKLJ.</Text>
            <Final p={s.final} />
          </View>
        ) : null}
        <Avg v={s.average} />
      </View>
      {(['1', '2'] as const).map((k) => {
        const p = s.parts[k];
        return (
          <View key={k} style={st.partRow}>
            <Text style={st.partLabel}>{k === '1' ? 'I' : 'II'}</Text>
            <View style={st.chips}>
              {p.grades.length ? p.grades.map((g, i) => <Chip key={i} g={g} />) : <Text style={st.muted}>–</Text>}
            </View>
            <Text style={[st.small, { color: avgColor(p.average, C).fg }]}>{fmtAvg(p.average)}</Text>
          </View>
        );
      })}
      {open ? (
        <View style={st.details}>
          <CalcBox s={s} />
          {(['1', '2'] as const).map((k) =>
            s.parts[k].grades.length ? (
              <View key={k}>
                <Text style={st.detailsHead}>
                  {PART_NAMES[k]}
                  {s.parts[k].finalValue || s.parts[k].finalLabel
                    ? ` · zaključna: ${s.parts[k].finalValue ?? s.parts[k].finalLabel}`
                    : ''}
                </Text>
                {[...s.parts[k].grades].reverse().map((g, i) => (
                  <View key={i} style={st.detailRow}>
                    <Chip g={g} small />
                    <View style={{ flex: 1 }}>
                      <Text style={st.detailMain}>
                        {g.category || 'ocena'} <Text style={st.muted}>· {formatDate(g.date)}</Text>
                      </Text>
                      {g.value ? <Text style={st.small}>{g.label}</Text> : null}
                      {g.note ? <Text style={st.note}>{g.note}</Text> : null}
                    </View>
                  </View>
                ))}
              </View>
            ) : null,
          )}
          {!s.allGrades.length ? <Text style={st.muted}>Još nema ocena iz ovog predmeta.</Text> : null}
        </View>
      ) : (
        <Text style={st.hint}>Dodirnite za detalje ▾</Text>
      )}
    </Pressable>
  );
}

export default function GradesScreen(p: Props) {
  const C = useTheme();
  const st = useMemo(() => makeStyles(C), [C]);
  const card = st.card;
  const [showOlder, setShowOlder] = useState(false);
  const [sort, setSort] = useState<'order' | 'best' | 'worst' | 'latest'>('order');
  const { summary } = p;
  const sorted = useMemo(() => {
    const list = [...p.subjects];
    const avg = (x: Subject) => x.average ?? (sort === 'best' ? -1 : 99);
    if (sort === 'best') list.sort((a, b) => avg(b) - avg(a));
    if (sort === 'worst') list.sort((a, b) => avg(a) - avg(b));
    if (sort === 'latest') {
      const lastDate = (x: Subject) => x.allGrades.reduce((m, g) => (g.date > m ? g.date : m), '');
      list.sort((a, b) => lastDate(b).localeCompare(lastDate(a)));
    }
    return list;
  }, [p.subjects, sort]);
  const maxCount = Math.max(1, ...Object.values(summary.distribution));
  const initials = p.student.fullName
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <ScrollView
      contentContainerStyle={st.wrap}
      refreshControl={<RefreshControl refreshing={p.refreshing} onRefresh={p.onRefresh} />}
    >
      <View style={st.topbar}>
        <Text style={st.brand}>📘 Pregled ocena</Text>
        {p.demo ? <Text style={st.pill}>PROBNI PRIKAZ</Text> : null}
        {p.subjects.length ? (
          <Pressable onPress={p.onShare} style={st.logout} accessibilityLabel="Podeli pregled ocena">
            <Text style={st.logoutText}>Podeli</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={p.onLogout} style={st.logout}>
          <Text style={st.logoutText}>{p.demo ? 'Izlaz' : 'Odjava'}</Text>
        </Pressable>
      </View>

      <View style={[card, st.heroCard]}>
        <View style={st.hero}>
          <View style={st.avatar}>
            <Text style={st.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.heroName}>{p.student.fullName}</Text>
            <Text style={st.heroSub}>
              {p.selected.schoolName} · razred <Text style={{ fontWeight: '800' }}>{p.selected.section}</Text> · {p.selected.yearLabel}
            </Text>
            {!p.isCurrent ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <Text style={[st.warnPill, { marginTop: 0 }]}>ranija godina</Text>
                <Pressable onPress={p.onBackToCurrent} style={st.backBtn}>
                  <Text style={st.backBtnText}>↩ Tekući razred</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
        {p.subjects.length ? (
          <View style={st.heroStats}>
            <View style={st.heroStat}>
              <Text style={st.heroValue}>{fmtAvg(summary.overallAverage)}</Text>
              <Text style={st.heroLabel}>prosek</Text>
            </View>
            <View style={st.heroDivider} />
            <View style={st.heroStat}>
              <Text style={st.heroValue}>{summary.gradeCount}</Text>
              <Text style={st.heroLabel}>ocena</Text>
            </View>
            <View style={st.heroDivider} />
            <View style={st.heroStat}>
              <Text style={st.heroValue}>{summary.finalAverage ? fmtAvg(summary.finalAverage) : '–'}</Text>
              <Text style={st.heroLabel}>zaključne</Text>
            </View>
          </View>
        ) : null}
      </View>

      {p.students.length > 1 ? (
        <View style={st.tabs}>
          {p.students.map((s) => (
            <Pressable key={s.id} onPress={() => p.onSelectStudent(s.id)} style={[st.tab, s.id === p.student.id && st.tabActive]}>
              <Text style={[st.tabText, s.id === p.student.id && st.tabTextActive]}>{s.fullName}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {p.currentYear.length > 1 || p.otherYears.length ? (
        <View style={st.tabs}>
          {p.currentYear.map((c) => {
            const active = c.studentClassId === p.selected.studentClassId;
            return (
              <Pressable key={c.studentClassId} onPress={() => p.onSelectClass(c)} style={[st.tab, active && st.tabActive]}>
                <Text style={[st.tabText, active && st.tabTextActive]} numberOfLines={1}>
                  {c.schoolName} · {c.section}
                </Text>
              </Pressable>
            );
          })}
          {p.otherYears.length ? (
            <Pressable onPress={() => setShowOlder(!showOlder)} style={st.tab}>
              <Text style={st.tabText}>Ranije godine {showOlder ? '▴' : '▾'}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {showOlder ? (
        <View style={card}>
          {p.otherYears.map((c) => (
            <Pressable
              key={c.studentClassId}
              onPress={() => {
                setShowOlder(false);
                p.onSelectClass(c);
              }}
              style={st.olderRow}
            >
              <Text style={st.olderText}>
                {c.yearLabel} · {c.section} · {c.schoolName}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {p.error ? (
        <View style={[card, { backgroundColor: C.dangerBg }]}>
          <Text style={{ color: C.danger, fontWeight: '600' }}>{p.error}</Text>
        </View>
      ) : null}

      <View style={st.segment}>
        {(
          [
            ['grades', '📚', 'Ocene'],
            ['tests', '📝', 'Provere'],
            ['absents', '🕒', 'Izostanci'],
            ['behavior', '🏅', 'Vladanje'],
          ] as const
        ).map(([k, icon, label]) => (
          <Pressable key={k} onPress={() => p.onSection(k)} style={[st.segBtn, p.section === k && st.segBtnActive]} accessibilityRole="tab" accessibilityLabel={label}>
            <Text style={{ fontSize: 18 }}>{icon}</Text>
            <Text style={[st.segText, p.section === k && st.segTextActive]} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {p.section !== 'grades' ? (
        <SectionView kind={p.section} state={p.sectionState} />
      ) : !p.subjects.length ? (
        <View style={card}>
          <Text style={st.muted}>Za ovaj razred još nema upisanih ocena.</Text>
        </View>
      ) : (
        <>
          <View style={st.statsRow}>
            <View style={[card, st.stat]}>
              <Text style={st.statLabel}>RASPODELA OCENA</Text>
              {[5, 4, 3, 2, 1].map((n) => (
                <View key={n} style={st.distRow}>
                  <View style={[st.chip, st.chipSm, { backgroundColor: GRADE_COLORS[n] }]}>
                    <Text style={[st.chipText, { fontSize: 12 }]}>{n}</Text>
                  </View>
                  <View style={st.bar}>
                    <View style={[st.barFill, { width: `${(summary.distribution[n] / maxCount) * 100}%`, backgroundColor: GRADE_COLORS[n] }]} />
                  </View>
                  <Text style={st.small}>{summary.distribution[n]}</Text>
                </View>
              ))}
            </View>
          </View>

          {summary.atRisk.length ? (
            <View style={[card, st.warn]}>
              <Text style={st.statLabel}>TREBA OBRATITI PAŽNJU</Text>
              {summary.atRisk.map((n) => (
                <Text key={n} style={st.warnItem}>
                  ⚠️ {n}
                </Text>
              ))}
              <Text style={st.small}>Prosek ispod 2,50</Text>
            </View>
          ) : null}

          <View style={card}>
            <Text style={st.statLabel}>POSLEDNJE OCENE</Text>
            {summary.recent.map(({ grade, subject }, i) => (
              <View key={i} style={st.recentRow}>
                <Chip g={grade} small />
                <Text style={st.recentName} numberOfLines={1}>
                  {subject}
                </Text>
                {isRecent(grade) ? <Text style={st.newBadge}>NOVO</Text> : null}
                <Text style={st.small}>{formatDate(grade.date)}</Text>
              </View>
            ))}
          </View>

          <Text style={st.section}>Ocene po predmetima</Text>
          <Text style={[st.small, { marginBottom: 2 }]}>I = prvo, II = drugo polugodište · desno je prosek</Text>
          <View style={st.tabs}>
            {(
              [
                ['order', 'Po redu'],
                ['best', 'Najbolji'],
                ['worst', 'Najslabiji'],
                ['latest', 'Najnovije'],
              ] as const
            ).map(([k, label]) => (
              <Pressable key={k} onPress={() => setSort(k)} style={[st.tab, sort === k && st.tabActive]}>
                <Text style={[st.tabText, sort === k && st.tabTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {sorted.map((s) => (
            <SubjectCard key={s.name} s={s} />
          ))}
        </>
      )}
      {p.section === 'grades' && p.subjects.length ? <TrendChart subjects={p.subjects} /> : null}
      {!p.demo ? <NotifyCard {...p.notify} /> : null}
      {!p.demo && p.security.available ? (
        <View style={[card, { flexDirection: 'row', alignItems: 'center' }]}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={st.statLabel}>🔒 ZAŠTITA</Text>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '600', marginTop: 6 }}>Otvaranje otiskom prsta</Text>
            <Text style={st.small}>Pri pokretanju aplikacija traži otisak prsta (ili otključavanje telefona).</Text>
          </View>
          <Switch value={p.security.on} onValueChange={p.security.onToggle} trackColor={{ true: C.primary, false: C.line }} thumbColor="#ffffff" />
        </View>
      ) : null}
      <ThemePicker value={p.themeChoice} onChange={p.onThemeChange} />
      <Text style={st.footer}>Podaci se preuzimaju sa moj.esdnevnik.rs i ostaju samo na ovom telefonu.{'\n'}Povucite nadole za osvežavanje.</Text>
      <Text style={st.signature}>by Mile Jelić</Text>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
  card: cardStyle(C),
  signature: { alignSelf: 'flex-end', color: C.muted, fontSize: 11, fontStyle: 'italic', opacity: 0.8, marginTop: 6 },
  segment: { flexDirection: 'row', backgroundColor: C.card, borderRadius: 14, padding: 4, marginTop: 12, borderWidth: 1, borderColor: C.line },
  segBtn: { flex: 1, paddingVertical: 7, borderRadius: 10, alignItems: 'center' },
  segBtnActive: { backgroundColor: C.primary },
  segText: { color: C.text, fontWeight: '600', fontSize: 12, marginTop: 1 },
  segTextActive: { color: C.onPrimary, fontWeight: '800' },
  backBtn: { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  backBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 12 },
  wrap: { padding: 14, paddingBottom: 40 },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { fontSize: 18, fontWeight: '700', color: C.text, flex: 1 },
  pill: { backgroundColor: C.pillBg, color: C.pillText, fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  logout: { borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.card },
  logoutText: { color: C.text, fontSize: 13 },
  heroCard: { backgroundColor: C.primary, borderWidth: 0 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroName: { fontSize: 21, fontWeight: '800', color: C.onPrimary },
  heroSub: { color: C.onPrimary, opacity: 0.85, fontSize: 14, marginTop: 2 },
  heroStats: { flexDirection: 'row', marginTop: 16, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 12, paddingVertical: 10 },
  heroStat: { flex: 1, alignItems: 'center' },
  heroValue: { color: C.onPrimary, fontSize: 22, fontWeight: '800' },
  heroLabel: { color: C.onPrimary, opacity: 0.8, fontSize: 12, marginTop: 2 },
  heroDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginVertical: 4 },
  newBadge: { color: '#1f9d55', fontSize: 11, fontWeight: '800' },
  progress: { height: 4, backgroundColor: C.subtle, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.onPrimary, fontWeight: '700', fontSize: 18 },
  name: { fontSize: 20, fontWeight: '700', color: C.text, marginBottom: 2 },
  muted: { color: C.muted, fontSize: 14 },
  small: { color: C.muted, fontSize: 12 },
  tiny: { color: C.muted, fontSize: 9, fontWeight: '700' },
  warnPill: { alignSelf: 'flex-start', backgroundColor: C.warnBg, color: C.warnText, fontSize: 12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, marginTop: 4, overflow: 'hidden' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  tab: { borderWidth: 1, borderColor: C.line, backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, maxWidth: '100%' },
  tabActive: { backgroundColor: C.primary, borderColor: C.primary },
  tabText: { color: C.text, fontSize: 13 },
  tabTextActive: { color: C.onPrimary, fontWeight: '600' },
  olderRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.divider },
  olderText: { color: C.text },
  statsRow: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1 },
  statLabel: { color: C.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  bar: { flex: 1, height: 7, backgroundColor: C.bg, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  warn: { borderLeftWidth: 4, borderLeftColor: '#e06a1b' },
  warnItem: { color: C.text, fontSize: 15, marginTop: 6 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  recentName: { flex: 1, color: C.text, fontSize: 14 },
  section: { fontSize: 18, fontWeight: '700', color: C.text, marginTop: 22 },
  subject: { paddingVertical: 12 },
  subjHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  subjName: { flex: 1, fontSize: 16, fontWeight: '700', color: C.text },
  subjFinal: { alignItems: 'center' },
  partRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  partLabel: { width: 18, color: C.muted, fontWeight: '700', fontSize: 12 },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  chip: { minWidth: 28, height: 28, paddingHorizontal: 6, borderRadius: 7, alignItems: 'center', justifyContent: 'center', margin: 2 },
  chipSm: { minWidth: 22, height: 22, margin: 0 },
  chipText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  chipDesc: { backgroundColor: C.chipDescBg },
  chipDescText: { color: C.text, fontSize: 12 },
  avg: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  avgText: { fontWeight: '700', fontSize: 14 },
  final: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  finalText: { color: '#fff', fontWeight: '800' },
  hint: { color: C.muted, fontSize: 11, textAlign: 'right', marginTop: 4 },
  details: { marginTop: 10, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6 },
  detailsHead: { color: C.muted, fontWeight: '700', fontSize: 13, marginTop: 10, marginBottom: 2 },
  calc: { backgroundColor: C.pillBg, borderRadius: 12, padding: 12, marginTop: 8 },
  calcHead: { color: C.pillText, fontWeight: '800', fontSize: 12, letterSpacing: 0.4, marginBottom: 4 },
  detailRow: { flexDirection: 'row', gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.divider, alignItems: 'flex-start' },
  detailMain: { color: C.text, fontSize: 14 },
  note: { color: C.text, fontSize: 13, fontStyle: 'italic', marginTop: 2 },
  footer: { color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 24 },
});
