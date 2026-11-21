import React from 'react';
import { RASPORED_HTML } from './html';

/** Veb pregled (samo za probni prikaz): ista stranica u iframe-u. */
export default function RasporedView() {
  return React.createElement('iframe', {
    srcDoc: RASPORED_HTML,
    style: { flex: 1, border: 0, width: '100%', height: '100%', background: '#14141c' },
    title: 'Raspored časova',
  });
}
