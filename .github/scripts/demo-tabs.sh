#!/usr/bin/env bash
# Probni prikaz na emulatoru: dodiruje kartice i proverava da li se ekran promeni.
set -u
dump() { adb shell uiautomator dump /sdcard/u.xml >/dev/null 2>&1; adb shell cat /sdcard/u.xml > u.xml 2>/dev/null; }
center() { python3 - "$1" <<'PY'
import re,sys
want=sys.argv[1]
x=open('u.xml',encoding='utf-8',errors='ignore').read()
for m in re.finditer(r'<node [^>]*>',x):
    n=m.group(0)
    t=re.search(r' text="([^"]*)"',n); d=re.search(r' content-desc="([^"]*)"',n)
    if (t and want in t.group(1)) or (d and want == d.group(1)):
        b=re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"',n)
        if b:
            a=list(map(int,b.groups())); print((a[0]+a[2])//2,(a[1]+a[3])//2); break
PY
}
texts() { python3 -c "
import re,html
x=open('u.xml',encoding='utf-8',errors='ignore').read()
t=[html.unescape(s) for s in re.findall(r' text=\"([^\"]+)\"',x)]
print(' | '.join(t)[:900])"; }
tap() {
  dump; local c; c=$(center "$1")
  for k in 1 2 3; do
    [ -n "$c" ] && break
    adb shell input swipe 500 1600 500 800 300; sleep 1; dump; c=$(center "$1")
  done
  if [ -z "$c" ]; then echo "NEMA: $1"; texts; return 1; fi
  local t0=$(date +%s%N); adb shell input tap $c
  for i in 1 2 3 4 5 6 7 8 9 10; do sleep 1; dump; if grep -q "$2" u.xml; then echo "OK $1 -> '$2' za $(( ($(date +%s%N)-t0)/1000000 )) ms"; return 0; fi; done
  echo "SPORO/NE RADI: $1 (nije se pojavilo '$2')"; texts; return 1
}
sleep 5
dump; texts
tap "Pogledaj probni prikaz" "RASPODELA OCENA"
tap "Provere" "NAREDNIH MESEC DANA"
tap "Izostanci" "Енглески"
tap "Vladanje" "Примерно"
tap "Ocene" "RASPODELA OCENA"
tap "Raspored" "Raspored časova"
adb shell input keyevent 4; sleep 2; dump; grep -q "Vladanje" u.xml && echo "OK nazad iz rasporeda" || { echo "NAZAD NE RADI"; texts; }
