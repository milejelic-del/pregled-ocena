import { Pressable, Text, View } from 'react-native';
import { ThemeChoice, useTheme } from './theme';

const OPTIONS: { key: ThemeChoice; label: string }[] = [
  { key: 'system', label: '📱 Kao telefon' },
  { key: 'light', label: '☀️ Svetli' },
  { key: 'dark', label: '🌙 Tamni' },
];

export default function ThemePicker({ value, onChange }: { value: ThemeChoice; onChange: (v: ThemeChoice) => void }) {
  const C = useTheme();
  return (
    <View style={{ marginTop: 20 }}>
      <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>IZGLED</Text>
      <View style={{ flexDirection: 'row', backgroundColor: C.subtle, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: C.line }}>
        {OPTIONS.map((o) => {
          const active = o.key === value;
          return (
            <Pressable
              key={o.key}
              onPress={() => onChange(o.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={{ flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center', backgroundColor: active ? C.primary : 'transparent' }}
            >
              <Text style={{ color: active ? C.onPrimary : C.text, fontSize: 13, fontWeight: active ? '700' : '500' }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
