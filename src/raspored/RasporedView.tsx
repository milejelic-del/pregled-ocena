import React from 'react';
import { WebView } from 'react-native-webview';
import { AFTER_LOAD, BASE_URL, BEFORE_LOAD, onMessage } from './bridge';
import { RASPORED_HTML } from './html';

/** Ugrađena aplikacija „Raspored časova“; podaci ostaju u telefonu (localStorage stranice). */
export default function RasporedView() {
  return (
    <WebView
      source={{ html: RASPORED_HTML, baseUrl: BASE_URL }}
      originWhitelist={['*']}
      domStorageEnabled
      javaScriptEnabled
      injectedJavaScriptBeforeContentLoaded={BEFORE_LOAD}
      injectedJavaScript={AFTER_LOAD}
      onMessage={(e) => onMessage(e.nativeEvent.data)}
      setSupportMultipleWindows={false}
      style={{ flex: 1, backgroundColor: '#14141c' }}
    />
  );
}
