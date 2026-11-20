/**
 * Provera novih ocena u pozadini (Android WorkManager preko expo-background-task)
 * i lokalna obaveštenja na telefonu. Ništa se ne šalje nikome osim portalu.
 * Snimak već viđenih ocena čuva se samo na telefonu (otisci: predmet|datum|ocena|vrsta).
 */
import * as BackgroundTask from 'expo-background-task';
import { File, Paths } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { parseGrades, Subject } from './grades';
import { findNew, fingerprints, NewGrade, notificationText, summaryText } from './newGrades';
import { currentClass, PortalClient, Student, StudentClass } from './portal';
import * as storage from './storage';

export const TASK = 'proveri-nove-ocene';
const CHANNEL = 'nove-ocene';
const INTERVAL_MIN = 180; // otprilike na 3 sata (sistem odlučuje tačno vreme)
const native = Platform.OS === 'android' || Platform.OS === 'ios';

interface Snapshot {
  classes: Record<string, string[]>;
  lastCheck?: string;
}

function snapFile() {
  return new File(Paths.document, 'vidjene-ocene.json');
}
function readSnapshot(): Snapshot {
  try {
    const f = snapFile();
    if (f.exists) return JSON.parse(f.textSync()) as Snapshot;
  } catch {
    /* oštećen fajl -> počinjemo iz početka */
  }
  return { classes: {} };
}
function writeSnapshot(s: Snapshot) {
  try {
    snapFile().write(JSON.stringify(s));
  } catch {
    /* nije kritično */
  }
}

const keyOf = (st: Student, cls: StudentClass) => `${st.id}|${cls.portalKey ?? cls.studentClassId}`;

if (native) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

/** Ocene koje je roditelj već video u aplikaciji ne treba javljati. */
export function rememberSeen(st: Student, cls: StudentClass, subjects: Subject[]) {
  if (!native) return;
  const cur = currentClass(st);
  if (!cur || keyOf(st, cur) !== keyOf(st, cls)) return;
  const snap = readSnapshot();
  snap.classes[keyOf(st, cls)] = [...fingerprints(subjects).keys()];
  writeSnapshot(snap);
}

export function lastCheck(): Date | null {
  if (!native) return null;
  const v = readSnapshot().lastCheck;
  return v ? new Date(v) : null;
}

async function notify(st: Student, list: NewGrade[]) {
  const texts = list.length <= 3 ? list.map((g) => notificationText(st.fullName, g)) : [summaryText(st.fullName, list)];
  for (const t of texts) {
    await Notifications.scheduleNotificationAsync({
      content: { title: t.title, body: t.body, ...(Platform.OS === 'android' ? {} : { sound: 'default' }) },
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
    });
  }
}

/** Prijava sačuvanim podacima, čitanje ocena aktuelnog razreda i javljanje novih. */
export async function checkForNewGrades(): Promise<{ ok: boolean; fresh: number; message: string }> {
  const saved = await storage.loadCredentials();
  if (!saved) return { ok: false, fresh: 0, message: 'Nema sačuvane prijave (uključite „Zapamti me“).' };
  const client = new PortalClient();
  await client.login(saved.username, saved.password);
  const students = (await client.getStudents()).filter((s) => s.classes.length);
  const snap = readSnapshot();
  let total = 0;
  for (const st of students) {
    const cls = currentClass(st);
    if (!cls) continue;
    const subjects = parseGrades(await client.getGrades(cls));
    const now = fingerprints(subjects);
    const key = keyOf(st, cls);
    const fresh = findNew(snap.classes[key], now);
    snap.classes[key] = [...now.keys()];
    if (fresh.length) {
      total += fresh.length;
      await notify(st, fresh);
    }
  }
  snap.lastCheck = new Date().toISOString();
  writeSnapshot(snap);
  // Namerno bez odjave: odjava bi prekinula i sesiju otvorene aplikacije.
  return { ok: true, fresh: total, message: total ? `Pronađeno novih ocena: ${total}.` : 'Nema novih ocena.' };
}

if (native) {
  try {
    TaskManager.defineTask(TASK, async () => {
      try {
        if (!(await storage.loadNotify())) return BackgroundTask.BackgroundTaskResult.Success;
        await checkForNewGrades();
        return BackgroundTask.BackgroundTaskResult.Success;
      } catch {
        return BackgroundTask.BackgroundTaskResult.Failed;
      }
    });
  } catch {
    /* već definisano */
  }
}

/** Uključuje obaveštenja: dozvola, kanal i zakazivanje provere. */
export async function enableNotifications(): Promise<{ ok: boolean; message: string }> {
  if (!native) return { ok: false, message: 'Obaveštenja rade samo na telefonu.' };
  const perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return { ok: false, message: 'Obaveštenja nisu dozvoljena. Uključite ih u podešavanjima telefona za „Pregled ocena“.' };
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Nove ocene',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#2f5fd0',
    });
  }
  const status = await BackgroundTask.getStatusAsync();
  if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
    return { ok: false, message: 'Telefon ne dozvoljava rad u pozadini za ovu aplikaciju (štednja baterije).' };
  }
  if (!(await TaskManager.isTaskRegisteredAsync(TASK))) await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: INTERVAL_MIN });
  await storage.saveNotify(true);
  return { ok: true, message: 'Uključeno. Proveravam otprilike na svaka 3 sata.' };
}

export async function disableNotifications(): Promise<void> {
  await storage.saveNotify(false);
  if (!native) return;
  try {
    if (await TaskManager.isTaskRegisteredAsync(TASK)) await BackgroundTask.unregisterTaskAsync(TASK);
  } catch {
    /* nije bilo zakazano */
  }
}
