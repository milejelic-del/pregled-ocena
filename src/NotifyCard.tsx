import { ActivityIndicator, Pressable, Switch, Text, View } from 'react-native';
import { cardStyle, useTheme } from './theme';

export interface NotifyProps {
  on: boolean;
  message: string | null;
  checking: boolean;
  lastCheck: Date | null;
  onToggle: (on: boolean) => void;
  onCheckNow: () => void;
}

const hhmm = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  const today = new Date().toDateString() === d.toDateString();
  return `${today ? 'danas' : `${d.getDate()}.${d.getMonth() + 1}.`} u ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function NotifyCard(p: NotifyProps) {
  const C = useTheme();
  return (
    <View style={cardStyle(C)}>
      <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.4 }}>🔔 OBAVEŠTENJA</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>Javi mi kad stigne nova ocena</Text>
          <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
            Provera otprilike na svaka 3 sata, i kad je aplikacija zatvorena.
          </Text>
        </View>
        <Switch
          value={p.on}
          onValueChange={p.onToggle}
          trackColor={{ true: C.primary, false: C.line }}
          thumbColor="#ffffff"
          accessibilityLabel="Obaveštenja o novim ocenama"
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 12 }}>
        <Pressable
          onPress={p.onCheckNow}
          disabled={p.checking}
          style={{ borderWidth: 1, borderColor: C.primary, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, opacity: p.checking ? 0.6 : 1 }}
        >
          {p.checking ? <ActivityIndicator color={C.primary} /> : <Text style={{ color: C.primary, fontWeight: '700' }}>Proveri sada</Text>}
        </Pressable>
        {p.lastCheck ? <Text style={{ color: C.muted, fontSize: 12, flex: 1 }}>Poslednja provera: {hhmm(p.lastCheck)}</Text> : null}
      </View>
      {p.message ? <Text style={{ color: C.text, fontSize: 13, marginTop: 10 }}>{p.message}</Text> : null}
    </View>
  );
}
