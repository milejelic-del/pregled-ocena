import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { cardStyle, Palette, ThemeChoice, useTheme } from './theme';
import ThemePicker from './ThemePicker';

interface Props {
  busy: boolean;
  error: string | null;
  canRemember: boolean;
  savedUsername: string | null;
  onLogin: (username: string, password: string, remember: boolean) => void;
  onLoginSaved: () => void;
  onForget: () => void;
  onDemo: () => void;
  onDiagnose: (username: string, password: string) => void;
  themeChoice: ThemeChoice;
  onThemeChange: (t: ThemeChoice) => void;
}

export default function LoginScreen(p: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const C = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const card = s.card;

  const submit = () => {
    p.onLogin(username, password, remember && p.canRemember);
    setPassword('');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
        <Text style={s.logo}>📘</Text>
        <Text style={s.title}>Pregled ocena</Text>
        <Text style={s.subtitle}>za moj.esdnevnik.rs</Text>

        <View style={card}>
          <Text style={s.h2}>Pristup eDnevniku</Text>
          <Text style={s.muted}>Unesite podatke kojima se prijavljujete na moj.esdnevnik.rs (nalog roditelja ili učenika).</Text>

          {p.error ? <Text style={s.alert}>{p.error}</Text> : null}

          {p.savedUsername ? (
            <View style={s.saved}>
              <Text style={s.label}>Sačuvan nalog: {p.savedUsername}</Text>
              <View style={s.row}>
                <Pressable style={[s.btn, s.btnPrimary, { flex: 1 }]} onPress={p.onLoginSaved} disabled={p.busy}>
                  <Text style={s.btnPrimaryText}>Prijavi se</Text>
                </Pressable>
                <Pressable style={[s.btn, { flex: 1 }]} onPress={p.onForget} disabled={p.busy}>
                  <Text style={s.btnText}>Obriši podatke</Text>
                </Pressable>
              </View>
              <Text style={[s.muted, { textAlign: 'center', marginTop: 12 }]}>ili unesite druge podatke</Text>
            </View>
          ) : null}

          <Text style={s.label}>Korisničko ime</Text>
          <TextInput
            style={s.input}
            placeholderTextColor={C.muted}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            accessibilityLabel="Korisničko ime"
          />
          <Text style={s.label}>Lozinka</Text>
          <TextInput
            style={s.input}
            placeholderTextColor={C.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
            accessibilityLabel="Lozinka"
          />
          {p.canRemember ? (
            <View style={[s.row, { alignItems: 'center', marginTop: 12 }]}>
              <Switch value={remember} onValueChange={setRemember} />
              <Text style={[s.small, { flex: 1 }]}>Zapamti na ovom telefonu (u zaštićenom sefu telefona)</Text>
            </View>
          ) : null}

          <Pressable style={[s.btn, s.btnPrimary, { marginTop: 16 }]} onPress={submit} disabled={p.busy}>
            {p.busy ? <ActivityIndicator color={C.onPrimary} /> : <Text style={s.btnPrimaryText}>Prijavi se i učitaj ocene</Text>}
          </Pressable>
          <Text style={[s.small, { marginTop: 14 }]}>
            Lozinka se šalje samo portalu moj.esdnevnik.rs i ne upisuje se nigde drugde.
          </Text>
        </View>

        <Pressable
          onPress={() => {
            p.onDiagnose(username, password);
            setPassword('');
          }}
          style={{ marginTop: 18 }}
          disabled={p.busy}
        >
          <Text style={s.link}>Dijagnostika (ako se ocene ne učitavaju)</Text>
        </Pressable>
        <Pressable onPress={p.onDemo} style={{ marginTop: 18 }}>
          <Text style={s.link}>Pogledaj probni prikaz sa izmišljenim podacima →</Text>
        </Pressable>
        <ThemePicker value={p.themeChoice} onChange={p.onThemeChange} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (C: Palette) =>
  StyleSheet.create({
  card: cardStyle(C),
  wrap: { padding: 18, paddingTop: 40 },
  logo: { fontSize: 44, textAlign: 'center' },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center', color: C.text, marginTop: 6 },
  subtitle: { textAlign: 'center', color: C.muted, marginBottom: 8 },
  h2: { fontSize: 20, fontWeight: '700', color: C.text, marginBottom: 6 },
  muted: { color: C.muted, fontSize: 14 },
  small: { color: C.muted, fontSize: 12 },
  label: { fontWeight: '600', color: C.text, marginTop: 14, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, color: C.text, backgroundColor: C.subtle },
  alert: { backgroundColor: C.dangerBg, color: C.danger, padding: 10, borderRadius: 10, marginTop: 12 },
  saved: { backgroundColor: C.subtle, borderRadius: 10, padding: 12, marginTop: 12 },
  row: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: { borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: C.card },
  btnText: { color: C.text, fontWeight: '600' },
  btnPrimary: { backgroundColor: C.primary, borderColor: C.primary },
  btnPrimaryText: { color: C.onPrimary, fontWeight: '700', fontSize: 16 },
  link: { color: C.primary, textAlign: 'center' },
});
