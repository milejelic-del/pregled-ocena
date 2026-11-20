import { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Subject, trend, TrendMode } from './grades';
import { avgColor, cardStyle, fmtAvg, GRADE_COLORS, useTheme } from './theme';

const H = 210;
const PAD = { top: 22, right: 12, bottom: 34, left: 30 };

function colorFor(v: number) {
  return GRADE_COLORS[Math.min(5, Math.max(1, Math.round(v)))];
}

export default function TrendChart({ subjects }: { subjects: Subject[] }) {
  const C = useTheme();
  const [mode, setMode] = useState<TrendMode>('month');
  const [subject, setSubject] = useState<string | null>(null);
  const [width, setWidth] = useState(320);

  const numeric = subjects.filter((s) => s.numeric && s.allGrades.some((g) => g.value));
  const grades = useMemo(
    () => (subject ? numeric.find((s) => s.name === subject)?.allGrades ?? [] : numeric.flatMap((s) => s.allGrades)),
    [subject, subjects], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const points = useMemo(() => trend(grades, mode), [grades, mode]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const plotW = Math.max(10, width - PAD.left - PAD.right);
  const plotH = H - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + plotH - ((v - 1) / 4) * plotH;
  const step = points.length ? plotW / points.length : plotW;
  const barW = Math.min(34, step * 0.55);
  const cx = (i: number) => PAD.left + step * i + step / 2;
  const line = points
    .map((p, i) => (p.cumulative ? `${i === 0 ? 'M' : 'L'}${cx(i).toFixed(1)},${y(p.cumulative).toFixed(1)}` : ''))
    .join(' ');

  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const delta = last?.average && prev?.average ? Math.round((last.average - prev.average) * 100) / 100 : null;

  const chip = (active: boolean) => ({
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: active ? C.primary : C.line,
    backgroundColor: active ? C.primary : C.card,
    marginRight: 6,
  });
  const chipText = (active: boolean) => ({ color: active ? C.onPrimary : C.text, fontSize: 13, fontWeight: active ? ('700' as const) : ('500' as const) });

  return (
    <View style={cardStyle(C)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.4 }}>PROSEK KROZ VREME</Text>
        <View style={{ flexDirection: 'row' }}>
          {(['month', 'quarter'] as const).map((m) => (
            <Pressable key={m} onPress={() => setMode(m)} style={chip(mode === m)}>
              <Text style={chipText(mode === m)}>{m === 'month' ? 'Meseci' : 'Tromesečja'}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
        <Pressable onPress={() => setSubject(null)} style={chip(subject === null)}>
          <Text style={chipText(subject === null)}>Svi predmeti</Text>
        </Pressable>
        {numeric.map((s) => (
          <Pressable key={s.name} onPress={() => setSubject(s.name)} style={chip(subject === s.name)}>
            <Text style={chipText(subject === s.name)} numberOfLines={1}>
              {s.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {points.length === 0 ? (
        <Text style={{ color: C.muted, marginTop: 16 }}>Još nema dovoljno ocena za grafikon.</Text>
      ) : (
        <>
          {last ? (
            <View style={{ marginTop: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={{ color: C.text, fontSize: 26, fontWeight: '800' }}>{fmtAvg(last.cumulative)}</Text>
                <Text style={{ color: C.muted, fontSize: 13 }}>ukupan prosek</Text>
              </View>
              {delta !== null && delta !== 0 ? (
                <Text style={{ color: delta > 0 ? avgColor(5, C).fg : avgColor(1, C).fg, fontSize: 13, fontWeight: '700', marginTop: 2 }}>
                  {delta > 0 ? '▲' : '▼'} {fmtAvg(Math.abs(delta))} {mode === 'month' ? 'u odnosu na prošli mesec' : 'u odnosu na prošlo tromesečje'}
                </Text>
              ) : null}
            </View>
          ) : null}
          <View onLayout={onLayout} style={{ marginTop: 6 }}>
            <Svg width={width} height={H}>
              {[1, 2, 3, 4, 5].map((v) => (
                <G key={v}>
                  <Line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke={C.line} strokeWidth={1} strokeDasharray={v === 1 ? undefined : '3,4'} />
                  <SvgText x={PAD.left - 8} y={y(v) + 4} fontSize={11} fill={C.muted} textAnchor="end">
                    {v}
                  </SvgText>
                </G>
              ))}
              {points.map((p, i) =>
                p.average ? (
                  <G key={p.key}>
                    <Rect
                      x={cx(i) - barW / 2}
                      y={y(p.average)}
                      width={barW}
                      height={Math.max(2, y(1) - y(p.average))}
                      rx={6}
                      fill={colorFor(p.average)}
                      opacity={0.85}
                    />
                    <SvgText
                      x={cx(i)}
                      y={y(1) - y(p.average) > 22 ? y(1) - 8 : y(p.average) - 6}
                      fontSize={10}
                      fontWeight="700"
                      fill={y(1) - y(p.average) > 22 ? '#ffffff' : C.text}
                      textAnchor="middle"
                    >
                      {p.average.toFixed(1).replace('.', ',')}
                    </SvgText>
                    <SvgText x={cx(i)} y={H - PAD.bottom + 16} fontSize={11} fill={C.muted} textAnchor="middle">
                      {p.label}
                    </SvgText>
                    <SvgText x={cx(i)} y={H - PAD.bottom + 29} fontSize={9} fill={C.muted} textAnchor="middle">
                      {p.count} oc.
                    </SvgText>
                  </G>
                ) : null,
              )}
              <Path d={line} stroke={C.text} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
              {points.map((p, i) =>
                p.cumulative ? <Circle key={p.key + 'c'} cx={cx(i)} cy={y(p.cumulative)} r={4} fill={C.card} stroke={C.text} strokeWidth={2} /> : null,
              )}
            </Svg>
          </View>
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: GRADE_COLORS[4] }} />
              <Text style={{ color: C.muted, fontSize: 12 }}>prosek u periodu</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: C.text }} />
              <Text style={{ color: C.muted, fontSize: 12 }}>ukupan prosek do tada</Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}
