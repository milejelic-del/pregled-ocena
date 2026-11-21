import { ActivityIndicator, Text, View } from 'react-native';
import { CalEvent, isTest, PageBlock } from './html';
import { cardStyle, Palette, useTheme } from './theme';

export type SectionKey = 'grades' | 'absents' | 'behavior' | 'tests';
export interface SectionState {
  loading: boolean;
  blocks: PageBlock[] | null;
  events?: CalEvent[];
  error: string | null;
}

/** Boja za red prema rečima koje portal koristi (ćirilica i latinica). */
function tone(text: string, C: Palette): string | null {
  const t = text.toLowerCase();
  if (/неоправдан|neopravdan/.test(t)) return C.dark ? '#f87171' : '#c62828';
  if (/нерегулис|neregulis|на чекању|na čekanju|чека|čeka/.test(t)) return C.dark ? '#fbbf24' : '#b26a00';
  if (/оправдан|opravdan|примерно|primerno/.test(t)) return C.dark ? '#4ade80' : '#1e8e3e';
  if (/укор|ukor|опомен|opomen|мера|mera|незадовољ|nezadovolj/.test(t)) return C.dark ? '#f87171' : '#c62828';
  return null;
}

function counts(lines: string[]) {
  let ok = 0, bad = 0, wait = 0;
  for (const l of lines) {
    const t = l.toLowerCase();
    if (/неоправдан|neopravdan/.test(t)) bad++;
    else if (/нерегулис|neregulis|чека|čeka/.test(t)) wait++;
    else if (/оправдан|opravdan/.test(t)) ok++;
  }
  return { ok, bad, wait };
}

const DAYS = ['nedelja', 'ponedeljak', 'utorak', 'sreda', 'četvrtak', 'petak', 'subota'];

function dayLabel(iso: string, now = new Date()): { main: string; sub: string; soon: boolean } {
  const d = new Date(iso + 'T12:00:00');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  const date = `${d.getDate()}.${d.getMonth() + 1}.`;
  const main = diff === 0 ? 'Danas' : diff === 1 ? 'Sutra' : diff === 2 ? 'Prekosutra' : `${DAYS[d.getDay()][0].toUpperCase()}${DAYS[d.getDay()].slice(1)}`;
  const sub = diff > 2 ? `${date} · za ${diff} dana` : date;
  return { main, sub, soon: diff <= 2 };
}

function TestsView({ state }: { state: SectionState }) {
  const C = useTheme();
  const card = cardStyle(C);
  const todayIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const all = state.events ?? [];
  const upcoming = all.filter((e) => e.date >= todayIso);
  const tests = upcoming.filter((e) => isTest(e.title));
  const list = tests.length ? tests : upcoming;
  const byDate = new Map<string, CalEvent[]>();
  for (const e of list) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const blocks = (state.blocks ?? []).filter((b) => b.lines.length);
  return (
    <View>
      <View style={card}>
        <Text style={{ color: C.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.4 }}>📝 NAJAVLJENE PROVERE</Text>
        {byDate.size === 0 ? (
          <Text style={{ color: C.muted, marginTop: 8 }}>Nema najavljenih provera u narednom periodu. 🎉</Text>
        ) : (
          [...byDate.entries()].map(([date, evs]) => {
            const l = dayLabel(date);
            return (
              <View key={date} style={{ flexDirection: 'row', paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.divider, marginTop: 6 }}>
                <View style={{ width: 92 }}>
                  <Text style={{ color: l.soon ? C.danger : C.text, fontWeight: '800', fontSize: 15 }}>{l.main}</Text>
                  <Text style={{ color: C.muted, fontSize: 12 }}>{l.sub}</Text>
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  {evs.map((e, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, marginRight: 8, backgroundColor: e.color || C.primary }} />
                      <Text style={{ flex: 1, color: C.text, fontSize: 14, lineHeight: 20 }}>{e.title}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })
        )}
        {!tests.length && upcoming.length ? (
          <Text style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>Prikazani su svi događaji iz kalendara škole.</Text>
        ) : null}
      </View>
      {blocks.map((b, i) => (
        <View key={i} style={card}>
          {b.title ? <Text style={{ color: C.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' }}>{b.title}</Text> : null}
          {b.lines.map((line, j) => (
            <Text key={j} style={{ color: C.text, fontSize: 14, lineHeight: 20, paddingVertical: 6, borderTopWidth: j ? 1 : 0, borderTopColor: C.divider }}>
              {line}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export default function SectionView({ kind, state }: { kind: 'absents' | 'behavior' | 'tests'; state: SectionState }) {
  const C = useTheme();
  const card = cardStyle(C);
  if (state.loading && !state.blocks) {
    return (
      <View style={[card, { alignItems: 'center', paddingVertical: 30 }]}>
        <ActivityIndicator color={C.primary} />
        <Text style={{ color: C.muted, marginTop: 8 }}>Učitavam sa portala…</Text>
      </View>
    );
  }
  if (state.error) {
    return (
      <View style={[card, { backgroundColor: C.dangerBg }]}>
        <Text style={{ color: C.danger, fontWeight: '600' }}>{state.error}</Text>
      </View>
    );
  }
  if (kind === 'tests') return <TestsView state={state} />;
  const blocks = state.blocks ?? [];
  if (!blocks.length || blocks.every((b) => !b.lines.length && !b.summary.length)) {
    return (
      <View style={card}>
        <Text style={{ color: C.muted }}>
          {kind === 'absents' ? 'Nema upisanih izostanaka za ovaj razred. 🎉' : 'Za ovaj razred još nema podataka o vladanju.'}
        </Text>
      </View>
    );
  }
  const all = blocks.flatMap((b) => b.lines);
  const c = kind === 'absents' ? counts(all) : null;
  return (
    <View>
      {c && c.ok + c.bad + c.wait > 0 ? (
        <View style={[card, { flexDirection: 'row', justifyContent: 'space-around' }]}>
          {[
            [c.ok, 'opravdano', C.dark ? '#4ade80' : '#1e8e3e'],
            [c.bad, 'neopravdano', C.dark ? '#f87171' : '#c62828'],
            [c.wait, 'na čekanju', C.dark ? '#fbbf24' : '#b26a00'],
          ].map(([n, label, color]) => (
            <View key={label as string} style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 26, fontWeight: '800', color: color as string }}>{n as number}</Text>
              <Text style={{ color: C.muted, fontSize: 12 }}>{label as string}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {blocks.map((b, i) => (
        <View key={i} style={card}>
          {b.title ? (
            <Text style={{ color: C.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' }}>{b.title}</Text>
          ) : null}
          {b.summary.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {b.summary.map((s, j) => (
                <Text
                  key={j}
                  style={{ backgroundColor: C.pillBg, color: tone(s, C) ?? C.pillText, fontWeight: '700', fontSize: 13, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' }}
                >
                  {s}
                </Text>
              ))}
            </View>
          ) : null}
          {!b.lines.length && !b.summary.length ? <Text style={{ color: C.muted, marginTop: 6 }}>Nema upisanih podataka.</Text> : null}
          {b.lines.map((l, j) => {
            const color = tone(l, C);
            return (
              <View key={j} style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderTopWidth: j ? 1 : 0, borderTopColor: C.divider, marginTop: j ? 0 : 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, marginRight: 10, backgroundColor: color ?? C.line }} />
                <Text style={{ flex: 1, color: C.text, fontSize: 14, lineHeight: 20 }}>{l}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}
