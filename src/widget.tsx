/**
 * Widget na početnom ekranu (Android): prosek, poslednja ocena i sledeća provera.
 * Čita samo podatke koje je aplikacija već sačuvala na telefonu (src/offline.ts), bez interneta.
 */
import React from 'react';
import { Platform } from 'react-native';
import { FlexWidget, requestWidgetUpdate, TextWidget, type WidgetTaskHandlerProps } from 'react-native-android-widget';
import * as offline from './offline';

export const WIDGET_NAME = 'Petica';

const shortDate = (iso: string) => {
  const [, m, d] = iso.slice(0, 10).split('-');
  return d && m ? `${Number(d)}.${Number(m)}.` : iso;
};
const fmt = (n: number | null) => (n === null ? '–' : n.toFixed(2).replace('.', ','));

interface Colors {
  bg: string;
  text: string;
  muted: string;
  accent: string;
  line: string;
}
const LIGHT: Colors = { bg: '#ffffff', text: '#1b2333', muted: '#6b7487', accent: '#2f5fd0', line: '#eceff5' };
const DARK: Colors = { bg: '#1b2232', text: '#e9edf5', muted: '#9aa3b5', accent: '#7fa2ff', line: '#2a3347' };

function PeticaWidget({ c }: { c: Colors }) {
  const kids = offline.widgetInfo().slice(0, 2);
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: c.bg as `#${string}`, borderRadius: 18, padding: 12, flexDirection: 'column' }}
    >
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', alignItems: 'center' }}>
        <TextWidget text="📘 Petica" style={{ fontSize: 15, fontWeight: 'bold', color: c.text as `#${string}` }} />
        <TextWidget
          text={kids[0] ? `  ${offline.savedLabel(kids[0].savedAt)}` : ''}
          style={{ fontSize: 11, color: c.muted as `#${string}` }}
        />
      </FlexWidget>
      {kids.length === 0 ? (
        <TextWidget
          text="Otvorite aplikaciju i prijavite se da bi se ovde prikazale ocene."
          style={{ fontSize: 13, color: c.muted as `#${string}`, marginTop: 8 }}
        />
      ) : (
        kids.map((k, i) => (
          <FlexWidget
            key={i}
            style={{
              flexDirection: 'column',
              width: 'match_parent',
              marginTop: 8,
              paddingTop: i ? 6 : 0,
              borderTopWidth: i ? 1 : 0,
              borderColor: c.line as `#${string}`,
            }}
          >
            <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', alignItems: 'center' }}>
              <TextWidget text={k.name.split(' ')[0]} style={{ fontSize: 14, fontWeight: 'bold', color: c.text as `#${string}` }} truncate="END" maxLines={1} />
              <TextWidget text={`  prosek ${fmt(k.average)}`} style={{ fontSize: 14, fontWeight: 'bold', color: c.accent as `#${string}` }} />
            </FlexWidget>
            <TextWidget
              text={k.last ? `Poslednja: ${k.last.label} · ${k.last.subject} (${shortDate(k.last.date)})` : 'Još nema ocena.'}
              style={{ fontSize: 12, color: c.text as `#${string}`, marginTop: 2 }}
              truncate="END"
              maxLines={1}
            />
            <TextWidget
              text={k.next ? `📝 ${shortDate(k.next.date)} ${k.next.title}` : '📝 Nema najavljenih provera.'}
              style={{ fontSize: 12, color: c.muted as `#${string}`, marginTop: 2 }}
              truncate="END"
              maxLines={1}
            />
          </FlexWidget>
        ))
      )}
    </FlexWidget>
  );
}

const render = () => ({ light: <PeticaWidget c={LIGHT} />, dark: <PeticaWidget c={DARK} /> });

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(render());
      break;
    default:
      break;
  }
}

/** Osvežava widget posle novih podataka (ako je dodat na početni ekran). */
export function updateWidget() {
  if (Platform.OS !== 'android') return;
  requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: render }).catch(() => 0);
}

offline.setOnSaved(updateWidget);
