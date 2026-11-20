"""Lažni portal u današnjem obliku: nema /api, sve je u običnom HTML-u.
Struktura je prepisana sa stvarnih stranica moj.esdnevnik.rs (2025), podaci su izmišljeni."""
import html as h
import json
import secrets
import sys

from flask import Flask, redirect, request, session

sys.path.insert(0, sys.argv[1])
import demo_data  # noqa: E402

USER, PASS = "roditelj.test", "TajnaLozinka1!"
BASE = "http://127.0.0.1:5078"
app = Flask(__name__)
app.secret_key = "mock2"

CLASSES = [
    ("7001", "25/26 VI 2", "ОШ „Вук Караџић“"),
    ("7002", "25/26 II клавир", "Музичка школа „Стеван Мокрањац“"),
    ("6001", "24/25 V 2", "ОШ „Вук Караџић“"),
]


def menu(active):
    links = ""
    for cid, label, school in CLASSES:
        y, sec = label.split(" ", 1)
        href = BASE if cid == active else f"{BASE}?student={cid}"
        cls = " active " if cid == active else " "
        links += (
            f'<a href="{href}" class="student-school-class-wrap{cls}">'
            f'<div class="student-school-class-left"><div class="student-school-class-item">\n {school}\n </div>'
            f'<div class="student-school-class-item school-class-strong">\n {y} {sec} <sub>Класа</sub> </div>'
            f'<div class="student-school-class-item">Разредни Старешина</div></div>'
            f'<div class="student-school-class-right"><div class="student-school-class-item school-class-strong"></div></div></a>'
        )
    return (
        '<div id="students-list"><div class="card student"><div class="card-header">'
        '<h5 class="" data-bs-toggle="collapse" data-bs-target="#student-1106994">'
        '<div class="student-no-avatar">АП</div>\n Ана Петровић\n <svg class="right"><path d="M1"/></svg></h5></div>'
        f'<div id="student-1106994" class="collapse  show " data-bs-parent="#students-list">{links}</div></div></div>'
    )


def guard():
    return None if session.get("auth") else redirect("/login")


def grade_item(g):
    d = g["date"]
    date = f"{d[8:10]}. {d[5:7]}. {d[0:4]}."
    sym = g["fullGrade"] if g["descriptive"] else g["grade"]
    name = g["fullGrade"].split(" (")[0]
    note = ""
    if g.get("note"):
        note = (
            '<div class="category-item-bottom"><div class="category-item-bottom-note-title">БЕЛЕШКА</div> '
            f'<div class="category-item-bottom-note">\n {h.escape(g["note"])}\n </div></div>'
        )
    return (
        '<div class="category-item-wrap grade good"><div class="category-item-top"><div class="category-symbol">\n'
        f' {sym}\n <svg class="a"><path d="M1"/></svg></div> <div class="category-item-info"><div class="name">\n'
        f' {h.escape(name)}\n </div> <div class="name-subtitle">\n {date}\n'
        f' <div class="name-subtitle-suffix">\n &nbsp;•&nbsp;{h.escape(g["gradeCategory"])}\n </div></div></div></div>'
        f"{note}</div> "
    )


def subject_page(idx):
    courses = demo_data.GRADES
    c = courses[idx]
    dd = "".join(
        f'<a href="{BASE}/grades/{1000 + i}/show" class="dropdown-item">\n {h.escape(x["course"])}\n </a> '
        for i, x in enumerate(courses)
    )
    cats = ""
    for key, title in (("1", "прво полугодиште"), ("2", "друго полугодиште")):
        part = c["parts"][key]
        items = "".join(grade_item(g) for g in part["grades"])
        fin = part.get("final") or {}
        fin_html = f'<div class="final-field"><small>Ср. оцена: {part["average"]:.2f}</small></div>'
        if fin.get("value"):
            fin_html += f'<div class="final-field"><small>Закључна: {fin["name"]} ({fin["value"]})</small></div>'
        elif fin.get("name"):
            fin_html += f'<div class="final-field"><small>Закључна: {fin["name"]}</small></div>'
        cats += (
            '<div class="category-wrap"><div class="category-top"><div class="category-title">\n'
            f' {title}\n <br> <span class="category-subtitle">01. 09. 2025 — 23. 12. 2025</span></div>'
            f' <div class="final-grade-field">{fin_html}</div></div> <div class="category-items-wrap">{items}</div></div>'
        )
    return (
        '<html><script src="/js/app.js?id=abc"></script><div class="main-content container">'
        f'<div class="dropdown-menu"><a href="{BASE}/grades/0/show" class="dropdown-item">Сви предмети</a> {dd}</div>'
        f'<div class="sections-wrap"><article class="es-card mb-3"><h4 class="es__card__title mb-4">{h.escape(c["course"])}</h4>'
        f'<div class="section-wrap"><div class="categories-wrap">{cats}</div></div></article></div></div></html>'
    )


@app.get("/login")
def login_page():
    if session.get("auth"):
        return redirect("/")
    session["_token"] = secrets.token_hex(20)
    err = session.pop("err", "")
    alert = f'<div class="alert alert-danger">{err}</div>' if err else ""
    return (
        f'<html>{alert}<form method="post"><input type="hidden" name="_token" value="{session["_token"]}" autocomplete="off">'
        '<input id="username" type="text" name="username"/><input id="password" type="password" name="password"/></form></html>'
    )


@app.post("/login")
def login_post():
    if request.form.get("_token") != session.get("_token"):
        return "Page Expired", 419
    if request.form.get("username") == USER and request.form.get("password") == PASS:
        session["auth"] = True
        session["active"] = "7001"
        return redirect("/")
    session["err"] = "Унети подаци нису тачни."
    return redirect("/login")


@app.get("/")
def home():
    if (g := guard()):
        return g
    if request.args.get("student"):
        session["active"] = request.args["student"]
    events = h.escape(json.dumps([{"start": "2025-11-20", "title": "x"}]), quote=True)
    return (
        f'<html><body><top-notification-icon name="messages" url="{BASE}/messages" :notifications-count="0"></top-notification-icon>'
        f"{menu(session['active'])}<mini-event-calendar :events='{events}'></mini-event-calendar></body></html>"
    )


@app.get("/grades")
def grades():
    if (g := guard()):
        return g
    return subject_page(0)


@app.get("/grades/<int:cid>/show")
def grades_show(cid):
    if (g := guard()):
        return g
    if cid == 0:
        return redirect("/grades")
    return subject_page(cid - 1000)


@app.get("/logout")
def logout():
    session.clear()
    return redirect("/login")


app.run(host="127.0.0.1", port=5078)
