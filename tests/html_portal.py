"""Lažni portal u novom obliku: nema /api, podaci su ugrađeni u HTML (kao danas na moj.esdnevnik.rs).
Struktura menija je prepisana sa stvarne stranice, podaci su izmišljeni."""
import html as h, json, secrets, sys
from flask import Flask, redirect, request, session

sys.path.insert(0, sys.argv[1])
import demo_data

USER, PASS = "roditelj.test", "TajnaLozinka1!"
app = Flask(__name__); app.secret_key = "mock2"

CLASSES = [  # (student-class id, label, school, active)
    ("7001", "25/26 VI 2", "ОШ „Вук Караџић“"),
    ("7002", "25/26 II клавир", "Музичка школа „Стеван Мокрањац“"),
    ("6001", "24/25 V 2", "ОШ „Вук Караџић“"),
]

def menu(active):
    links = ""
    for cid, label, school in CLASSES:
        y, sec = label.split(" ", 1)
        href = "http://127.0.0.1:5078" if cid == active else f"http://127.0.0.1:5078?student={cid}"
        cls = " active " if cid == active else " "
        links += f'''<a href="{href}" class="student-school-class-wrap{cls}">
          <div class="student-school-class-left">
            <div class="student-school-class-item">
                {school}
            </div>
            <div class="student-school-class-item school-class-strong">
                {y} {sec} <sub>Класа</sub>             </div>
            <div class="student-school-class-item">Разредни Старешина</div>
          </div><div class="student-school-class-right"><div class="student-school-class-item school-class-strong"></div></div></a>'''
    return f'''<div id="students-list"><div class="card student"><div class="card-header">
      <h5 class="" data-bs-toggle="collapse" data-bs-target="#student-1106994">
        <div class="student-no-avatar">АП</div>
        Ана Петровић
        <svg class="right"><path d="M1"/></svg></h5></div>
      <div id="student-1106994" class="collapse  show " data-bs-parent="#students-list">{links}</div></div></div>'''

def guard():
    return None if session.get("auth") else redirect("/login")

@app.get("/login")
def login_page():
    if session.get("auth"): return redirect("/")
    session["_token"] = secrets.token_hex(20)
    err = session.pop("err", "")
    return f'''<html>{f'<div class="alert alert-danger">{err}</div>' if err else ''}<form method="post">
      <input type="hidden" name="_token" value="{session['_token']}" autocomplete="off">
      <input id="username" type="text" name="username"/><input id="password" type="password" name="password"/></form></html>'''

@app.post("/login")
def login_post():
    if request.form.get("_token") != session.get("_token"): return "Page Expired", 419
    if request.form.get("username") == USER and request.form.get("password") == PASS:
        session["auth"] = True; session["active"] = "7001"; return redirect("/")
    session["err"] = "Унети подаци нису тачни."; return redirect("/login")

@app.get("/")
def home():
    if (g := guard()): return g
    if request.args.get("student"):
        session["active"] = request.args["student"]
    tl = h.escape(json.dumps({"data": [], "meta": {"currentPage": 1}}), quote=True)
    return f'''<html><body><top-notification-icon name="messages" url="http://127.0.0.1:5078/messages" :notifications-count="0"></top-notification-icon>
      {menu(session["active"])}
      <timeline
            :student-class-id="{session["active"]}"
            :init-data='{tl}'></timeline></body></html>'''

@app.get("/grades")
def grades():
    if (g := guard()): return g
    return redirect("/grades/0/show")

@app.get("/grades/<int:cid>/show")
def grades_show(cid):
    if (g := guard()): return g
    data = h.escape(json.dumps({"courses": demo_data.GRADES, "studentClassId": session["active"]}, ensure_ascii=False), quote=True)
    return f'''<html><script src="/js/app.js?id=abc"></script><a href="http://127.0.0.1:5078/grades/0/show">Сви предмети</a>
      <grades-index :student-class-id="{session['active']}" :init-data='{data}'></grades-index></html>'''

@app.get("/logout")
def logout():
    session.clear(); return redirect("/login")

app.run(host="127.0.0.1", port=5078)
