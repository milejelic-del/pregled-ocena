/**
 * Veza između ugrađene stranice „Raspored časova“ i telefona:
 * podsetnici idu preko pravih Android obaveštenja (rade i kad je aplikacija zatvorena),
 * a deljenje preko sistemskog menija za deljenje.
 */
import * as Notifications from 'expo-notifications';
import { Platform, Share } from 'react-native';

export const BASE_URL = 'https://milejelic-del.github.io/raspored-casova/';
const CHANNEL = 'raspored';

/** Ubacuje se pre učitavanja stranice: obaveštenja i deljenje preuzima aplikacija. */
export const BEFORE_LOAD = `(function(){
  var post=function(m){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(m)); }catch(e){} };
  function N(){}
  N.permission='granted';
  N.requestPermission=function(){ return Promise.resolve('granted'); };
  window.Notification=N;
  navigator.share=function(d){ post({type:'share', text:(d&&(d.url||d.text))||''}); return Promise.resolve(); };
  window.__peticaPost=post;
})(); true;`;

/** Ubacuje se posle učitavanja: zakazivanje podsetnika šalje se aplikaciji. */
export const AFTER_LOAD = `(function(){
  var post=window.__peticaPost; if(!post||typeof scheduleReminders!=='function') return;
  var origSchedule=scheduleReminders, origClear=clearReminders;
  window.clearReminders=function(){ origClear(); post({type:'reminders', items:[]}); };
  window.scheduleReminders=function(){
    origSchedule();
    try{
      if(!state.remindersOn){ post({type:'reminders', items:[]}); return; }
      var lead=state.reminderLead||15, items=dayTimeline(todayDayName()), now=nowMinutes(), ime=currentChildName(), out=[];
      items.forEach(function(it,i){
        var first=it.type==='cas'&&i===0;
        if(!first&&it.type!=='extra') return;
        var at=it.start-lead; if(at<=now) return;
        out.push({ inSec:(at-now)*60, title: first?'Vreme je za školu':'Uskoro: '+it.name,
          body: ime+': '+it.name+' počinje u '+fmt(it.start)+' (za '+lead+' min)' });
      });
      post({type:'reminders', items:out});
    }catch(e){}
  };
  window.downloadSchedule=function(){ post({type:'share', text: JSON.stringify(profiles)}); };
  try{ if(state&&state.remindersOn) scheduleReminders(); }catch(e){}
})(); true;`;

interface Reminder {
  inSec: number;
  title: string;
  body: string;
}

async function setReminders(items: Reminder[]) {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all.filter((n) => n.content.data?.kind === 'raspored').map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  if (!items.length) return;
  const perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Raspored časova', importance: Notifications.AndroidImportance.HIGH });
  }
  for (const it of items.slice(0, 20)) {
    if (!(it.inSec > 0)) continue;
    await Notifications.scheduleNotificationAsync({
      content: { title: it.title, body: it.body, data: { kind: 'raspored' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.round(it.inSec), channelId: CHANNEL },
    });
  }
}

export function onMessage(raw: string) {
  let m: { type?: string; text?: string; items?: Reminder[] };
  try {
    m = JSON.parse(raw);
  } catch {
    return;
  }
  if (m.type === 'share' && m.text) Share.share({ message: m.text }).catch(() => 0);
  if (m.type === 'reminders' && Array.isArray(m.items)) setReminders(m.items).catch(() => 0);
}
