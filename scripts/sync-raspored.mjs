// Ugrađuje aplikaciju „Raspored časova“ (github.com/milejelic-del/raspored-casova) u Peticu.
// Upotreba: node scripts/sync-raspored.mjs <putanja do raspored-casova/index.html>
import { readFileSync, writeFileSync } from 'node:fs';
const src = process.argv[2];
if (!src) throw new Error('Navedite putanju do index.html');
const html = readFileSync(src, 'utf8');
writeFileSync(
  new URL('../src/raspored/html.ts', import.meta.url),
  `// Generisano iz raspored-casova/index.html skriptom scripts/sync-raspored.mjs. Ne menjati ručno.\nexport const RASPORED_HTML: string = ${JSON.stringify(html)};\n`,
);
console.log('OK', html.length, 'B');
