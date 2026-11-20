import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import demoData from './src/demoData.json';
import { overview, parseGrades, Subject } from './src/grades';
import GradesScreen from './src/GradesScreen';
import LoginScreen from './src/LoginScreen';
import { currentClass, LoginError, parseStudents, PortalClient, PortalError, Student, StudentClass } from './src/portal';
import * as storage from './src/storage';
import { C } from './src/theme';

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

  const fail = useCallback((e: unknown) => {
    const msg = e instanceof PortalError ? e.message : 'Došlo je do neočekivane greške. Pokušajte ponovo.';
    if (e instanceof LoginError || !client.current.loggedIn) setMode('login');
    setError(msg);
  }, []);

  const loadGrades = useCallback(
    async (cls: StudentClass, isDemo = demo) => {
      const raw = isDemo ? demoData.grades : await client.current.getGrades(cls.studentClassId);
      setSelected(cls);
      setSubjects(parseGrades(raw));
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
      await loadGrades(currentClass(st)!, isDemo);
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

  // Pri pokretanju: ako postoje sačuvani podaci, prijavi se automatski.
  useEffect(() => {
    (async () => {
      const available = await storage.isAvailable();
      setCanRemember(available);
      const saved = available ? await storage.loadCredentials() : null;
      if (saved) {
        setSavedUsername(saved.username);
        setMode('login');
        await login(saved.username, saved.password, false);
      } else {
        setMode('login');
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loginSaved = async () => {
    const saved = await storage.loadCredentials();
    if (saved) await login(saved.username, saved.password, false);
  };

  const forget = async () => {
    await storage.deleteCredentials();
    setSavedUsername(null);
    setError(null);
  };

  const logout = async () => {
    if (!demo) await client.current.logout();
    setDemo(false);
    setStudents([]);
    setSubjects([]);
    setSelected(null);
    setMode('login');
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
        await loadGrades(selected);
      }
    } catch (e) {
      fail(e);
    } finally {
      setRefreshing(false);
    }
  };

  const student = students.find((s) => s.id === studentId) ?? null;
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
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <StatusBar style="dark" />
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
            onSelectClass={(c) => {
              setRefreshing(true);
              loadGrades(c)
                .catch(fail)
                .finally(() => setRefreshing(false));
            }}
            onLogout={logout}
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
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
