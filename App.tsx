import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Share, Text, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import demoData from './src/demoData.json';
import { overview, parseGrades, shareText, Subject } from './src/grades';
import GradesScreen from './src/GradesScreen';
import LoginScreen from './src/LoginScreen';
import { currentClass, LoginError, parseStudents, PortalClient, PortalError, Student, StudentClass } from './src/portal';
import * as storage from './src/storage';
import * as bg from './src/background';
import { biometricAvailable, unlock } from './src/biometric';
import type { CalEvent, PageBlock } from './src/html';
import type { SectionKey, SectionState } from './src/SectionView';

function demoTests(): { events: CalEvent[]; blocks: PageBlock[] } {
  const d = (n: number) => new Date(Date.now() + n * 86400000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return {
    events: [
      { date: d(1), title: 'Писмени задатак - Математика', color: '#e53935' },
      { date: d(4), title: 'Тест - Енглески језик', color: '#1e88e5' },
      { date: d(4), title: 'Контролни задатак - Историја', color: '#e53935' },
      { date: d(9), title: 'Контролни задатак - Физика', color: '#e53935' },
    ],
    blocks: [],
  };
}

const DEMO_SECTIONS: Record<'absents' | 'behavior', PageBlock[]> = {
  absents: [
    {
      title: 'прво полугодиште',
      summary: ['Оправдано: 3', 'Неоправдано: 1'],
      lines: [
        'Математика · 12. 11. 2025. · 2. час · оправдан',
        'Физика · 12. 11. 2025. · 3. час · оправдан',
        'Енглески језик · 12. 11. 2025. · 4. час · оправдан',
        'Историја · 03. 12. 2025. · 5. час · неоправдан',
      ],
    },
  ],
  behavior: [{ title: 'Владање', summary: [], lines: ['Прво полугодиште · примерно (5)', 'Друго полугодиште · -'] }],
};
import { DARK, LIGHT, ThemeChoice, ThemeContext } from './src/theme';

type Mode = 'starting' | 'login' | 'grades';

export default function App() {
  const client = useRef(new PortalClient());
  const [mode, setMode] = useState<Mode>('starting');
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canRemember, setCanRemember] = useState(false);
  const [savedUsername, setSavedUsername] = useState<string | null>(null);

  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [selected, setSelected] = useState<StudentClass | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [diag, setDiag] = useState<string | null>(null);
  const systemScheme = useColorScheme();
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>('system');
  const C = (themeChoice === 'system' ? systemScheme === 'dark' : themeChoice === 'dark') ? DARK : LIGHT;
  useEffect(() => {
    storage.loadTheme().then((t) => t && setThemeChoice(t));
  }, []);
  const [section, setSection] = useState<SectionKey>('grades');
  const [sectionState, setSectionState] = useState<SectionState>({ loading: false, blocks: null, error: null });
  const sectionCache = useRef(new Map<string, PageBlock[]>());
  const testsCache = useRef(new Map<string, { events: CalEvent[]; blocks: PageBlock[] }>());
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioOn, setBioOn] = useState(false);
  const [notifyOn, setNotifyOn] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    storage.loadNotify().then(setNotifyOn);
  }, []);
  const toggleNotify = async (on: boolean) => {
    setNotifyMsg(null);
    if (!on) {
      await bg.disableNotifications();
      setNotifyOn(false);
      setNotifyMsg('Obaveštenja su isključena.');
      return;
    }
    if (!(await storage.loadCredentials())) {
      setNotifyMsg('Za proveru u pozadini aplikacija mora da zapamti prijavu. Odjavite se i prijavite ponovo sa uključenim „Zapamti me“.');
      return;
    }
    try {
      const r = await bg.enableNotifications();
      setNotifyOn(r.ok);
      setNotifyMsg(r.message);
    } catch {
      setNotifyMsg('Uključivanje obaveštenja nije uspelo.');
    }
  };
  const checkNow = async () => {
    setChecking(true);
    setNotifyMsg(null);
    try {
      const r = await bg.checkForNewGrades();
      setNotifyMsg(r.message);
    } catch (e) {
      setNotifyMsg(e instanceof PortalError ? e.message : 'Provera nije uspela.');
    } finally {
      setChecking(false);
    }
  };
  const changeTheme = (t: ThemeChoice) => {
    setThemeChoice(t);
    storage.saveTheme(t);
  };

  const fail = useCallback((e: unknown) => {
    const msg = e instanceof PortalError ? e.message : 'Došlo je do neočekivane greške. Pokušajte ponovo.';
    if (e instanceof LoginError || !client.current.loggedIn) setMode('login');
    setError(msg);
  }, []);

  const loadGrades = useCallback(
    async (cls: StudentClass, isDemo = demo, owner?: Student | null) => {
      const raw = isDemo ? demoData.grades : await client.current.getGrades(cls);
      const parsed = parseGrades(raw);
      setSelected(cls);
      setSubjects(parsed);
      setError(null);
      if (!isDemo && owner) bg.rememberSeen(owner, cls, parsed);
    },
    [demo],
  );

  const loadAll = useCallback(
    async (isDemo: boolean, keepStudentId?: number | null) => {
      const list = (isDemo ? parseStudents(demoData.students) : await client.current.getStudents()).filter((s) => s.classes.length);
      if (!list.length) throw new PortalError('Na ovom nalogu nije pronađen nijedan učenik sa razredom.');
      const st = list.find((s) => s.id === keepStudentId) ?? list[0];
      setStudents(list);
      setStudentId(st.id);
      await loadGrades(currentClass(st)!, isDemo, st);
      setError(null);
      setMode('grades');
    },
    [loadGrades],
  );

  const login = useCallback(
    async (username: string, password: string, remember: boolean) => {
      setBusy(true);
      setError(null);
      try {
        await client.current.login(username, password);
        if (remember) {
          if (await storage.saveCredentials(username.trim(), password)) setSavedUsername(username.trim());
        }
        setDemo(false);
        await loadAll(false);
      } catch (e) {
        fail(e);
      } finally {
        setBusy(false);
      }
    },
    [fail, loadAll],
  );

  // Pri pokretanju: ako postoje sačuvani podaci, prijavi se automatski (uz otisak prsta ako je uključen).
  useEffect(() => {
    (async () => {
      const available = await storage.isAvailable();
      setCanRemember(available);
      const bioHw = await biometricAvailable();
      const bio = bioHw && (await storage.loadBio());
      setBioAvailable(bioHw);
      setBioOn(bio);
      const saved = available ? await storage.loadCredentials() : null;
      if (saved) {
        setSavedUsername(saved.username);
        setMode('login');
        if (bio && !(await unlock())) return; // ostaje na ekranu za prijavu sa dugmetom za sačuvani nalog
        await login(saved.username, saved.password, false);
      } else {
        setMode('login');
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loginSaved = async () => {
    if (bioOn && !(await unlock())) return;
    const saved = await storage.loadCredentials();
    if (saved) await login(saved.username, saved.password, false);
  };

  const forget = async () => {
    await storage.deleteCredentials();
    await bg.disableNotifications();
    setNotifyOn(false);
    setSavedUsername(null);
    setError(null);
  };

  const logout = async () => {
    if (!demo) await client.current.logout();
    setDemo(false);
    setStudents([]);
    setSubjects([]);
    setSelected(null);
    setSection('grades');
    sectionCache.current.clear();
    testsCache.current.clear();
    setMode('login');
  };

  const diagnose = async (username: string, password: string) => {
    setBusy(true);
    setError(null);
    try {
      if (!client.current.loggedIn) {
        const saved = !username && !password ? await storage.loadCredentials() : null;
        await client.current.login(saved?.username ?? username, saved?.password ?? password);
      }
      setDiag(await client.current.diagnose());
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const startDemo = async () => {
    setDemo(true);
    await loadAll(true);
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      if (selected) {
        if (!demo && !client.current.loggedIn) {
          const saved = await storage.loadCredentials();
          if (saved) await client.current.login(saved.username, saved.password);
        }
        await loadGrades(selected, demo, students.find((s) => s.id === studentId));
        if (section !== 'grades') await loadSection(section, selected, true);
      }
    } catch (e) {
      fail(e);
    } finally {
      setRefreshing(false);
    }
  };

  const student = students.find((s) => s.id === studentId) ?? null;

  // Izostanci / vladanje: učitavaju se kad se otvori kartica, pa se pamte po razredu
  const loadSection = useCallback(
    async (kind: SectionKey, cls: StudentClass | null, force = false) => {
      if (kind === 'grades' || !cls) return;
      if (kind === 'tests') {
        const key = `tests|${cls.portalKey ?? cls.studentClassId}`;
        const cached = testsCache.current.get(key);
        if (cached && !force) return setSectionState({ loading: false, blocks: cached.blocks, events: cached.events, error: null });
        setSectionState({ loading: true, blocks: null, error: null });
        try {
          if (!demo && !client.current.loggedIn) {
            const saved = await storage.loadCredentials();
            if (saved) await client.current.login(saved.username, saved.password);
          }
          const r = demo ? demoTests() : await client.current.getUpcoming(cls);
          testsCache.current.set(key, r);
          setSectionState({ loading: false, blocks: r.blocks, events: r.events, error: null });
        } catch (e) {
          setSectionState({ loading: false, blocks: null, error: e instanceof PortalError ? e.message : 'Učitavanje nije uspelo. Povucite nadole za ponovni pokušaj.' });
        }
        return;
      }
      const key = `${kind}|${cls.portalKey ?? cls.studentClassId}`;
      const cached = sectionCache.current.get(key);
      if (cached && !force) {
        setSectionState({ loading: false, blocks: cached, error: null });
        return;
      }
      setSectionState({ loading: true, blocks: null, error: null });
      try {
        if (!demo && !client.current.loggedIn) {
          const saved = await storage.loadCredentials();
          if (saved) await client.current.login(saved.username, saved.password);
        }
        const blocks = demo ? DEMO_SECTIONS[kind as 'absents' | 'behavior'] : await client.current.getSection(kind === 'absents' ? '/absents' : '/behavior', cls);
        sectionCache.current.set(key, blocks);
        setSectionState({ loading: false, blocks, error: null });
      } catch (e) {
        setSectionState({ loading: false, blocks: null, error: e instanceof PortalError ? e.message : 'Učitavanje nije uspelo. Povucite nadole za ponovni pokušaj.' });
      }
    },
    [demo],
  );
  useEffect(() => {
    loadSection(section, selected);
  }, [section, selected, loadSection]);

  const share = () => {
    if (!student || !selected) return;
    Share.share({ message: shareText(student.fullName, `${selected.section} · ${selected.yearLabel}`, subjects, overview(subjects)) }).catch(() => undefined);
  };

  const toggleBio = async (on: boolean) => {
    if (on && !(await unlock('Potvrdite otisak prsta'))) return;
    await storage.saveBio(on);
    setBioOn(on);
  };

  const selectClass = (c: StudentClass) => {
    setRefreshing(true);
    loadGrades(c, demo, student)
      .catch(fail)
      .finally(() => setRefreshing(false));
  };
  const view = useMemo(() => {
    if (!student || !selected) return null;
    const cur = currentClass(student)!;
    const currentYear = student.classes.filter((c) => c.yearLabel === cur.yearLabel).sort((a, b) => b.classId - a.classId);
    const otherYears = student.classes
      .filter((c) => c.yearLabel !== cur.yearLabel)
      .sort((a, b) => b.yearLabel.localeCompare(a.yearLabel));
    return { currentYear, otherYears, isCurrent: selected.yearLabel === cur.yearLabel };
  }, [student, selected]);

  const summary = useMemo(() => overview(subjects), [subjects]);

  return (
    <ThemeContext.Provider value={C}>
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <StatusBar style={C.dark ? 'light' : 'dark'} />
        {mode === 'starting' ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={{ color: C.muted, marginTop: 10 }}>Učitavanje…</Text>
          </View>
        ) : mode === 'grades' && student && selected && view ? (
          <GradesScreen
            students={students}
            student={student}
            selected={selected}
            currentYear={view.currentYear}
            otherYears={view.otherYears}
            isCurrent={view.isCurrent}
            subjects={subjects}
            summary={summary}
            demo={demo}
            refreshing={refreshing}
            onRefresh={refresh}
            onSelectStudent={(id) => loadAll(demo, id).catch(fail)}
            onSelectClass={selectClass}
            onLogout={logout}
            themeChoice={themeChoice}
            onThemeChange={changeTheme}
            error={error}
            section={section}
            onSection={setSection}
            sectionState={sectionState}
            onShare={share}
            onBackToCurrent={() => selectClass(currentClass(student)!)}
            security={{ available: bioAvailable, on: bioOn, onToggle: toggleBio }}
            notify={{ on: notifyOn, message: notifyMsg, checking, lastCheck: bg.lastCheck(), onToggle: toggleNotify, onCheckNow: checkNow }}
          />
        ) : (
          <LoginScreen
            busy={busy}
            error={error}
            canRemember={canRemember}
            savedUsername={savedUsername}
            onLogin={login}
            onLoginSaved={loginSaved}
            onForget={forget}
            onDemo={startDemo}
            onDiagnose={diagnose}
            themeChoice={themeChoice}
            onThemeChange={changeTheme}
          />
        )}
        <Modal visible={diag !== null} animationType="slide" onRequestClose={() => setDiag(null)}>
          <SafeAreaView style={{ flex: 1, padding: 16, backgroundColor: C.bg }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.text }}>Dijagnostika</Text>
            <Text style={{ color: C.muted, marginVertical: 8 }}>
              Ovde je samo struktura stranica portala (nazivi polja i statusi), bez imena, ocena i lozinke. Pošaljite ovaj tekst da bismo prilagodili aplikaciju.
            </Text>
            <ScrollView style={{ flex: 1, backgroundColor: C.card, borderRadius: 10, padding: 10 }}>
              <Text selectable style={{ fontFamily: 'monospace', fontSize: 11, color: C.text }}>{diag}</Text>
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Pressable
                style={{ flex: 1, backgroundColor: C.primary, borderRadius: 10, padding: 12, alignItems: 'center' }}
                onPress={() => diag && Share.share({ message: diag })}
              >
                <Text style={{ color: C.onPrimary, fontWeight: '700' }}>Podeli / kopiraj</Text>
              </Pressable>
              <Pressable
                style={{ flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, alignItems: 'center', backgroundColor: C.card }}
                onPress={() => setDiag(null)}
              >
                <Text style={{ color: C.text, fontWeight: '600' }}>Zatvori</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
    </ThemeContext.Provider>
  );
}
