/* GATE DA 2027 Tracker — all state is kept in this browser (localStorage).
   Use Settings → Export backup regularly. */
(function () {
  "use strict";

  /* ================= helpers ================= */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = n => String(n).padStart(2, "0");
  const ds = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const pd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return ds(d); };
  const diffDays = (a, b) => Math.round((pd(b) - pd(a)) / 86400000);
  const today = () => ds(new Date());
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmt = s => { const d = pd(s); return DOW[d.getDay()] + ", " + d.getDate() + " " + MON[d.getMonth()]; };
  const fmtY = s => { const d = pd(s); return d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear(); };
  const pct = x => Math.round(x * 100);
  const sum = a => a.reduce((x, y) => x + y, 0);
  const uid = () => Math.random().toString(36).slice(2, 10);

  /* ================= indexes ================= */
  const SUBJ = {}, TOPIC = {};
  SUBJECTS.forEach(s => { SUBJ[s.id] = s; s.topics.forEach(t => { t.subj = s.id; TOPIC[t.id] = t; }); });
  const ALL_TOPICS = SUBJECTS.flatMap(s => s.topics);
  const itemIds = t => t.sub.flatMap((sb, si) => sb[1].map((_, ii) => t.id + ":" + si + ":" + ii));
  const TARGET = { ga: 13, ps: 15, la: 9, co: 6, pd: 14, db: 10, ml: 12, ai: 7 };

  /* ---- GATE DA PYQs (actual 2024–2026 papers) ---- */
  const PYQS = typeof PYQ !== "undefined" ? PYQ.q : [];
  const PYQ_BY_TID = {}, PYQ_BY_K = {};
  PYQS.forEach(q => { (PYQ_BY_TID[q.tid] ||= []).push(q); if (q.k) (PYQ_BY_K[q.k] ||= []).push(q); });
  if (PYQS.length) ALL_TOPICS.forEach(t => { const n = (PYQ_BY_TID[t.id] || []).length; t.pyqN = n; t.f = n >= 3 ? "H" : n >= 1 ? "M" : "L"; });
  const pyqRefs = list => list.map(q => q.y + " Q." + q.n).join(", ");

  /* ================= state ================= */
  const KEY = "gateda27_tracker_v1";
  const DEFAULT = () => ({
    v: 1, items: {}, topics: {}, rev: {}, pomo: [], mocks: [], notes: [], daysDone: {}, mockPlanDone: {}, practice: {},
    ui: { subj: "la", noteSubj: "la", open: {}, mockOpen: false, pf: { book: "ross", ch: "all", sec: "all", lvl: "all", g: "2", tid: "all", st: "todo", limit: 50 } },
    settings: { gate: "2027-02-06", slot: "morning", focus: 25, short: 5, long: 15, target: 18, theme: "auto", pdf: {} }
  });
  let S;
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const d = JSON.parse(raw); const def = DEFAULT(); return { ...def, ...d, ui: { ...def.ui, ...(d.ui || {}) }, settings: { ...def.settings, ...(d.settings || {}) } }; }
    } catch (e) { /* storage unavailable */ }
    return DEFAULT();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } schedulePush(); }

  /* ---- cloud sync (claude.ai artifact database); plain browsers keep localStorage only ---- */
  const IN_ART = !!(window.claude && typeof window.claude.use === "function");
  const PARTS = { core: ["items", "topics", "rev", "daysDone", "mockPlanDone", "ui", "settings"], pomo: ["pomo"], notes: ["notes"], mocks: ["mocks"], practice: ["practice"] };
  let DB = null, pushTimer = null, pushing = false, pushAgain = false; const lastPushed = {};
  const partData = k => { const o = {}; PARTS[k].forEach(f => o[f] = S[f]); return o; };
  function schedulePush() { if (!DB) return; clearTimeout(pushTimer); pushTimer = setTimeout(pushDb, 1500); }
  async function pushDb() {
    if (!DB) return; if (pushing) { pushAgain = true; return; }
    pushing = true;
    try {
      for (const k of Object.keys(PARTS)) {
        const json = JSON.stringify(partData(k));
        if (json !== lastPushed[k]) { await DB.doc("tracker/" + k).set(JSON.parse(json)); lastPushed[k] = json; }
      }
    } catch (e) { toast("Cloud save failed (" + (e && e.code || "error") + "). Saved in this browser; it will retry on your next change."); }
    pushing = false; if (pushAgain) { pushAgain = false; pushDb(); }
  }
  async function initDb() {
    if (!IN_ART) return;
    let db = null; try { db = await window.claude.use("db"); } catch (e) { db = null; }
    if (!db) return;
    try {
      let found = false; const snaps = {};
      for (const k of Object.keys(PARTS)) { const sn = await db.doc("tracker/" + k).get(); snaps[k] = sn; if (sn.exists) found = true; }
      DB = db;
      if (found) {
        Object.keys(PARTS).forEach(k => { const sn = snaps[k]; if (sn.exists) { const d = sn.data() || {}; PARTS[k].forEach(f => { if (d[f] !== undefined) S[f] = d[f]; }); lastPushed[k] = JSON.stringify(partData(k)); } });
        const def = DEFAULT(); S.ui = { ...def.ui, ...(S.ui || {}) }; S.settings = { ...def.settings, ...(S.settings || {}) };
        try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
        applyTheme(); render();
      } else pushDb();
    } catch (e) { DB = db; }
  }
  S = load();

  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2600);
  }
  function applyTheme() {
    const th = S.settings.theme;
    if (th === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", th);
  }

  /* ================= progress ================= */
  const ts = id => (S.topics[id] ||= { book: false, pyq: false, att: 0, cor: 0, conf: 0, tough: false, done: null, revs: 0 });
  function conceptPct(t) { const ids = itemIds(t); return ids.length ? ids.filter(i => S.items[i]).length / ids.length : 0; }
  function topicPct(t) { const st = S.topics[t.id] || {}; return 0.5 * conceptPct(t) + 0.25 * (st.book ? 1 : 0) + 0.25 * (st.pyq ? 1 : 0); }
  function weighted(list) { const H = sum(list.map(t => t.h)); return H ? sum(list.map(t => t.h * topicPct(t))) / H : 0; }
  const subjPct = s => weighted(s.topics);
  const overallPct = () => weighted(ALL_TOPICS);
  function refreshDone(t) {
    const st = ts(t.id);
    if (conceptPct(t) === 1) { if (!st.done) st.done = today(); } else { st.done = null; st.revs = 0; }
  }

  /* ================= plan ================= */
  const PLAN = {}, PLAN_START = {}, PLAN_END = {};
  (function buildPlan() {
    SCHEDULE.segments.forEach(seg => {
      const tids = seg.topics || SUBJ[seg.subj].topics.map(t => t.id);
      const days = [];
      for (let d = seg.from; d <= seg.to; d = addDays(d, 1)) if (pd(d).getDay() !== 0) days.push(d);
      const total = sum(tids.map(id => TOPIC[id].h));
      let cum = 0;
      const ranges = tids.map(id => { const a = cum / total * days.length; cum += TOPIC[id].h; return [id, a, cum / total * days.length]; });
      days.forEach((d, k) => {
        const list = ranges.filter(([, a, b]) => a < k + 1 - 1e-9 && b > k + 1e-9).map(r => r[0]);
        (PLAN[d] ||= { A: [], B: [] })[seg.track].push(...list);
      });
      ranges.forEach(([id, a, b]) => {
        PLAN_START[id] = days[Math.min(days.length - 1, Math.floor(a))];
        PLAN_END[id] = days[Math.min(days.length - 1, Math.max(0, Math.ceil(b) - 1))];
      });
    });
    // GA runs daily through the whole study phase
    SUBJ.ga.topics.forEach(t => { PLAN_START[t.id] = SCHEDULE.start; PLAN_END[t.id] = "2026-12-31"; });
  })();
  const segFor = (d, track) => SCHEDULE.segments.find(s => s.track === track && d >= s.from && d <= s.to);
  const specialFor = d => SCHEDULE.special.find(s => d >= s.from && d <= s.to);
  const gaFor = d => SCHEDULE.gaRotation[pd(d).getDay()];
  function backlog() { const t = today(); return ALL_TOPICS.filter(x => PLAN_END[x.id] && PLAN_END[x.id] < t && x.subj !== "ga" && conceptPct(x) < 1); }
  function plannedPct() {
    const t = today(); const list = ALL_TOPICS.filter(x => x.subj !== "ga"); const H = sum(list.map(x => x.h));
    return sum(list.map(x => { if (!PLAN_START[x.id] || t <= PLAN_START[x.id]) return 0; if (t > PLAN_END[x.id]) return x.h; const span = diffDays(PLAN_START[x.id], PLAN_END[x.id]) + 1; return x.h * Math.min(1, diffDays(PLAN_START[x.id], t) / span); })) / H;
  }

  /* ================= routine presets ================= */
  const ROUTINES = {
    morning: { label: "Busy 09:00–13:00", rows: [
      ["05:30", "05:50", "Wake up, water, freshen up", "o"], ["05:50", "06:50", "🔁 Revision: due queue + yesterday's short notes (2 🍅)", "s"],
      ["06:50", "08:20", "📘 Track A concept: {A} (3 🍅)", "s"], ["08:20", "09:00", "Breakfast + get ready", "o"],
      ["09:00", "13:00", "Busy (4 h). Look at your formula flashcards in any spare minutes", "b"], ["13:00", "13:45", "Lunch + 15-min power nap", "o"],
      ["13:45", "14:45", "📘 Track A concept (contd.) (2 🍅)", "s"], ["14:45", "16:15", "✍️ Track A practice: book Qs + PYQs of today's topic (3 🍅)", "s"],
      ["16:15", "16:45", "Walk / exercise (no phone)", "o"], ["16:45", "19:15", "💻 Track B concept: {B} (5 🍅)", "s"],
      ["19:15", "20:00", "Dinner + family", "o"], ["20:00", "21:30", "✍️ Track B practice: book Qs + PYQs (3 🍅)", "s"],
      ["21:30", "22:00", "🧩 GA: {GA} (1 🍅)", "s"], ["22:00", "22:20", "📝 Short notes + tracker update + plan tomorrow", "s"], ["22:30", "05:30", "Sleep (7 h, non-negotiable)", "o"]] },
    midday: { label: "Busy 11:00–15:00", rows: [
      ["05:30", "05:50", "Wake up, water, freshen up", "o"], ["05:50", "06:50", "🔁 Revision: due queue + yesterday's short notes (2 🍅)", "s"],
      ["06:50", "09:20", "📘 Track A concept: {A} (5 🍅)", "s"], ["09:20", "09:50", "Breakfast", "o"],
      ["09:50", "10:50", "✍️ Track A practice: book Qs (2 🍅)", "s"], ["10:50", "11:00", "Get ready", "o"],
      ["11:00", "15:00", "Busy (4 h). Look at your formula flashcards in any spare minutes", "b"], ["15:00", "15:45", "Lunch + rest", "o"],
      ["15:45", "16:15", "✍️ Track A practice: PYQs (1 🍅)", "s"], ["16:15", "18:45", "💻 Track B concept: {B} (5 🍅)", "s"],
      ["18:45", "19:15", "Walk / exercise", "o"], ["19:15", "20:45", "✍️ Track B practice: book Qs + PYQs (3 🍅)", "s"],
      ["20:45", "21:30", "Dinner", "o"], ["21:30", "22:00", "🧩 GA: {GA} (1 🍅)", "s"], ["22:00", "22:20", "📝 Short notes + tracker update + plan tomorrow", "s"], ["22:30", "05:30", "Sleep (7 h)", "o"]] },
    afternoon: { label: "Busy 14:00–18:00", rows: [
      ["05:30", "05:50", "Wake up, water, freshen up", "o"], ["05:50", "06:50", "🔁 Revision: due queue + yesterday's short notes (2 🍅)", "s"],
      ["06:50", "09:20", "📘 Track A concept: {A} (5 🍅)", "s"], ["09:20", "09:50", "Breakfast", "o"],
      ["09:50", "11:20", "✍️ Track A practice: book Qs + PYQs (3 🍅)", "s"], ["11:20", "13:20", "💻 Track B concept: {B} (4 🍅)", "s"],
      ["13:20", "14:00", "Lunch", "o"], ["14:00", "18:00", "Busy (4 h). Look at your formula flashcards in any spare minutes", "b"],
      ["18:00", "18:30", "Snack + walk", "o"], ["18:30", "19:00", "💻 Track B concept (contd.) (1 🍅)", "s"],
      ["19:00", "20:30", "✍️ Track B practice: book Qs + PYQs (3 🍅)", "s"], ["20:30", "21:15", "Dinner", "o"],
      ["21:15", "21:45", "🧩 GA: {GA} (1 🍅)", "s"], ["21:45", "22:05", "📝 Short notes + tracker update + plan tomorrow", "s"], ["22:30", "05:30", "Sleep (7 h)", "o"]] },
    evening: { label: "Busy 17:00–21:00", rows: [
      ["05:30", "05:50", "Wake up, water, freshen up", "o"], ["05:50", "06:50", "🔁 Revision: due queue + yesterday's short notes (2 🍅)", "s"],
      ["06:50", "09:20", "📘 Track A concept: {A} (5 🍅)", "s"], ["09:20", "09:50", "Breakfast", "o"],
      ["09:50", "11:20", "✍️ Track A practice: book Qs + PYQs (3 🍅)", "s"], ["11:20", "13:20", "💻 Track B concept: {B} (4 🍅)", "s"],
      ["13:20", "14:05", "Lunch + power nap", "o"], ["14:05", "14:35", "💻 Track B concept (contd.) (1 🍅)", "s"],
      ["14:35", "16:05", "✍️ Track B practice: book Qs + PYQs (3 🍅)", "s"], ["16:05", "16:35", "🧩 GA: {GA} (1 🍅)", "s"],
      ["16:35", "17:00", "Snack + get ready", "o"], ["17:00", "21:00", "Busy (4 h). Look at your formula flashcards in any spare minutes", "b"],
      ["21:00", "21:45", "Dinner", "o"], ["21:45", "22:05", "📝 Short notes + tracker update + plan tomorrow", "s"], ["22:30", "05:30", "Sleep (7 h)", "o"]] }
  };
  function routineHTML(d) {
    const p = PLAN[d] || { A: [], B: [] };
    const names = ids => ids.length ? ids.map(id => TOPIC[id].n.split(":")[0].split("(")[0].trim()).join(" → ") : "backlog / PYQs";
    const r = ROUTINES[S.settings.slot] || ROUTINES.morning;
    const rows = r.rows.map(([a, b, lbl, k]) => {
      const txt = esc(lbl).replace("{A}", "<b>" + esc(names(p.A)) + "</b>").replace("{B}", "<b>" + esc(names(p.B)) + "</b>").replace("{GA}", esc(gaFor(d)));
      return `<div class="t">${a}–${b}</div><div class="${k === "s" ? "study" : k === "b" ? "busy" : ""}">${txt}</div><div></div>`;
    }).join("");
    return `<div class="routine">${rows}</div><p class="muted" style="margin-top:10px">≈ 9.8 h focused study = ~18–20 🍅 (25 min focus + 5 min break; after every 4 🍅 take 15 min). Busy at another time? Change it in Settings.</p>`;
  }
  const SUNDAY_PLAN = [
    ["3 h", "Weekly test: 35–40 timed questions from this week's topics (PYQs + book), GATE-style marking"],
    ["1.5 h", "Test analysis: re-solve every wrong/skipped question, tag the mistake type, add weak topics to Revision"],
    ["2.5 h", "Backlog clearing: finish anything the tracker shows as behind"],
    ["2 h", "Weekly revision: read ALL short notes written this week + the must-remember lists"],
    ["1 h", "GA mixed PYQ set (30 Qs)"],
    ["20 min", "Plan next week: look at the Schedule, pre-download notes, upload the next topic's notes to Claude"]
  ];

  /* ================= revision queue ================= */
  const INTERVALS = [1, 3, 7, 14, 30];
  function addRev(tid, reason, dueToday = true) {
    const r = S.rev[tid];
    if (r) { if (!r.reasons.includes(reason)) r.reasons.push(reason); if (dueToday) r.next = today(); }
    else S.rev[tid] = { added: today(), next: dueToday ? today() : addDays(today(), 1), stage: 0, reps: 0, reasons: [reason] };
    ts(tid).tough = true;
  }
  function removeRev(tid) { delete S.rev[tid]; if (S.topics[tid]) S.topics[tid].tough = false; }
  const dueRev = () => Object.entries(S.rev).filter(([, r]) => r.next <= today());
  const ROUTINE_REV = [3, 10, 30];
  function dueRoutine() {
    const t = today();
    return ALL_TOPICS.filter(x => { const st = S.topics[x.id]; return st && st.done && !S.rev[x.id] && st.revs < 3 && addDays(st.done, ROUTINE_REV[st.revs]) <= t; });
  }
  function updateBadge() {
    const n = dueRev().length + dueRoutine().length; $("#revBadge").textContent = n ? n : "";
    const e = $("#errBadge"); if (e) { const m = errorLog().length; e.textContent = m ? m : ""; }
  }

  /* ================= Claude prompts ================= */
  function explainPrompt(t) {
    const s = SUBJ[t.subj];
    const checklist = t.sub.map(([n, items]) => "  • " + n + ": " + items.join("; ")).join("\n");
    return `I am preparing for GATE DA 2027 and I want to reach a top rank. I am attaching my GO Classes topper notes for:
SUBJECT: ${s.name}
TOPIC: ${t.n}

MY LEVEL: I am at ZERO level in maths. Explain every idea from the very basics, in simple English (Hinglish is fine), and never skip a step.

Please build ONE interactive HTML artifact (a single page) that teaches this topic completely:
1. Intuition first: a real-life analogy and a picture, then the formal definition.
2. ANIMATED visual explanations (Play / Next-step buttons) for the key ideas. Animate things like the process step by step (e.g. how the algorithm moves, how the vector projects, how the distribution changes).
3. FIGURES and GRAPHS (SVG/canvas, interactive sliders where useful) wherever a picture makes it easier.
4. MATHS FOR A BEGINNER: for every equation (a) explain what each symbol means in plain words, (b) say why the formula makes sense, (c) solve one fully worked numerical example with every algebra step written.
5. SYLLABUS COVERAGE: cover ALL of these sub-topics. If my notes are missing any of them, ADD it yourself and label it "➕ Added by Claude (not in your notes)":
${checklist}
6. MUST-KNOW FACTS for PYQs (add any that are missing from my notes, with the same label):
${t.m.map(x => "  • " + x).join("\n")}
7. HOW GATE ASKS IT: ${t.q}
   Give 10 GATE-DA-style questions (mix of MCQ / MSQ / NAT, easy → hard) with a "Show solution" button, a full step-by-step solution, and the trap each question sets.
8. Common mistakes & shortcuts section.
9. End with a "SHORT NOTES" box: only the formulas, facts and traps I must remember, in 10–15 lines, so I can copy it into my tracker.

Depth needed for GATE: ${t.d}
Book I will practise from afterwards: ${t.p.map(x => x[0] + " (" + x[1] + ")").join("; ")}.

Keep it focused on what GATE DA tests. Do not add research-level material.`;
  }
  function pyqPrompt(t) {
    return `GATE DA 2027 prep. Topic: ${SUBJ[t.subj].name} → ${t.n}.
I have finished the concepts. Build an interactive HTML practice page with 20 questions in GATE DA style (7 MCQ, 6 MSQ, 7 NAT), easy → hard, modelled on how GATE asks this topic: ${t.q}
Each question needs: a timer, an answer box, a "Check" button, a step-by-step solution written for a beginner in maths, and the concept/trap it tests.
At the end show my score, and the sub-topics I should revise based on my wrong answers.
Cover these sub-topics: ${t.sub.map(x => x[0]).join(", ")}.`;
  }
  function subjectNotesPrompt(s) {
    const mine = S.notes.filter(n => n.subj === s.id).map(n => "- " + (n.imp ? "[IMP] " : "") + (TOPIC[n.tid] ? TOPIC[n.tid].n + ": " : "") + n.text).join("\n") || "(none yet)";
    const tough = s.topics.filter(t => S.rev[t.id]).map(t => t.n).join("; ") || "none";
    return `I have finished ${s.name} for GATE DA 2027. Make a printable 2–4 page SHORT NOTES artifact (clean HTML, print-friendly) for last-week revision.
Include, topic by topic: key formulas (explain the symbols in one line), must-remember facts, standard tricks, and the traps GATE sets. Use small diagrams where helpful.
Give extra space and worked micro-examples to my TOUGH topics: ${tough}.
Include my own notes below (keep everything marked [IMP]):
${mine}
Topics: ${s.topics.map(t => t.n).join("; ")}.`;
  }
  function mockPrompt(m) {
    const secs = Object.entries(m.sec || {}).map(([k, v]) => `${SUBJ[k] ? SUBJ[k].short : k}: attempted ${v.a || 0}, correct ${v.c || 0}, marks ${v.m || 0}`).join("\n");
    const mis = (m.mistakes || []).map(x => `- ${TOPIC[x.tid] ? TOPIC[x.tid].n : x.tid} | ${x.type} | ${x.note || ""}`).join("\n") || "(none logged)";
    return `Analyse my GATE DA mock and give me a 7-day fix plan.
Mock: ${m.name} (${m.date}, ${m.source || ""}) — Score ${m.score}/100, attempted ${m.att || "?"}, correct ${m.cor || "?"}, wrong ${m.wr || "?"}, time used ${m.time || "?"} min.
Section-wise:
${secs}
Mistakes:
${mis}
My reflection: ${m.reflect || "-"}
Tell me: (1) where I lost the most marks and why, (2) which topics to re-study vs just practise, (3) an attempt strategy for the next mock (order of sections, time per section, when to skip), (4) 10 targeted practice questions on my weakest topic.`;
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast("Copied. Paste it into Claude with your notes attached."); }
    catch (e) {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); toast("Copied."); } catch (e2) { toast("Copy failed. Select the text manually."); }
      ta.remove();
    }
  }
  async function download(name, text, type = "text/plain") {
    if (IN_ART) {
      let dl = null; try { dl = await window.claude.use("downloads"); } catch (e) { dl = null; }
      if (!dl) { copy(text); return; }
      try { await dl.save({ filename: name, data: new Blob([text], { type }) }); } catch (e) { toast("Download cancelled."); }
      return;
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ================= small UI builders ================= */
  const bar = (p, color) => `<div class="bar"><span style="width:${Math.max(0, Math.min(100, p))}%;${color ? "background:" + color : ""}"></span></div>`;
  const tag = (f) => `<span class="tag ${f}">${f === "H" ? "PYQ: High" : f === "M" ? "PYQ: Medium" : "PYQ: Low"}</span>`;
  const lvlTag = l => `<span class="tag ${l === "H" ? "H" : l === "M" ? "M" : "L"}">${l === "H" ? "Hard" : l === "M" ? "Medium" : "Easy"}</span>`;
  const topicLink = id => `<a href="#syllabus" data-act="goto" data-t="${id}">${esc(TOPIC[id].n)}</a>`;
  function lineChart(points, opts = {}) {
    const W = 640, H = 220, P = 34, max = opts.max || 100;
    if (!points.length) return `<div class="empty">No data yet.</div>`;
    const x = i => P + (points.length === 1 ? (W - 2 * P) / 2 : i * (W - 2 * P) / (points.length - 1));
    const y = v => H - P - (v / max) * (H - 2 * P);
    const grid = [0, 25, 50, 75, 100].filter(v => v <= max).map(v => `<line x1="${P}" x2="${W - P}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)"/><text x="4" y="${y(v) + 4}">${v}</text>`).join("");
    const tgt = opts.target ? `<line x1="${P}" x2="${W - P}" y1="${y(opts.target)}" y2="${y(opts.target)}" stroke="var(--good)" stroke-dasharray="5 4"/><text x="${W - P - 60}" y="${y(opts.target) - 5}" style="fill:var(--good)">target ${opts.target}</text>` : "";
    const path = points.map((p, i) => (i ? "L" : "M") + x(i) + " " + y(p.v)).join(" ");
    const dots = points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="4" fill="var(--accent)"><title>${esc(p.l)}: ${p.v}</title></circle><text x="${x(i) - 8}" y="${y(p.v) - 9}" style="fill:var(--text);font-weight:600">${Math.round(p.v * 10) / 10}</text>`).join("");
    const labels = points.map((p, i) => `<text x="${x(i) - 12}" y="${H - 10}">${esc(p.s || "")}</text>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(opts.aria || "chart")}">${grid}${tgt}<path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>${dots}${labels}</svg>`;
  }
  function hbars(rows, max, unit = "") {
    if (!rows.length) return `<div class="empty">No data yet.</div>`;
    return rows.map(r => `<div class="subj-row"><div>${r.color ? `<span class="dot" style="background:${r.color}"></span>` : ""}${esc(r.label)}</div>${bar(max ? r.value / max * 100 : 0, r.barColor || r.color)}<div class="pct">${Math.round(r.value * 10) / 10}${unit}</div></div>`).join("");
  }

  /* ================= views ================= */
  const VIEWS = {};

  VIEWS.dashboard = () => {
    const t = today(), gate = S.settings.gate;
    const toEnd = diffDays(t, SCHEDULE.syllabusEnd), toMock = diffDays(t, SCHEDULE.mockStart), toGate = diffDays(t, gate);
    const ov = overallPct(), pl = plannedPct(), bl = backlog();
    const todayPomo = S.pomo.filter(p => p.d === t);
    const weekMins = sum(S.pomo.filter(p => diffDays(p.d, t) < 7).map(p => p.m));
    const mocks = [...S.mocks].sort((a, b) => a.date < b.date ? -1 : 1);
    const avg = mocks.length ? sum(mocks.map(m => +m.score || 0)) / mocks.length : 0;
    const diff = pct(ov) - pct(pl);
    return `
    <div class="page-head"><div><h1>Dashboard</h1><p>Finish the syllabus with PYQs by <b>31 Dec 2026</b>, mocks through January, then GATE DA 2027. Aim high: rank 1.</p></div>
      <a class="btn primary" href="#today">Open today's plan →</a></div>
    <div class="grid g4">
      <div class="card kpi"><div class="label">Syllabus deadline</div><div class="value">${Math.max(0, toEnd)}</div><div class="hint">days to 31 Dec</div></div>
      <div class="card kpi"><div class="label">Mocks start</div><div class="value">${Math.max(0, toMock)}</div><div class="hint">days to 1 Jan 2027</div></div>
      <div class="card kpi"><div class="label">GATE DA 2027</div><div class="value">${Math.max(0, toGate)}</div><div class="hint">days (${fmtY(gate)}; set the official date in Settings)</div></div>
      <div class="card kpi"><div class="label">Overall progress</div><div class="value">${pct(ov)}%</div><div class="hint">${diff >= 0 ? `<span style="color:var(--good)">on track (+${diff}% vs plan)</span>` : `<span style="color:var(--bad)">${-diff}% behind plan</span>`}</div></div>
    </div>
    <div class="grid g2 section-gap">
      <div class="card"><h2>Subject progress</h2>
        ${SUBJECTS.map(s => `<div class="subj-row"><div><span class="dot" style="background:${s.color}"></span>${esc(s.short)} <small>(${s.marks})</small></div>${bar(pct(subjPct(s)), s.color)}<div class="pct">${pct(subjPct(s))}%</div></div>`).join("")}
        <p class="muted" style="margin-top:8px">Progress = 50% concepts ticked + 25% book questions done + 25% PYQs done (weighted by topic hours).</p>
      </div>
      <div class="card"><h2>This week</h2>
        <div class="grid g2">
          <div class="kpi"><div class="label">Pomodoros today</div><div class="value">${todayPomo.length}<small style="font-size:1rem"> / ${S.settings.target}</small></div>${bar(todayPomo.length / S.settings.target * 100)}</div>
          <div class="kpi"><div class="label">Focus this week</div><div class="value">${(weekMins / 60).toFixed(1)}h</div><div class="hint">streak: ${streak()} days</div></div>
          <div class="kpi"><div class="label">Revision due</div><div class="value">${dueRev().length + dueRoutine().length}</div><div class="hint"><a href="#revision">open revision →</a></div></div>
          <div class="kpi"><div class="label">Mock average</div><div class="value">${mocks.length ? avg.toFixed(1) : "—"}</div><div class="hint">${mocks.length} mocks logged</div></div>
        </div>
      </div>
    </div>
    <div class="card section-gap"><div class="row-between"><h2>Backlog (planned but not finished)</h2><span class="tag ${bl.length ? "H" : "L"}">${bl.length} topics</span></div>
      ${bl.length ? `<ul class="list-plain">${bl.map(x => `<li class="row-between"><span><span class="dot" style="background:${SUBJ[x.subj].color}"></span>${topicLink(x.id)}</span><small>planned by ${fmt(PLAN_END[x.id])} · concepts ${pct(conceptPct(x))}%</small></li>`).join("")}</ul><p class="muted">Clear the backlog on Sunday, or replace the practice block of a lighter day.</p>` : `<div class="empty">No backlog. You are on schedule.</div>`}
    </div>
    <div class="card section-gap"><h2>Score targets for a top rank</h2>
      <div class="table-wrap"><table><thead><tr><th>Section</th><th class="num">≈ Marks in paper</th><th class="num">Your target</th><th>Why this is realistic</th></tr></thead><tbody>
      ${SUBJECTS.map(s => `<tr><td><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</td><td class="num">${s.marks}</td><td class="num"><b>${TARGET[s.id]}</b></td><td class="muted">${esc(s.why)}</td></tr>`).join("")}
      <tr><td><b>Total</b></td><td class="num">100</td><td class="num"><b>${sum(Object.values(TARGET))}</b></td><td class="muted">Consistent 75+ in full mocks by late January puts you in contention for the top ranks.</td></tr>
      </tbody></table></div>
      <p class="muted" style="margin-top:8px">The mark ranges are estimates from the 2024–2026 papers, and the split changes each year. Treat them as a guide to priorities.</p>
    </div>`;
  };
  function streak() {
    const days = new Set(S.pomo.map(p => p.d)); let d = today(), n = 0;
    if (!days.has(d)) d = addDays(d, -1);
    while (days.has(d)) { n++; d = addDays(d, -1); }
    return n;
  }

  VIEWS.today = () => {
    const d = today();
    const dayN = diffDays(SCHEDULE.start, d) + 1, totalN = diffDays(SCHEDULE.start, SCHEDULE.syllabusEnd) + 1;
    const head = `<div class="page-head"><div><h1>Today · ${fmt(d)}</h1><p>${d < SCHEDULE.start ? "The plan starts on " + fmt(SCHEDULE.start) + "." : d <= SCHEDULE.syllabusEnd ? `Day ${dayN} of ${totalN} of the syllabus phase.` : "Mock & revision phase."}</p></div>
      <div class="btn-row">${S.daysDone[d] ? `<button class="btn good" data-act="dayDone">✓ Day completed</button>` : `<button class="btn primary" data-act="dayDone">Mark today complete</button>`}<a class="btn" href="#pomodoro">Start Pomodoro</a></div></div>`;

    if (d < SCHEDULE.start) {
      return head + `<div class="card"><h2>Day 0: set up (today)</h2><ul>
        <li>Read the <a href="#books">Books &amp; Practice</a> page and arrange the books/PDFs: Strang, Ross, ISL, Han &amp; Kamber, Korth, AIMA, Think Python, CLRS.</li>
        <li>Install Python (or use Google Colab) so you can run every code snippet.</li>
        <li>Watch 3Blue1Brown <i>Essence of Linear Algebra</i> episodes 1–3 (about 30 min). This warms you up for tomorrow.</li>
        <li>Choose your busy slot in <a href="#settings">Settings</a> so the daily routine matches your day.</li>
        <li>Keep tomorrow's GO Classes notes ready for Linear Algebra (matrices) and Python basics, then read <a href="#claude">Study with Claude</a>.</li>
        <li>Bookmark this site and export a backup every Sunday (Settings).</li></ul></div>
        <div class="card"><h2>Your daily routine from tomorrow</h2>${routineHTML(SCHEDULE.start)}</div>`;
    }
    if (d > SCHEDULE.syllabusEnd) {
      const next = MOCK_PLAN.find(m => m.date >= d);
      return head + `<div class="grid g2"><div class="card"><h2>Mock phase</h2>
        ${next ? `<p>Next: <b>${esc(next.name)}</b> on ${fmt(next.date)}.</p>` : "<p>All planned mocks are done. Revise the short notes and sleep well before the exam.</p>"}
        <h3>Mock day</h3><ul><li>Take the mock in the actual GATE time slot (09:30–12:30 or 14:30–17:30), moved around your busy block.</li><li>Analyse it on the same day for 2–3 h: re-solve every wrong and skipped question without a time limit.</li><li>Log it in <a href="#mocks">Mocks &amp; Analysis</a>. Tagged mistakes go to Revision automatically.</li></ul>
        <h3>Gap day</h3><ul><li>2 🍅 revision queue → 6 🍅 re-study the weakest topics from the last mock → 6 🍅 PYQs on those topics → 2 🍅 subject short notes → 1 🍅 GA.</li></ul></div>
        <div class="card"><h2>Revision due today</h2>${revMini()}</div></div>`;
    }
    const sp = specialFor(d);
    if (pd(d).getDay() === 0) {
      return head + `<div class="card"><h2>Sunday: test, analysis &amp; backlog</h2><table><tbody>${SUNDAY_PLAN.map(r => `<tr><td style="width:80px"><b>${r[0]}</b></td><td>${esc(r[1])}</td></tr>`).join("")}</tbody></table></div>
        <div class="grid g2 section-gap"><div class="card"><h2>Backlog</h2>${backlog().length ? `<ul>${backlog().map(x => `<li>${topicLink(x.id)}</li>`).join("")}</ul>` : `<div class="empty">No backlog 🎉</div>`}</div><div class="card"><h2>Revision due</h2>${revMini()}</div></div>`;
    }
    if (sp) {
      return head + `<div class="card"><h2>${esc(sp.title)}</h2><p>${esc(sp.detail)}</p>
        <table><thead><tr><th>Block</th><th>Task</th></tr></thead><tbody>
        <tr><td>Morning 2 🍅</td><td>Revision queue + tough topics</td></tr>
        <tr><td>Block 1 (6 🍅)</td><td>Timed PYQ set: one full subject (DA 2024–2026 + related CS/ST PYQs)</td></tr>
        <tr><td>Block 2 (6 🍅)</td><td>Timed PYQ set: another subject + analysis</td></tr>
        <tr><td>Block 3 (4 🍅)</td><td>Finish that subject's short notes (use the Claude short-notes prompt)</td></tr>
        <tr><td>1 🍅</td><td>GA mixed set</td></tr></tbody></table></div>
        <div class="card"><h2>Revision due</h2>${revMini()}</div>`;
    }
    const p = PLAN[d] || { A: [], B: [] };
    const trackCard = (track, ids) => {
      const seg = segFor(d, track); const s = seg ? SUBJ[seg.subj] : null;
      return `<div class="card"><div class="row-between"><h2>Track ${track}: ${s ? `<span style="color:${s.color}">${esc(s.name)}</span>` : "—"}</h2>${s ? `<span class="tag">till ${fmt(seg.to)}</span>` : ""}</div>
        ${ids.length ? ids.map(id => { const t = TOPIC[id]; return `<div style="margin:10px 0"><div class="row-between"><div>${topicLink(id)} ${tag(t.f)}</div><small>${pct(topicPct(t))}%</small></div>${bar(pct(topicPct(t)), s.color)}
          <div class="btn-row" style="margin-top:8px"><button class="btn sm" data-act="copyExplain" data-t="${id}">📋 Claude explainer prompt</button><button class="btn sm" data-act="goto" data-t="${id}">Open checklist</button><button class="btn sm" data-act="pomoTopic" data-t="${id}">🍅 Focus on this</button></div></div>`; }).join("") : `<div class="empty">No new topic. Use the time for backlog and PYQs.</div>`}</div>`;
    };
    return head + `<div class="grid g2">${trackCard("A", p.A)}${trackCard("B", p.B)}</div>
      <div class="grid g2 section-gap">
        <div class="card"><h2>🧩 GA today</h2><p>${esc(gaFor(d))}: 30 min from the GATE GA PYQs of all papers.</p><h2 style="margin-top:14px">🔁 Revision due</h2>${revMini()}</div>
        <div class="card"><h2>How to study each topic (the loop)</h2><ol style="margin:0;padding-left:18px">
          <li><b>Concept (Pomodoros 1–5):</b> read the GO notes → paste the Claude explainer prompt with the notes attached → work through the animated explainer → tick the sub-topics.</li>
          <li><b>Practice (Pomodoros 6–8):</b> book questions (count on the topic card) → PYQs of the topic → log attempted/correct.</li>
          <li><b>Short notes (5 min):</b> write only what you got wrong or might forget.</li>
          <li><b>Rate your confidence 1–5.</b> 1–2 adds the topic to Revision automatically.</li></ol></div>
      </div>
      <div class="card section-gap"><h2>Today's routine <small>(${esc((ROUTINES[S.settings.slot] || ROUTINES.morning).label)})</small></h2>${routineHTML(d)}</div>
      <div class="card section-gap"><h2>Quick short-note</h2>${noteForm(p.A[0] || p.B[0])}</div>`;
  };
  function revMini() {
    const a = dueRev(), b = dueRoutine();
    if (!a.length && !b.length) return `<div class="empty">Nothing due.</div>`;
    return `<ul class="list-plain">${a.map(([id]) => `<li class="row-between"><span>🔥 ${topicLink(id)}</span><a href="#revision">revise</a></li>`).join("")}${b.map(x => `<li class="row-between"><span>📅 ${topicLink(x.id)} <small>R${ts(x.id).revs + 1}</small></span><a href="#revision">revise</a></li>`).join("")}</ul>`;
  }

  VIEWS.syllabus = () => {
    const sid = S.ui.subj in SUBJ ? S.ui.subj : "la"; const s = SUBJ[sid];
    const chips = SUBJECTS.map(x => `<button class="chip ${x.id === sid ? "active" : ""}" data-act="subj" data-s="${x.id}"><span class="dot" style="background:${x.color}"></span>${esc(x.short)} ${pct(subjPct(x))}%</button>`).join("");
    const topics = s.topics.map(t => topicCard(t, s)).join("");
    return `<div class="page-head"><div><h1>Syllabus Tracker</h1><p>Topic → sub-topic → sub-sub-topic, each with its book, practice set, how GATE asks it, and the facts you must know.</p></div>
      <div class="btn-row"><button class="btn" data-act="expandAll">Expand all</button><button class="btn" data-act="collapseAll">Collapse all</button></div></div>
      <div class="chips">${chips}</div>
      <div class="card" style="margin-bottom:14px"><div class="row-between"><h2 style="margin:0"><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</h2><span class="tag acc">≈ ${esc(s.marks)} marks</span></div>
        <div style="margin:10px 0">${bar(pct(subjPct(s)), s.color)}</div><p class="muted" style="margin:0">${esc(s.why)}</p></div>
      ${topics}`;
  };
  function topicCard(t, s) {
    const st = ts(t.id), open = S.ui.open[t.id];
    const p = pct(topicPct(t));
    const subs = t.sub.map(([name, items], si) => `<div class="sub-block"><h4>${esc(name)}</h4>${items.map((it, ii) => { const id = t.id + ":" + si + ":" + ii; const on = !!S.items[id]; return `<label class="check ${on ? "done" : ""}"><input type="checkbox" data-ch="item" data-id="${id}" ${on ? "checked" : ""}><span>${esc(it)}</span></label>`; }).join("")}</div>`).join("");
    const acc = st.att ? Math.round(st.cor / st.att * 100) : null;
    return `<details class="topic" data-t="${t.id}" ${open ? "open" : ""}><summary>
      <div><div class="topic-title">${esc(t.n)}</div><div class="topic-meta">${tag(t.f)}${t.pyqN !== undefined ? `<span class="tag">${t.pyqN} PYQ${t.pyqN === 1 ? "" : "s"}</span>` : ""}<span class="tag">~${t.h} h</span>${PLAN_START[t.id] && t.subj !== "ga" ? `<span class="tag">${fmt(PLAN_START[t.id])} → ${fmt(PLAN_END[t.id])}</span>` : ""}${S.rev[t.id] ? `<span class="tag H">🔥 in revision</span>` : ""}${st.done ? `<span class="tag L">✓ concepts done</span>` : ""}</div></div>
      <div class="topic-prog"><div style="text-align:right;font-size:.85rem;color:var(--muted)">${p}%</div>${bar(p, s.color)}</div></summary>
      <div class="topic-body">
        <div class="callout" style="margin-top:12px"><b>Depth for GATE:</b> ${esc(t.d)}</div>
        ${subs}
        <div class="info-grid">
          <div class="info"><h4>📘 Study from</h4><ul>${t.s.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
          <div class="info"><h4>✍️ Practise from (question target)</h4><ul>${t.p.map(x => `<li>${esc(x[0])} <b>· ${esc(x[1])}</b></li>`).join("")}</ul></div>
          <div class="info"><h4>🎯 How GATE asks it</h4><p style="margin:0">${esc(t.q)}</p></div>
          <div class="info"><h4>⚡ Must-know (Claude adds these if your notes miss them)</h4><ul>${t.m.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
          <div class="info" style="grid-column:1/-1"><h4>📄 Asked in GATE DA 2024–2026 (actual papers)</h4>${(PYQ_BY_TID[t.id] || []).length ? `<ul>${PYQ_BY_TID[t.id].map(q => `<li><b>${q.y} Q.${q.n}</b> · ${q.m} mark${q.m > 1 ? "s" : ""} · ${q.ty} · ${lvlTag(q.l)} ${esc(q.t)}</li>`).join("")}</ul>` : `<p style="margin:0" class="muted">Not asked in 2024–2026. Still in the syllabus, so cover it, but give it less time than the topics above.</p>`}</div>
        </div>
        <div class="controls">
          <label class="check"><input type="checkbox" data-ch="book" data-t="${t.id}" ${st.book ? "checked" : ""}><span>Book questions done</span></label>
          <label class="check"><input type="checkbox" data-ch="pyq" data-t="${t.id}" ${st.pyq ? "checked" : ""}><span>PYQs done</span></label>
          <span class="counter">PYQs attempted <input type="number" min="0" value="${st.att}" data-ch="att" data-t="${t.id}"></span>
          <span class="counter">correct <input type="number" min="0" value="${st.cor}" data-ch="cor" data-t="${t.id}"></span>
          ${acc !== null ? `<span class="tag ${acc >= 75 ? "L" : acc >= 60 ? "M" : "H"}">${acc}% accuracy</span>` : ""}
        </div>
        <div class="controls">
          <span class="stars" title="Confidence">Confidence ${[1, 2, 3, 4, 5].map(n => `<button data-act="conf" data-t="${t.id}" data-n="${n}" class="${st.conf >= n ? "on" : ""}" aria-label="${n} stars">★</button>`).join("")}</span>
          <button class="btn sm ${S.rev[t.id] ? "bad" : ""}" data-act="tough" data-t="${t.id}">${S.rev[t.id] ? "🔥 Tough (in revision). Click to remove" : "Mark as tough → Revision"}</button>
          <button class="btn sm" data-act="copyExplain" data-t="${t.id}">📋 Claude explainer prompt</button>
          <button class="btn sm" data-act="copyPyq" data-t="${t.id}">📋 Claude practice-set prompt</button>
          <button class="btn sm" data-act="noteFor" data-t="${t.id}">📝 Add short note</button>
          ${practiceCount(t.id) ? `<button class="btn sm" data-act="practiceTopic" data-t="${t.id}" data-b="${firstBookFor(t.id)}">✍️ Book questions (${practiceCount(t.id)})</button>` : ""}
          ${(PYQ_BY_TID[t.id] || []).length ? `<button class="btn sm" data-act="practiceTopic" data-t="${t.id}" data-b="pyq">📄 GATE PYQs (${PYQ_BY_TID[t.id].length})</button>` : ""}
        </div>
      </div></details>`;
  }

  VIEWS.pyqmap = () => {
    const YEARS = PYQS.length ? Object.keys(PYQ.papers).map(Number) : [];
    const LV = { E: 1, M: 2, H: 3 };
    const agg = {};
    SUBJECTS.forEach(s => { agg[s.id] = {}; YEARS.forEach(y => agg[s.id][y] = { q: 0, m: 0, lv: 0, H: 0, E: 0 }); });
    PYQS.forEach(q => { const a = agg[q.tid.slice(0, 2)][q.y]; a.q++; a.m += q.m; a.lv += LV[q.l] * q.m; a[q.l] = (a[q.l] || 0) + 1; });
    const avg = a => a.m ? a.lv / a.m : 0;
    const lvWord = v => !v ? "—" : v < 1.6 ? "Easy" : v < 1.85 ? "Moderate" : v < 2.0 ? "Moderate–tough" : "Tough";
    const lvCls = v => v < 1.6 ? "L" : v < 1.85 ? "acc" : v < 2.0 ? "M" : "H";
    const trend = s => { if (YEARS.length < 2) return ""; const a = avg(agg[s][YEARS[0]]), b = avg(agg[s][YEARS[YEARS.length - 1]]); const d = b - a; return d > 0.15 ? `<span style="color:var(--bad)">▲ getting tougher</span>` : d < -0.15 ? `<span style="color:var(--good)">▼ getting easier</span>` : `<span class="muted">● about the same</span>`; };
    const mtrend = s => { if (YEARS.length < 2) return ""; const a = agg[s][YEARS[0]].m, b = agg[s][YEARS[YEARS.length - 1]].m; return b - a >= 3 ? `▲ ${a}→${b}` : a - b >= 3 ? `▼ ${a}→${b}` : `≈ ${a}→${b}`; };
    const tableRows = SUBJECTS.map(s => `<tr><td><span class="dot" style="background:${s.color}"></span>${esc(s.short)}</td>${YEARS.map(y => { const a = agg[s.id][y]; return `<td>${a.m} marks <small class="muted">(${a.q} Q)</small><br><span class="tag ${lvCls(avg(a))}">${lvWord(avg(a))}</span>${a.H ? ` <small style="color:var(--bad)">${a.H} hard</small>` : ""}</td>`; }).join("")}<td style="white-space:nowrap">${mtrend(s.id)}</td><td style="white-space:nowrap">${trend(s.id)}</td></tr>`).join("");
    const yearLv = y => PYQS.filter(q => q.y === y).reduce((t, q) => t + LV[q.l] * q.m, 0) / 100;
    const types = y => ["MCQ", "MSQ", "NAT"].map(t => t + " " + PYQS.filter(q => q.y === y && q.ty === t).length).join(" · ");
    const hardList = PYQS.filter(q => q.l === "H");
    const heat = SUBJECTS.map(s => `<div class="heat-row"><div><b><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</b><br><small>${esc(s.marks)} marks in 2024–26</small></div>
      <div class="heat-cells">${s.topics.map(t => `<span class="heat-cell ${t.f} ${conceptPct(t) === 1 ? "done" : ""}" data-act="goto" data-t="${t.id}" title="${esc(pyqRefs(PYQ_BY_TID[t.id] || []) || "Not asked in 2024–26")}">${esc(t.n.split("(")[0].split(":")[0].trim())}${t.pyqN !== undefined ? ` · ${t.pyqN}` : ""}</span>`).join("")}</div></div>`).join("");
    const rows = ALL_TOPICS.map(t => `<tr><td><span class="dot" style="background:${SUBJ[t.subj].color}"></span>${esc(SUBJ[t.subj].short)}</td><td>${topicLink(t.id)}</td><td class="num">${t.pyqN ?? "—"}</td><td>${(PYQ_BY_TID[t.id] || []).map(q => `<span class="tag ${q.l === "H" ? "H" : q.l === "M" ? "M" : "L"}" title="${esc(q.t)}">${q.y} Q.${q.n}</span>`).join(" ") || `<span class="muted">—</span>`}</td><td>${esc(t.q)}</td></tr>`).join("");
    const cnt = f => ALL_TOPICS.filter(t => t.f === f).length;
    return `<div class="page-head"><div><h1>PYQ Map & Analysis</h1><p>Built from the actual GATE DA ${YEARS.join(", ")} papers: ${PYQS.length} questions, each tagged to a syllabus topic, with a level (Easy / Medium / Hard, our judgement after reading every question).</p></div>
      <a class="btn" href="#practice" data-act="practiceTopic" data-t="all" data-b="pyq">📄 Open all PYQs</a></div>
      <div class="grid g3">${YEARS.map(y => `<div class="card kpi"><div class="label">GATE DA ${y} · ${esc(PYQ.papers[y].inst)}</div><div class="value" style="font-size:1.5rem">${lvWord(yearLv(y))}</div><div class="hint">${PYQS.filter(q => q.y === y && q.l === "H").length} hard questions · ${types(y)}</div></div>`).join("")}</div>
      <div class="card section-gap"><h2>Subject-wise, year by year</h2>
        <div class="table-wrap"><table><thead><tr><th>Subject</th>${YEARS.map(y => `<th>${y}</th>`).join("")}<th>Marks trend</th><th>Level trend</th></tr></thead><tbody>${tableRows}</tbody></table></div>
        <p class="muted" style="margin-top:8px">Level = marks-weighted average of question levels (Easy 1, Medium 2, Hard 3). Easy &lt; 1.6 ≤ Moderate &lt; 1.85 ≤ Moderate–tough &lt; 2.0 ≤ Tough.</p></div>
      <div class="card section-gap"><h2>What the three papers say</h2><ul style="margin:0">
        <li><b>Probability &amp; Statistics is growing and getting tougher</b>: 15 → 19 → 21 marks, and the level rose every year. It is now the biggest subject. Give it the most practice time.</li>
        <li><b>DBMS jumped</b>: 7 → 11 → 18 marks in 2026 (SQL, relational algebra, TRC, B+ trees, FDs, ER, cuboids). Since 2025 the level has been moderate–tough and steady; these are standard GATE CS-style questions, so they are scoring marks if you practise them.</li>
        <li><b>PDSA got harder</b> after 2024: 20 → 14 → 14 marks, but the questions moved from easy recall to Python output tracing and algorithm traces. Python output questions appear every year (8 in total).</li>
        <li><b>ML and AI got easier</b>: ML fell to 13 marks in 2026 with mostly easy, direct questions (PCA, ridge, MLP parameters, precision/recall). AI questions are short concept checks plus one search or game-tree trace.</li>
        <li><b>Linear Algebra is steady</b> at 8–12 marks and moderate level: eigenvalues, special matrices (projection, orthogonal, centering), subspaces, SVD.</li>
        <li><b>Calculus is shrinking</b>: 8 → 9 → 3 marks. Maxima/minima and limits are enough; don't over-invest.</li>
        <li><b>The overall paper level is the same each year</b> (moderate). The ${hardList.length} hard questions (${hardList.map(q => q.y + " Q." + q.n).join(", ")}) are spread out: 4 from probability (conditional expectation, exponential tricks, subset counting, CLT limit) and one each from Fisher LDA, projection matrices, SQL, Bayes-net inference, Python, DFS and a GA digit puzzle.</li>
        <li><b>NAT and MSQ are about half the paper</b>, so guessing does not help. Practise computing exact numbers.</li></ul>
        <p class="callout warn" style="margin-top:12px">Levels are our judgement after reading each question; the marks and question counts are exact. Answer keys are not in these PDFs.</p></div>
      <div class="card section-gap"><h2>Syllabus heat-map (number = PYQs in 2024–26)</h2>
        <div class="grid g3" style="margin-bottom:12px"><div class="kpi"><div class="label">Asked 3+ times</div><div class="value" style="color:var(--bad)">${cnt("H")}</div></div><div class="kpi"><div class="label">Asked 1–2 times</div><div class="value" style="color:var(--warn)">${cnt("M")}</div></div><div class="kpi"><div class="label">Not asked yet</div><div class="value" style="color:var(--good)">${cnt("L")}</div></div></div>
        <div class="heat">${heat}</div></div>
      <div class="card section-gap"><h2>Paper pattern</h2><ul style="margin:0">
        <li>65 questions, 100 marks, 3 hours. GA = 10 Qs (15 marks); DA subjects = 55 Qs (85 marks).</li>
        <li>Q.1–5 and Q.11–35 carry 1 mark; Q.6–10 and Q.36–65 carry 2 marks.</li>
        <li>MCQ: negative marking (−1/3 for 1-mark, −2/3 for 2-mark). MSQ and NAT: no negative marking, no partial credit.</li></ul></div>
      <div class="card section-gap"><h2>Topic-wise PYQ list</h2><div class="table-wrap"><table><thead><tr><th>Subj</th><th>Topic</th><th class="num">PYQs</th><th>Asked in (colour = level)</th><th>How it is asked</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  };
  VIEWS.schedule = () => {
    const t = today();
    const gantt = ["A", "B"].map(tr => {
      const segs = SCHEDULE.segments.filter(s => s.track === tr);
      const start = SCHEDULE.start, total = diffDays(start, SCHEDULE.syllabusEnd) + 1;
      const sp = SCHEDULE.special[0];
      return `<div style="margin:8px 0"><small><b>Track ${tr}</b> ${tr === "A" ? "(maths → ML)" : "(CS → AI → ML)"}</small><div style="position:relative;height:30px;background:var(--surface-2);border-radius:8px;overflow:hidden;margin-top:4px">
        ${segs.map(s => { const l = diffDays(start, s.from) / total * 100, w = (diffDays(s.from, s.to) + 1) / total * 100; return `<div title="${esc(SUBJ[s.subj].name)}: ${fmt(s.from)} → ${fmt(s.to)}" style="position:absolute;left:${l}%;width:${w}%;top:0;bottom:0;background:${SUBJ[s.subj].color};color:#fff;font-size:.75rem;display:flex;align-items:center;justify-content:center;border-right:2px solid var(--surface);overflow:hidden;white-space:nowrap">${esc(SUBJ[s.subj].short)}</div>`; }).join("")}
        <div title="${esc(sp.title)}" style="position:absolute;left:${diffDays(start, sp.from) / total * 100}%;right:0;top:0;bottom:0;background:var(--text);color:var(--bg);font-size:.72rem;display:flex;align-items:center;justify-content:center;overflow:hidden;white-space:nowrap">PYQ</div>
        ${t >= start && t <= SCHEDULE.syllabusEnd ? `<div style="position:absolute;left:${diffDays(start, t) / total * 100}%;top:0;bottom:0;width:2px;background:var(--bad)"></div>` : ""}</div></div>`;
    }).join("");
    let rows = "", d = SCHEDULE.start, wk = 0;
    while (d <= SCHEDULE.syllabusEnd) {
      const dow = pd(d).getDay();
      if (dow === 1 || d === SCHEDULE.start) { wk++; rows += `<tr class="week-head"><td colspan="5">Week ${wk} · ${fmt(d)}</td></tr>`; }
      const p = PLAN[d] || { A: [], B: [] }, sp = specialFor(d);
      const names = ids => ids.map(id => `<a href="#syllabus" data-act="goto" data-t="${id}">${esc(TOPIC[id].n.split("(")[0].split(":")[0].trim())}</a>`).join("<br>");
      let a, b;
      if (dow === 0) { a = b = "<i>Weekly test + analysis + backlog + revision</i>"; }
      else if (sp) { a = b = esc(sp.title); }
      else { a = names(p.A) || "—"; b = names(p.B) || "—"; }
      rows += `<tr id="d-${d}" class="${d === t ? "today" : ""} ${dow === 0 ? "sunday" : ""}"><td style="white-space:nowrap">${fmt(d)}</td><td>${a}</td><td>${b}</td><td><small>${esc(gaFor(d))}</small></td><td><input type="checkbox" data-ch="dayDone" data-d="${d}" ${S.daysDone[d] ? "checked" : ""} aria-label="day done"></td></tr>`;
      d = addDays(d, 1);
    }
    const mockRows = MOCK_PLAN.map(m => `<tr class="${m.date === t ? "today" : ""}"><td>${fmt(m.date)}</td><td>${esc(m.name)}</td><td><span class="tag">${m.type}</span></td><td><input type="checkbox" data-ch="mockPlan" data-d="${m.date}" ${S.mockPlanDone[m.date] ? "checked" : ""} aria-label="done"></td></tr>`).join("");
    return `<div class="page-head"><div><h1>Schedule</h1><p>Two tracks run in parallel every day: <b>Track A</b> (maths → ML) and <b>Track B</b> (programming, DBMS, AI → ML). Topics are spread by their hours. Sunday is for the weekly test, backlog and revision.</p></div>
      <button class="btn" data-act="scrollToday">Jump to today</button></div>
      <div class="card"><h2>Phase overview (28 Sep → 31 Dec 2026)</h2>${gantt}
        <div class="grid g3" style="margin-top:12px">
          <div class="callout"><b>Phase 1 · Sep 28 – Nov 1</b><br>Linear Algebra, then Calculus (A) · Python + DSA (B)</div>
          <div class="callout"><b>Phase 2 · Nov 2 – Dec 6</b><br>Probability &amp; Statistics (A) · DBMS &amp; Warehousing, then AI (B)</div>
          <div class="callout"><b>Phase 3 · Dec 7 – Dec 31</b><br>ML supervised (A) · NN, clustering, PCA (B) · Dec 21–31 PYQ marathon</div>
        </div>
        <p class="muted" style="margin-top:10px">January: ${MOCK_PLAN.filter(m => m.type === "Full").length} full mocks + 3 subject tests + the 3 actual DA papers retaken under timed conditions. Revision continues throughout.</p></div>
      <div class="card section-gap"><h2>Your daily routine</h2>${routineHTML(t >= SCHEDULE.start ? t : SCHEDULE.start)}</div>
      <div class="card section-gap"><h2>Day-by-day plan</h2><div class="table-wrap" style="max-height:560px;overflow:auto" id="schedWrap"><table><thead><tr><th>Date</th><th>Track A</th><th>Track B</th><th>GA</th><th>✓</th></tr></thead><tbody>${rows}</tbody></table></div></div>
      <div class="card section-gap"><h2>January mock plan</h2><div class="table-wrap"><table><thead><tr><th>Date</th><th>Mock</th><th>Type</th><th>✓</th></tr></thead><tbody>${mockRows}</tbody></table></div>
        <p class="muted" style="margin-top:8px">Between mocks: analysis + weak-topic re-study + short-notes revision. Use any test series (e.g. GO Classes, Made Easy, ACE) and log every mock on the Mocks page.</p></div>`;
  };

  /* ---------- Pomodoro ---------- */
  const P = { mode: "focus", running: false, end: 0, left: null, cycle: 0, tid: "" };
  const modeMins = m => m === "focus" ? S.settings.focus : m === "short" ? S.settings.short : S.settings.long;
  function pLeft() { return P.left ?? modeMins(P.mode) * 60; }
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.35, 0.7].forEach(t0 => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.2, ctx.currentTime + t0); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t0 + 0.3); o.start(ctx.currentTime + t0); o.stop(ctx.currentTime + t0 + 0.3); });
    } catch (e) { /* no audio */ }
  }
  function notify(msg) { try { if ("Notification" in window && Notification.permission === "granted") new Notification("GATE DA Pomodoro", { body: msg }); } catch (e) { /* ignore */ } }
  function pComplete() {
    P.running = false; beep();
    if (P.mode === "focus") {
      const t = TOPIC[P.tid];
      S.pomo.push({ d: today(), s: t ? t.subj : "other", t: P.tid || "", m: S.settings.focus, at: Date.now() });
      save(); P.cycle++;
      P.mode = P.cycle % 4 === 0 ? "long" : "short"; P.left = modeMins(P.mode) * 60;
      notify("Focus done. Take a " + (P.mode === "long" ? "long" : "short") + " break."); toast("🍅 Pomodoro logged. Break time.");
      pStart();
    } else {
      P.mode = "focus"; P.left = modeMins("focus") * 60; notify("Break over. Start the next focus session."); toast("Break over. Press Start.");
    }
    if (current === "pomodoro" || current === "dashboard") render(); else pPaint();
  }
  function pStart() { P.end = Date.now() + pLeft() * 1000; P.running = true; pPaint(); }
  function pPause() { P.left = Math.max(0, Math.ceil((P.end - Date.now()) / 1000)); P.running = false; pPaint(); }
  function pReset() { P.running = false; P.left = null; pPaint(); }
  function pTick() {
    if (!P.running) return;
    P.left = Math.max(0, Math.ceil((P.end - Date.now()) / 1000));
    if (P.left <= 0) pComplete(); else pPaint();
  }
  const mmss = s => pad(Math.floor(s / 60)) + ":" + pad(s % 60);
  function pPaint() {
    const left = pLeft(), txt = mmss(left);
    const mt = $("#miniTimer"); const active = P.running || (P.left !== null && P.left !== modeMins(P.mode) * 60);
    mt.hidden = !active; $("#miniTime").textContent = txt; $("#miniMode").textContent = P.mode === "focus" ? "Focus" : "Break";
    document.title = active ? txt + " · " + (P.mode === "focus" ? "Focus" : "Break") + " · GATE DA" : "GATE DA 2027 Tracker";
    const el = $("#pomoTime"); if (el) el.textContent = txt;
    const ring = $("#pomoRing"); if (ring) { const f = left / (modeMins(P.mode) * 60); ring.setAttribute("stroke-dashoffset", String(691.15 * (1 - f))); }
    const sb = $("#pomoStart"); if (sb) sb.textContent = P.running ? "Pause" : "Start";
  }
  setInterval(pTick, 500);

  VIEWS.pomodoro = () => {
    const t = today(), todays = S.pomo.filter(p => p.d === t);
    const opts = SUBJECTS.map(s => `<optgroup label="${esc(s.name)}">${s.topics.map(x => `<option value="${x.id}" ${P.tid === x.id ? "selected" : ""}>${esc(x.n)}</option>`).join("")}</optgroup>`).join("");
    const days = [...Array(14)].map((_, i) => addDays(t, i - 13));
    const byDay = days.map(d => ({ l: d, s: pd(d).getDate() + "", v: S.pomo.filter(p => p.d === d).length }));
    const maxD = Math.max(S.settings.target, ...byDay.map(x => x.v));
    const W = 640, H = 170;
    const bars = byDay.map((x, i) => { const bw = (W - 40) / 14; const h = x.v / maxD * (H - 40); return `<rect x="${30 + i * bw + 3}" y="${H - 20 - h}" width="${bw - 6}" height="${h}" rx="3" fill="${x.v >= S.settings.target ? "var(--good)" : "var(--accent)"}"><title>${x.l}: ${x.v}</title></rect><text x="${30 + i * bw + bw / 2 - 5}" y="${H - 5}">${x.s}</text>${x.v ? `<text x="${30 + i * bw + bw / 2 - 5}" y="${H - 24 - h}" style="fill:var(--text)">${x.v}</text>` : ""}`; }).join("");
    const tl = H - 20 - S.settings.target / maxD * (H - 40);
    const week = S.pomo.filter(p => diffDays(p.d, t) < 7);
    const subjRows = SUBJECTS.map(s => ({ label: s.short, color: s.color, value: sum(week.filter(p => p.s === s.id).map(p => p.m)) / 60 })).filter(r => r.value > 0);
    const maxH = Math.max(1, ...subjRows.map(r => r.value));
    return `<div class="page-head"><div><h1>Pomodoro</h1><p>${S.settings.focus} min focus → ${S.settings.short} min break. Every 4th break is ${S.settings.long} min. Pick the topic so the time is logged against it.</p></div>
      <button class="btn" data-act="notifPerm">Enable notifications</button></div>
      <div class="grid g2">
        <div class="card pomo">
          <svg class="ring" viewBox="0 0 240 240"><circle cx="120" cy="120" r="110" fill="none" stroke="var(--surface-2)" stroke-width="12"/><circle id="pomoRing" cx="120" cy="120" r="110" fill="none" stroke="${P.mode === "focus" ? "var(--bad)" : "var(--good)"}" stroke-width="12" stroke-linecap="round" stroke-dasharray="691.15" stroke-dashoffset="0" transform="rotate(-90 120 120)"/>
            <foreignObject x="20" y="70" width="200" height="110"><div xmlns="http://www.w3.org/1999/xhtml" style="text-align:center"><div class="pomo-mode ${P.mode === "focus" ? "focus" : "break"}">${P.mode === "focus" ? "Focus" : P.mode === "short" ? "Short break" : "Long break"}</div><div id="pomoTime" class="pomo-time" style="font-size:3.2rem">${mmss(pLeft())}</div></div></foreignObject></svg>
          <div class="btn-row" style="justify-content:center"><button class="btn primary" id="pomoStart" data-act="pToggle">${P.running ? "Pause" : "Start"}</button><button class="btn" data-act="pReset">Reset</button><button class="btn" data-act="pSkip">Skip →</button></div>
          <div class="btn-row" style="justify-content:center;margin-top:10px">${["focus", "short", "long"].map(m => `<button class="btn sm ${P.mode === m ? "on" : ""}" data-act="pMode" data-m="${m}">${m === "focus" ? "Focus" : m === "short" ? "Short break" : "Long break"}</button>`).join("")}</div>
          <label class="field" style="margin-top:16px;text-align:left"><span>Studying now</span><select data-ch="pTopic"><option value="">— general / revision / PYQ mix —</option>${opts}</select></label>
          <p class="muted" style="margin-top:10px">Cycle: ${P.cycle % 4}/4 · Rule: phone in another room; if a distraction comes up, write it on paper and go back to work.</p>
        </div>
        <div class="card"><h2>Today: ${todays.length} / ${S.settings.target} 🍅</h2>${bar(todays.length / S.settings.target * 100)}
          <p class="muted" style="margin-top:8px">${(sum(todays.map(p => p.m)) / 60).toFixed(1)} h focused · streak ${streak()} days</p>
          <h3 style="margin-top:14px">Last 14 days</h3><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Pomodoros per day">${bars}<line x1="30" x2="${W - 10}" y1="${tl}" y2="${tl}" stroke="var(--good)" stroke-dasharray="4 4"/></svg>
          <h3 style="margin-top:10px">Hours by subject (7 days)</h3>${hbars(subjRows, maxH, "h")}
          ${todays.length ? `<button class="btn sm bad" style="margin-top:10px" data-act="pUndo">Undo last pomodoro</button>` : ""}
        </div></div>
      <div class="card section-gap"><h2>Pomodoro rules for this plan</h2><ul style="margin:0">
        <li>New concept = 5 🍅 per track per day; practice = 3 🍅 per track; revision = 2; GA = 1. <b>Daily target: ${S.settings.target}–20 🍅.</b></li>
        <li>During a pomodoro do only one thing: no phone, no WhatsApp, no switching topics.</li>
        <li>In a break stand up, drink water, look far away. No reels; they break your focus for the next session.</li>
        <li>If a doubt takes longer than 10 minutes, write it down and ask Claude at the end of the block.</li></ul></div>`;
  };

  /* ---------- Revision ---------- */
  VIEWS.revision = () => {
    const t = today();
    const entries = Object.entries(S.rev).sort((a, b) => a[1].next < b[1].next ? -1 : 1);
    const qRows = entries.map(([id, r]) => { const tp = TOPIC[id]; if (!tp) return ""; const due = r.next <= t; const ready = r.stage >= 4 || (S.topics[id] && S.topics[id].conf >= 4 && r.reps >= 2);
      return `<li><div class="row-between"><div><span class="dot" style="background:${SUBJ[tp.subj].color}"></span>${topicLink(id)} ${due ? `<span class="tag H">due</span>` : `<span class="tag">next ${fmt(r.next)}</span>`} ${ready ? `<span class="tag L">looks mastered</span>` : ""}</div>
        <div class="btn-row"><button class="btn sm bad" data-act="rHard" data-t="${id}">Still hard</button><button class="btn sm warn" data-act="rOk" data-t="${id}">OK</button><button class="btn sm good" data-act="rEasy" data-t="${id}">Easy</button><button class="btn sm" data-act="rRemove" data-t="${id}">✓ I'm good now: remove</button></div></div>
        <small class="muted">Why: ${esc(r.reasons.join(" · "))} · added ${fmt(r.added)} · revised ${r.reps}× · stage ${r.stage}/5</small></li>`; }).join("");
    const rt = dueRoutine();
    const allOpts = SUBJECTS.map(s => `<optgroup label="${esc(s.name)}">${s.topics.map(x => `<option value="${x.id}">${esc(x.n)}</option>`).join("")}</optgroup>`).join("");
    return `<div class="page-head"><div><h1>Revision</h1><p>Topics join the <b>tough queue</b> automatically when you rate confidence 1–2, mark a topic tough, score under 60% on its PYQs (5+ attempted), or tag it in a mock mistake. Spaced repetition then brings each one back after 1 → 3 → 7 → 14 → 30 days. Once you are comfortable with a topic, remove it.</p></div></div>
      <div class="card"><div class="row-between"><h2>🔥 Tough-topic queue (${entries.length})</h2><span class="tag ${dueRev().length ? "H" : "L"}">${dueRev().length} due today</span></div>
        ${entries.length ? `<ul class="list-plain">${qRows}</ul>` : `<div class="empty">Empty. Topics you find tough will appear here.</div>`}
        <div class="btn-row" style="margin-top:12px"><select id="revAdd" style="max-width:420px">${allOpts}</select><button class="btn" data-act="rAdd">Add manually</button></div>
        <p class="muted" style="margin-top:10px"><b>How to revise a tough topic (2 🍅):</b> 1) re-read your short notes + must-know list, 2) re-solve 3 PYQs you got wrong, 3) solve 3 fresh questions from the practice book, then rate it. <b>Still hard</b> sends it back to day 1, <b>OK</b> moves it one step, <b>Easy</b> moves it two steps.</p></div>
      <div class="card section-gap"><h2>📅 Scheduled revision of completed topics</h2><p class="muted">Every topic whose concepts you finish is revised automatically 3, 10 and 30 days later (R1, R2, R3).</p>
        ${rt.length ? `<ul class="list-plain">${rt.map(x => `<li class="row-between"><span><span class="dot" style="background:${SUBJ[x.subj].color}"></span>${topicLink(x.id)} <span class="tag acc">R${ts(x.id).revs + 1}</span></span><button class="btn sm good" data-act="rRoutine" data-t="${x.id}">Revised ✓</button></li>`).join("")}</ul>` : `<div class="empty">Nothing due today.</div>`}</div>`;
  };
  function revStep(id, k) {
    const r = S.rev[id]; if (!r) return;
    r.reps++; r.stage = k < 0 ? 0 : Math.min(5, r.stage + k);
    r.next = addDays(today(), INTERVALS[Math.min(INTERVALS.length - 1, r.stage)]);
    if (r.stage >= 5) toast("You have revised this topic 5 times. If it feels easy, click “I'm good now”.");
  }

  /* ---------- Mocks ---------- */
  const SECS = ["ga", "ps", "la", "co", "pd", "db", "ml", "ai"];
  VIEWS.mocks = () => {
    const mocks = [...S.mocks].sort((a, b) => a.date < b.date ? -1 : 1);
    const pts = mocks.map((m, i) => ({ v: +m.score || 0, l: m.name, s: "M" + (i + 1) }));
    const avg = mocks.length ? sum(pts.map(p => p.v)) / mocks.length : 0;
    const best = mocks.length ? Math.max(...pts.map(p => p.v)) : 0;
    const last = pts.length ? pts[pts.length - 1].v : 0, prev = pts.length > 1 ? pts[pts.length - 2].v : null;
    const agg = {}; SECS.forEach(k => agg[k] = { a: 0, c: 0, m: 0, n: 0 });
    mocks.forEach(m => SECS.forEach(k => { const v = (m.sec || {})[k]; if (v && (v.a || v.m)) { agg[k].a += +v.a || 0; agg[k].c += +v.c || 0; agg[k].m += +v.m || 0; agg[k].n++; } }));
    const accRows = SECS.filter(k => agg[k].a).map(k => ({ label: SUBJ[k].short, color: SUBJ[k].color, value: agg[k].c / agg[k].a * 100 }));
    const markRows = SECS.filter(k => agg[k].n).map(k => ({ label: SUBJ[k].short + " (target " + TARGET[k] + ")", color: SUBJ[k].color, value: agg[k].m / agg[k].n, barColor: agg[k].m / agg[k].n >= TARGET[k] ? "var(--good)" : SUBJ[k].color }));
    const mt = {}; const mtopic = {};
    mocks.forEach(m => (m.mistakes || []).forEach(x => { mt[x.type] = (mt[x.type] || 0) + 1; mtopic[x.tid] = (mtopic[x.tid] || 0) + 1; }));
    const mtRows = Object.entries(mt).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v, color: "var(--bad)" }));
    const weak = Object.entries(mtopic).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const insights = [];
    if (mocks.length) {
      if (prev !== null) insights.push(last >= prev ? `Score went up by ${(last - prev).toFixed(1)} since the previous mock.` : `Score dropped by ${(prev - last).toFixed(1)} since the previous mock. Check the mistake types below.`);
      if (accRows.length) { const w = [...accRows].sort((a, b) => a.value - b.value)[0]; insights.push(`Lowest accuracy: <b>${esc(w.label)}</b> (${Math.round(w.value)}%). Aim for 75%+ in every section.`); }
      if (mtRows.length) insights.push(`Most common mistake type: <b>${esc(mtRows[0].label)}</b> (${mtRows[0].value}×). ${mtRows[0].label === "Silly mistake" || mtRows[0].label === "Calculation error" || mtRows[0].label === "Misread question" ? "Fix this with a 10-second re-read of every question and by re-checking NAT answers." : mtRows[0].label === "Time pressure" ? "Take a 2-round approach: easy 1-mark questions first, then the 2-markers." : "Re-study the weak topics listed below. They are already in your Revision queue."}`);
      const below = markRows.filter(r => r.barColor !== "var(--good)").map(r => r.label.split(" (")[0]);
      if (below.length) insights.push(`Below target in: ${esc(below.join(", "))}.`);
      insights.push(avg >= 75 ? "Average is 75+, which is top-rank territory. Keep it consistent." : `Average ${avg.toFixed(1)}. The gap to a 75+ average is ${(75 - avg).toFixed(1)} marks. Recover it from the sections with the biggest target gap first.`);
    }
    const tbl = mocks.slice().reverse().map(m => `<tr><td>${fmt(m.date)}</td><td>${esc(m.name)}<br><small>${esc(m.source || "")}</small></td><td class="num"><b>${esc(m.score)}</b></td><td class="num">${esc(m.att || "")}</td><td class="num">${m.att ? Math.round((m.cor || 0) / m.att * 100) + "%" : ""}</td><td class="num">${esc(m.time || "")}</td><td><div class="btn-row"><button class="btn sm" data-act="mockPrompt" data-id="${m.id}">📋 Claude analysis prompt</button><button class="btn sm bad" data-act="mockDel" data-id="${m.id}">Delete</button></div></td></tr>`).join("");
    const secInputs = SECS.map(k => `<tr><td><span class="dot" style="background:${SUBJ[k].color}"></span>${esc(SUBJ[k].short)}</td><td><input type="number" min="0" id="ma_${k}"></td><td><input type="number" min="0" id="mc_${k}"></td><td><input type="number" step="0.01" id="mm_${k}"></td></tr>`).join("");
    const topicOpts = SUBJECTS.map(s => `<optgroup label="${esc(s.name)}">${s.topics.map(x => `<option value="${x.id}">${esc(x.n)}</option>`).join("")}</optgroup>`).join("");
    return `<div class="page-head"><div><h1>Mocks &amp; Analysis</h1><p>Log every mock. Section marks, accuracy and tagged mistakes build the analysis below, and tagged topics go straight into the Revision queue.</p></div>
      <button class="btn primary" data-act="mockToggle">${S.ui.mockOpen ? "Close form" : "+ Log a mock"}</button></div>
      ${S.ui.mockOpen ? `<div class="card" style="margin-bottom:14px"><h2>New mock</h2>
        <div class="grid g4"><label class="field"><span>Name</span><input type="text" id="m_name" placeholder="GO Full Mock 1"></label><label class="field"><span>Date</span><input type="date" id="m_date" value="${today()}"></label><label class="field"><span>Source</span><input type="text" id="m_src" placeholder="GO Classes / Made Easy / ACE"></label><label class="field"><span>Score (out of 100)</span><input type="number" step="0.01" id="m_score"></label>
        <label class="field"><span>Attempted</span><input type="number" id="m_att"></label><label class="field"><span>Correct</span><input type="number" id="m_cor"></label><label class="field"><span>Wrong</span><input type="number" id="m_wr"></label><label class="field"><span>Time used (min)</span><input type="number" id="m_time"></label></div>
        <h3 style="margin-top:16px">Section-wise</h3><div class="table-wrap"><table><thead><tr><th>Section</th><th>Attempted</th><th>Correct</th><th>Marks</th></tr></thead><tbody>${secInputs}</tbody></table></div>
        <h3 style="margin-top:16px">Mistakes (each tagged topic → Revision)</h3><div id="mistakeRows"></div>
        <div class="grid g3" style="align-items:end"><label class="field"><span>Topic</span><select id="mx_t">${topicOpts}</select></label><label class="field"><span>Mistake type</span><select id="mx_type">${MISTAKE_TYPES.map(x => `<option>${esc(x)}</option>`).join("")}</select></label><label class="field"><span>Note (what went wrong)</span><input type="text" id="mx_note" placeholder="forgot Var(X+Y) cov term"></label></div>
        <button class="btn" style="margin-top:8px" data-act="mxAdd">+ Add mistake</button>
        <label class="field" style="margin-top:14px"><span>Reflection: what will you do differently next time?</span><textarea id="m_ref"></textarea></label>
        <div class="btn-row" style="margin-top:12px"><button class="btn primary" data-act="mockSave">Save mock</button></div></div>` : ""}
      <div class="grid g4"><div class="card kpi"><div class="label">Mocks</div><div class="value">${mocks.length}</div><div class="hint">plan: ${MOCK_PLAN.length}</div></div>
        <div class="card kpi"><div class="label">Average</div><div class="value">${mocks.length ? avg.toFixed(1) : "—"}</div></div>
        <div class="card kpi"><div class="label">Best</div><div class="value">${mocks.length ? best : "—"}</div></div>
        <div class="card kpi"><div class="label">Last</div><div class="value">${mocks.length ? last : "—"}</div><div class="hint">${prev !== null ? (last >= prev ? "▲ " : "▼ ") + Math.abs(last - prev).toFixed(1) : ""}</div></div></div>
      ${insights.length ? `<div class="card section-gap"><h2>Insights</h2><ul style="margin:0">${insights.map(x => `<li>${x}</li>`).join("")}</ul></div>` : ""}
      <div class="card section-gap"><h2>Score trend</h2>${lineChart(pts, { target: 75, aria: "Mock score trend" })}</div>
      <div class="grid g2 section-gap"><div class="card"><h2>Section accuracy (all mocks)</h2>${hbars(accRows, 100, "%")}</div><div class="card"><h2>Average marks vs target</h2>${hbars(markRows, 20)}</div></div>
      <div class="grid g2 section-gap"><div class="card"><h2>Mistake types</h2>${hbars(mtRows, Math.max(1, ...mtRows.map(r => r.value)))}</div>
        <div class="card"><h2>Weakest topics (by mistakes)</h2>${weak.length ? `<ul class="list-plain">${weak.map(([id, n]) => `<li class="row-between"><span>${TOPIC[id] ? topicLink(id) : esc(id)}</span><span class="tag H">${n}×</span></li>`).join("")}</ul>` : `<div class="empty">No mistakes logged yet.</div>`}</div></div>
      <div class="card section-gap"><h2>All mocks</h2>${mocks.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Mock</th><th class="num">Score</th><th class="num">Att.</th><th class="num">Acc.</th><th class="num">Min</th><th></th></tr></thead><tbody>${tbl}</tbody></table></div>` : `<div class="empty">No mocks yet. Mocks start on 1 Jan 2027.</div>`}</div>
      <div class="card section-gap"><h2>Mock-taking &amp; analysis protocol</h2><ol style="margin:0;padding-left:18px">
        <li><b>Round 1 (≈ 100 min):</b> go through all 65 questions. Solve every question you can finish in under 2 minutes. Mark the rest.</li>
        <li><b>Round 2 (≈ 60 min):</b> the marked 2-mark questions, starting with the subjects you are strongest in.</li>
        <li><b>Last 20 min:</b> re-check NAT answers (units, rounding) and MSQ options. Guess an MCQ only if you can eliminate 2 options.</li>
        <li><b>Analysis (same day, 2–3 h):</b> re-solve every wrong and skipped question without a time limit and tag its type. Concept gaps go to re-study, silly mistakes go to a checklist, time losses go to strategy.</li>
        <li>Write 2–3 short notes from each mock. These notes matter most in the final week.</li></ol></div>
      <div class="card section-gap"><h2>January mock plan</h2><div class="table-wrap"><table><thead><tr><th>Date</th><th>Mock</th><th>Type</th><th>✓</th></tr></thead><tbody>${MOCK_PLAN.map(m => `<tr><td>${fmt(m.date)}</td><td>${esc(m.name)}</td><td><span class="tag">${m.type}</span></td><td><input type="checkbox" data-ch="mockPlan" data-d="${m.date}" ${S.mockPlanDone[m.date] ? "checked" : ""} aria-label="done"></td></tr>`).join("")}</tbody></table></div></div>`;
  };
  let draftMistakes = [];
  function paintMistakes() {
    const el = $("#mistakeRows"); if (!el) return;
    el.innerHTML = draftMistakes.length ? `<ul class="list-plain" style="margin-bottom:10px">${draftMistakes.map((x, i) => `<li class="row-between"><span>${esc(TOPIC[x.tid].n)} · <span class="tag H">${esc(x.type)}</span> ${esc(x.note)}</span><button class="btn sm" data-act="mxDel" data-i="${i}">✕</button></li>`).join("")}</ul>` : "";
  }

  /* ---------- Short notes ---------- */
  function noteForm(tid) {
    const opts = SUBJECTS.map(s => `<optgroup label="${esc(s.name)}">${s.topics.map(x => `<option value="${x.id}" ${x.id === tid ? "selected" : ""}>${esc(x.n)}</option>`).join("")}</optgroup>`).join("");
    return `<div class="grid" style="grid-template-columns:minmax(0,1fr)"><select id="nf_t">${opts}</select><textarea id="nf_text" placeholder="Only what you got wrong, might forget, or a shortcut. e.g. 'Var(X−Y) = VarX + VarY − 2Cov, NOT + 2Cov'"></textarea>
      <div class="btn-row"><label class="check"><input type="checkbox" id="nf_imp"><span>⭐ Important (must remember)</span></label><button class="btn primary" data-act="noteAdd">Add note</button></div></div>`;
  }
  function notesMarkdown(s) {
    let md = `# ${s.name}: Short Notes (GATE DA 2027)\n\n`;
    s.topics.forEach(t => {
      const mine = S.notes.filter(n => n.tid === t.id);
      md += `## ${t.n}${S.rev[t.id] ? " 🔥" : ""}\n`;
      mine.forEach(n => md += `- ${n.imp ? "⭐ " : ""}${n.text}\n`);
      md += `\n**Must remember:**\n` + t.m.map(x => `- ${x}`).join("\n") + "\n\n";
    });
    return md;
  }
  VIEWS.notes = () => {
    const sid = S.ui.noteSubj in SUBJ ? S.ui.noteSubj : "la"; const s = SUBJ[sid];
    const chips = SUBJECTS.map(x => `<button class="chip ${x.id === sid ? "active" : ""}" data-act="noteSubj" data-s="${x.id}"><span class="dot" style="background:${x.color}"></span>${esc(x.short)} (${S.notes.filter(n => n.subj === x.id).length})</button>`).join("");
    const done = pct(subjPct(s));
    const body = s.topics.map(t => {
      const mine = S.notes.filter(n => n.tid === t.id).sort((a, b) => (b.imp ? 1 : 0) - (a.imp ? 1 : 0));
      return `<div style="margin-bottom:18px"><h3>${esc(t.n)} ${S.rev[t.id] ? `<span class="tag H">🔥 tough</span>` : ""}</h3>
        ${mine.map(n => `<div class="note-item"><button class="star ${n.imp ? "on" : ""}" data-act="noteImp" data-id="${n.id}" aria-label="important">★</button><div>${esc(n.text)}<br><small class="muted">${fmt(n.date)}</small></div><button class="btn sm no-print" data-act="noteDel" data-id="${n.id}">✕</button></div>`).join("")}
        <details ${mine.length ? "" : "open"}><summary class="muted" style="cursor:pointer">Must remember (${t.m.length})</summary><ul style="margin:6px 0 0">${t.m.map(x => `<li>${esc(x)}</li>`).join("")}</ul></details></div>`;
    }).join("");
    return `<div class="page-head"><div><h1>Short Notes</h1><p>Add notes while you study: only mistakes, traps and must-remember points. At the end of each subject this page becomes your one-stop revision sheet. You can print it or download it.</p></div>
      <div class="btn-row no-print"><button class="btn" data-act="notesMd">⬇ Download .md</button>${IN_ART ? "" : `<button class="btn" data-act="print">🖨 Print</button>`}<button class="btn" data-act="notesPrompt">📋 Claude short-notes prompt</button></div></div>
      <div class="chips no-print">${chips}</div>
      ${done >= 90 ? `<div class="callout good no-print" style="margin-bottom:14px">${esc(s.name)} is ${done}% complete. Generate the final short notes: click “Claude short-notes prompt”, paste it into Claude and save the result.</div>` : ""}
      <div class="card no-print" style="margin-bottom:14px"><h2>Add a note</h2>${noteForm(s.topics[0].id)}</div>
      <div class="card"><h2><span class="dot" style="background:${s.color}"></span>${esc(s.name)}: short notes</h2>${body}</div>`;
  };

  /* ---------- Books ---------- */
  /* ---------- Practice question bank ---------- */
  const PBOOKS = typeof PRACTICE_BOOKS !== "undefined" ? PRACTICE_BOOKS.slice() : [];
  if (PYQS.length) {
    const pats = { ...(PBOOKS[0] ? PBOOKS[0].patterns : {}) };
    PYQS.forEach(q => { pats["T:" + q.tid] = { tid: q.tid, label: TOPIC[q.tid] ? TOPIC[q.tid].n.split("(")[0].split(":")[0].trim() : q.tid }; });
    const ch = {}; Object.entries(PYQ.papers).forEach(([y, v]) => ch[y] = "GATE DA " + y + " · " + v.inst);
    PBOOKS.unshift({ id: "pyq", pyq: true, title: "GATE DA previous-year papers (2024–2026)", short: "GATE PYQ", subj: "ps", chapters: ch, patterns: pats,
      notes: "These are the actual GATE DA papers. Solve each question in that year's paper PDF at the page shown, ideally timed. Answer keys are not in these PDFs, so check with the official GATE answer key. Level is our judgement.",
      q: PYQS.map(q => ({ c: q.y, s: "Q", n: q.n, p: q.p, l: q.l, g: 3, k: "T:" + q.tid, pk: q.k, t: q.t, m: q.m, ty: q.ty })) });
  }
  const SECNAME = { P: "Problem", TE: "Theoretical Ex.", ST: "Self-Test", Q: "Q." };
  const qLabel = (b, q) => b.pyq ? `GATE ${q.c} · Q.${q.n}` : `Ch ${q.c} · ${SECNAME[q.s]} ${b.dotted && q.c > 2 ? q.c + "." : ""}${q.n}`;
  const askedLine = (b, q) => { if (b.pyq) return `<span class="tag">${q.m} mark${q.m > 1 ? "s" : ""} · ${q.ty}</span>`; const l = PYQ_BY_K[q.k]; return l ? `<span style="color:var(--good)">✔ Same type asked in GATE DA: ${esc(pyqRefs(l))}</span>` : `<span class="muted">Same type not asked in GATE DA 2024–26</span>`; };
  const GNAME = { 3: "🎯 GATE-likely", 2: "Good practice" };
  const STNAME = { s: "Done", h: "Done but hard", w: "Wrong" };
  const statusBtns = k => { const s = S.practice[k]; return `<div class="btn-row" style="flex-wrap:nowrap">${[["s", "✓ Done", "good"], ["h", "Hard", "warn"], ["w", "✗ Wrong", "bad"]].map(([v, l, c]) => `<button class="btn sm ${s === v ? c : ""}" data-act="pq" data-k="${k}" data-v="${v}" title="${STNAME[v]}">${l}</button>`).join("")}</div>`; };
  const qByKey = k => { const [bid] = k.split(":"); const b = PBOOKS.find(x => x.id === bid); const q = b && b.q.find(x => qKey(b, x) === k); return q ? { b, q } : null; };
  const errorLog = () => Object.keys(S.practice).filter(k => (S.practice[k] === "h" || S.practice[k] === "w") && qByKey(k));
  const LNAME = { E: "Easy", M: "Medium", H: "Hard" };
  const qKey = (b, q) => b.id + ":" + q.c + q.s + q.n;
  const qName = (b, q) => b.short + " " + qLabel(b, q);
  function practiceCount(tid, bid) { let n = 0; PBOOKS.forEach(b => { if (b.pyq || (bid && b.id !== bid)) return; b.q.forEach(q => { if (b.patterns[q.k].tid === tid) n++; }); }); return n; }
  const firstBookFor = tid => (PBOOKS.find(b => !b.pyq && b.q.some(q => b.patterns[q.k].tid === tid)) || {}).id;
  function pfilter(b, f) {
    return b.q.filter(q => (f.ch === "all" || String(q.c) === f.ch) && (f.sec === "all" || q.s === f.sec) && (f.lvl === "all" || q.l === f.lvl)
      && (f.g === "all" || q.g >= +f.g && (f.g !== "0" || true)) && (f.tid === "all" || b.patterns[q.k].tid === f.tid)
      && (f.st === "all" || (f.st === "todo" ? !S.practice[qKey(b, q)] : S.practice[qKey(b, q)] === f.st)));
  }
  VIEWS.practice = () => {
    if (!PBOOKS.length) return `<div class="empty">No practice books loaded.</div>`;
    const f = S.ui.pf = { book: "ross", ch: "all", sec: "all", lvl: "all", g: "2", tid: "all", st: "todo", limit: 50, ...(S.ui.pf || {}) };
    if (!["2", "3"].includes(String(f.g))) f.g = "2";
    const b = PBOOKS.find(x => x.id === f.book) || PBOOKS[0];
    if (f.ch !== "all" && !b.chapters[f.ch]) f.ch = "all";
    const st = k => S.practice[k];
    const tally = list => ({ n: list.length, s: list.filter(q => st(qKey(b, q)) === "s").length, w: list.filter(q => ["w", "h"].includes(st(qKey(b, q)))).length });
    const tiers = (b.pyq ? [3] : [3, 2]).map(g => ({ g, ...tally(b.q.filter(q => q.g === g)) }));
    const chRows = Object.keys(b.chapters).map(c => { const t = tally(b.q.filter(q => String(q.c) === c)); return `<div class="subj-row"><div>Ch ${c} <small>${esc(b.chapters[c])}</small></div>${bar(t.n ? (t.s + t.w) / t.n * 100 : 0, SUBJ[b.subj].color)}<div class="pct">${t.s + t.w}/${t.n}</div></div>`; }).join("");
    const list = pfilter(b, f), shown = list.slice(0, f.limit);
    const tids = [...new Set(b.q.map(q => b.patterns[q.k].tid))].filter(t => TOPIC[t]);
    const sel = (key, opts) => `<select data-ch="pf" data-k="${key}">${opts.map(([v, l]) => `<option value="${v}" ${String(f[key]) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    const link = (S.settings.pdf || {})[b.id];
    const rows = shown.map(q => {
      const k = qKey(b, q), s = st(k), pat = b.patterns[q.k];
      return `<tr><td style="white-space:nowrap"><b>${qLabel(b, q)}</b>${q.x ? ` <span title="Starred as harder in the book">★</span>` : ""}</td>
        <td class="num" style="white-space:nowrap">${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">p. ${q.p}</a>` : `p. ${q.p}`}</td>
        <td>${esc(q.t)}<br><small class="muted">${b.pyq ? "Topic" : "PYQ pattern"}: ${esc(pat.label)}${!b.pyq && TOPIC[pat.tid] ? " · " + esc(TOPIC[pat.tid].n.split("(")[0].split(":")[0].trim()) : ""}</small><br><small>${askedLine(b, q)}</small></td>
        <td><span class="tag ${q.l === "H" ? "H" : q.l === "M" ? "M" : "L"}">${LNAME[q.l]}</span></td>
        <td><span class="tag ${q.g === 3 ? "acc" : ""}">${b.pyq ? "📄 Actual PYQ" : GNAME[q.g]}</span></td>
        <td style="white-space:nowrap">${q.a ? `<small>Ans p. ${q.a}</small>` : ""}${q.o ? `<small>Solution p. ${q.o}</small>` : ""}${!q.a && !q.o ? `<small class="muted">—</small>` : ""}</td>
        <td>${statusBtns(k)}</td></tr>`;
    }).join("");
    const bookChips = PBOOKS.map(x => `<button class="chip ${x.id === b.id ? "active" : ""}" data-act="pfBook" data-b="${x.id}">${x.pyq ? "📄 " : ""}${esc(x.short)} (${x.q.length})</button>`).join("");
    return `<div class="page-head"><div><h1>Practice Questions</h1><p>Only GATE-relevant exercises from your books, tagged by level, GATE relevance and PYQ pattern. Solve each one in your PDF at the page shown, so the question, figures and numbers are exactly the book's. Mark it <b>Done</b>, <b>Hard</b> (done but tough) or <b>Wrong</b>. Hard and Wrong go to the <a href="#errorlog">Error Log</a>; Wrong also adds the topic to Revision.</p></div></div>
      <div class="chips">${bookChips}</div>
      <div class="grid g2">
        <div class="card"><h2>${esc(b.title)}</h2>
          <div class="grid g2" style="margin-top:6px">${tiers.map(t => `<div class="kpi"><div class="label">${b.pyq ? "Solved" : GNAME[t.g]}</div><div class="value" style="font-size:1.5rem">${t.s + t.w}<small style="font-size:.9rem"> / ${t.n}</small></div><div class="hint">${t.w ? `<span style="color:var(--bad)">${t.w} in Error Log</span>` : "&nbsp;"}</div></div>`).join("")}</div>
          <p class="muted" style="margin-top:10px">${esc(b.notes)}</p>
          <label class="field" style="margin-top:8px"><span>Your PDF link (optional; page numbers open in your viewer)</span><input type="text" id="pdfLink" value="${esc(link || "")}" placeholder="Paste your Google Drive link"></label>
          <button class="btn sm" style="margin-top:6px" data-act="pdfSave" data-b="${b.id}">Save link</button></div>
        <div class="card"><h2>Chapter progress</h2>${chRows}</div>
      </div>
      <div class="callout section-gap"><b>Order to solve:</b> first every 🎯 GATE-likely question of the chapter you just studied, then the Good-practice ones. Self-Test questions have full solutions at the back of the book (page shown), so use them to check your method. Page numbers are the PDF's "N of 848" footer.
        <br><b>Asked in GATE?</b> The PYQ pattern shows which type of GATE question each problem trains. Which exact GATE question (year and number) matches a problem will be added once the GATE DA 2024–2026 papers are shared.</div>
      <div class="card section-gap">
        <div class="grid g4" style="align-items:end">
          <label class="field"><span>${b.pyq ? "Year" : "Chapter"}</span>${sel("ch", [["all", b.pyq ? "All years" : "All chapters"], ...Object.entries(b.chapters).map(([c, n]) => [c, b.pyq ? n : "Ch " + c + " · " + n])])}</label>
          ${b.pyq ? "" : `<label class="field"><span>GATE relevance</span>${sel("g", [["3", "🎯 GATE-likely only"], ["2", "🎯 + Good practice"]])}</label>`}
          <label class="field"><span>Syllabus topic</span>${sel("tid", [["all", "All topics"], ...tids.map(t => [t, TOPIC[t].n.split("(")[0].trim()])])}</label>
          <label class="field"><span>Status</span>${sel("st", [["todo", "Not attempted"], ["h", "Done but hard"], ["w", "Wrong"], ["s", "Done"], ["all", "All"]])}</label>
          <label class="field"><span>Section</span>${sel("sec", [["all", "All sections"], ["P", "Problems"], ["ST", "Self-Test (with solutions)"], ["TE", "Theoretical Exercises"]].filter(([v]) => v === "all" || b.q.some(q => q.s === v)))}</label>
          <label class="field"><span>Level</span>${sel("lvl", [["all", "All levels"], ["E", "Easy"], ["M", "Medium"], ["H", "Hard"]])}</label>
        </div>
        <p class="muted" style="margin:12px 0 8px">${list.length} questions match · showing ${shown.length}</p>
        ${shown.length ? `<div class="table-wrap"><table><thead><tr><th>Question</th><th class="num">PDF page</th><th>What it trains</th><th>Level</th><th>GATE</th><th>Answer</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty">Nothing matches these filters.</div>`}
        ${list.length > shown.length ? `<button class="btn" style="margin-top:10px" data-act="pfMore">Show 50 more</button>` : ""}
      </div>`;
  };

  VIEWS.errorlog = () => {
    const keys = errorLog();
    const rows = keys.map(k => { const { b, q } = qByKey(k); const pat = b.patterns[q.k]; const link = (S.settings.pdf || {})[b.id];
      return `<tr><td style="white-space:nowrap"><b>${esc(b.short)}</b><br>${qLabel(b, q)}</td>
        <td class="num">${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">p. ${q.p}</a>` : `p. ${q.p}`}</td>
        <td>${esc(q.t)}<br><small class="muted">${esc(pat.label)}</small></td>
        <td><span class="tag ${S.practice[k] === "w" ? "H" : "M"}">${STNAME[S.practice[k]]}</span></td>
        <td style="white-space:nowrap">${q.a ? `<small>Ans p. ${q.a}</small>` : ""}${q.o ? `<small>Solution p. ${q.o}</small>` : ""}</td>
        <td>${statusBtns(k)}</td></tr>`; }).join("");
    const nW = keys.filter(k => S.practice[k] === "w").length;
    return `<div class="page-head"><div><h1>Error Log</h1><p>Every practice question you marked <b>Hard</b> or <b>Wrong</b>. Re-solve them without looking at the answer. Once you can do one cleanly, mark it <b>Done</b> and it leaves the log.</p></div></div>
      <div class="grid g3"><div class="card kpi"><div class="label">In the log</div><div class="value">${keys.length}</div></div>
        <div class="card kpi"><div class="label">Wrong</div><div class="value" style="color:var(--bad)">${nW}</div></div>
        <div class="card kpi"><div class="label">Done but hard</div><div class="value" style="color:var(--warn)">${keys.length - nW}</div></div></div>
      <div class="card section-gap">${keys.length ? `<div class="table-wrap"><table><thead><tr><th>Question</th><th class="num">PDF page</th><th>What it trains</th><th>Why here</th><th>Answer</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty">Empty. Questions you mark Hard or Wrong on the Practice page appear here.</div>`}</div>
      <div class="callout section-gap"><b>How to use it:</b> go through the log every Sunday. For each question, first write down in one line why you got it wrong (the concept, a formula, or a silly slip), then re-solve it. Put that line in Short Notes if it is a trap you might repeat.</div>`;
  };

  VIEWS.books = () => {
    const totals = SUBJECTS.map(s => { const n = sum(s.topics.flatMap(t => t.p.map(p => parseInt(p[1], 10) || 0))); return [s, n]; });
    return `<div class="page-head"><div><h1>Books &amp; Practice Sources</h1><p>For every topic: one book to <b>study</b> from, one or two to <b>practise</b> from, and a question target. The exact chapter for each topic is on its card in the Syllabus Tracker.</p></div></div>
      <div class="callout" style="margin-bottom:14px"><b>Where GATE DA questions come from (trend):</b> the 2024–2026 papers follow standard textbooks closely. The syllabus wording itself comes from <b>Strang</b> (projection/idempotent matrices, SVD), <b>Ross</b> (probability &amp; tests), <b>ISL</b> (LOOCV, k-fold, ridge, LDA, bias-variance), <b>Han &amp; Kamber</b> (data transformation, concept hierarchies, distributive/algebraic/holistic measures, k-medoids), <b>AIMA</b> (variable elimination, approximate inference by sampling) and <b>Mukund's NPTEL PDSA</b> (Python DSA scope). Questions are not copied from these books, but their exercises train exactly the same ideas. Practise from them first, then from GATE CS/ST/MA PYQs on the same topic.</div>
      <div class="callout warn" style="margin-bottom:14px">You mentioned you can share book PDFs. Send me the PDFs of Strang, Ross, ISL, Han &amp; Kamber or AIMA, and I can list the exact exercise numbers to solve for each topic instead of chapter-level targets.</div>
      ${SUBJECTS.map(s => `<div class="card"><div class="row-between"><h2><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</h2><span class="tag acc">≈ ${totals.find(x => x[0] === s)[1]}+ practice Qs (excl. "all PYQs")</span></div>
        <div class="table-wrap"><table><thead><tr><th style="width:42%">Book / resource</th><th>Use it for</th></tr></thead><tbody>${s.books.map(b => `<tr><td><b>${esc(b[0])}</b></td><td>${esc(b[1])}</td></tr>`).join("")}</tbody></table></div>
        <details style="margin-top:10px"><summary style="cursor:pointer" class="muted">Topic → study chapter → practice target</summary><div class="table-wrap"><table><thead><tr><th>Topic</th><th>Study</th><th>Practice (target)</th></tr></thead><tbody>${s.topics.map(t => `<tr><td>${topicLink(t.id)}</td><td>${t.s.map(esc).join("<br>")}</td><td>${t.p.map(p => esc(p[0]) + " · <b>" + esc(p[1]) + "</b>").join("<br>")}</td></tr>`).join("")}</tbody></table></div></details></div>`).join("")}
      <div class="card"><h2>Free question banks</h2><ul style="margin:0">
        <li><b>GATE Overflow</b>: all GATE DA papers plus 30 years of GATE CS PYQs, tagged by topic (DS, algorithms, DBMS, probability, LA, calculus).</li>
        <li><b>GATE ST / MA papers</b>: statistics (tests, CIs, distributions) and linear algebra questions very close to DA.</li>
        <li><b>UC Berkeley CS188 past exams</b>: search, alpha-beta, Bayes nets, variable elimination, sampling.</li>
        <li><b>NPTEL assignments</b>: IITM Intro to ML (Ravindran), CMI PDSA with Python (Mukund), IITD Intro to AI (Mausam).</li>
        <li><b>MIT 18.06 OCW</b>: linear algebra problem sets and exams with solutions.</li>
        <li><b>ISL labs &amp; exercises</b>: solutions are available online for self-checking.</li></ul></div>`;
  };

  /* ---------- Claude ---------- */
  VIEWS.claude = () => {
    const opts = SUBJECTS.map(s => `<optgroup label="${esc(s.name)}">${s.topics.map(x => `<option value="${x.id}" ${S.ui.claudeT === x.id ? "selected" : ""}>${esc(x.n)}</option>`).join("")}</optgroup>`).join("");
    const t = TOPIC[S.ui.claudeT] || ALL_TOPICS[0];
    return `<div class="page-head"><div><h1>Study with Claude</h1><p>Turn your GO Classes topper notes into animated, visual, beginner-friendly lessons with extra questions. Claude fills in anything your notes miss.</p></div></div>
      <div class="grid g2">
        <div class="card"><h2>Workflow for every topic</h2><ol style="margin:0;padding-left:18px">
          <li>Open <b>Today</b> and pick the topic.</li>
          <li>Click <b>📋 Claude explainer prompt</b>. The prompt already contains the full sub-topic checklist, the must-know PYQ facts, how GATE asks the topic, and your maths level (zero).</li>
          <li>Open Claude (claude.ai app or web), <b>attach the GO notes PDF/photos for that topic</b>, paste the prompt and send.</li>
          <li>Claude builds an <b>interactive page</b> with animations, figures, graphs, equations explained symbol by symbol, worked examples, 10 GATE-style questions and a short-notes box. Missing items are labelled <i>“➕ Added by Claude”</i>.</li>
          <li>Study it in Pomodoros. Tick sub-topics in the Syllabus Tracker. Copy the short-notes box into <b>Short Notes</b>.</li>
          <li>After the book questions and PYQs, use <b>📋 practice-set prompt</b> for 20 extra timed questions.</li>
          <li>Stuck on a doubt? Ask Claude to “explain again as if I am in class 10, with a picture”.</li></ol></div>
        <div class="card"><h2>Tips to get the best explanations</h2><ul style="margin:0">
          <li>Upload notes for <b>one topic at a time</b>. Smaller uploads give deeper explanations.</li>
          <li>If handwriting is unclear, photograph it in good light or scan it to PDF.</li>
          <li>Ask for “more animation for step X” or “slower, with more numbers” when you need it.</li>
          <li>Ask Claude to “quiz me orally, one question at a time, and don't reveal answers until I try”.</li>
          <li>You can also upload the notes in this project chat. I can make the explainer pages and save them in this repository so everything stays in one place.</li>
          <li>At the end of a subject, use the <b>short-notes prompt</b> on the Short Notes page, and after each mock use the <b>mock analysis prompt</b>.</li></ul></div></div>
      <div class="card section-gap"><h2>Prompt generator</h2>
        <div class="btn-row"><select data-ch="claudeT" style="max-width:520px">${opts}</select><button class="btn primary" data-act="copyExplain" data-t="${t.id}">📋 Copy explainer prompt</button><button class="btn" data-act="copyPyq" data-t="${t.id}">📋 Copy practice-set prompt</button></div>
        <pre class="prompt" style="margin-top:12px">${esc(explainPrompt(t))}</pre></div>`;
  };

  /* ---------- Settings ---------- */
  VIEWS.settings = () => `<div class="page-head"><div><h1>Settings &amp; Backup</h1><p>Your progress is saved in this browser only. Export a backup every Sunday, and import it on another device to continue there.</p></div></div>
    <div class="grid g2">
      <div class="card"><h2>Plan</h2>
        <label class="field"><span>GATE DA 2027 exam date (update when the official schedule is out)</span><input type="date" data-ch="set" data-k="gate" value="${esc(S.settings.gate)}"></label>
        <label class="field" style="margin-top:10px"><span>My 4-hour busy slot</span><select data-ch="set" data-k="slot">${Object.entries(ROUTINES).map(([k, r]) => `<option value="${k}" ${S.settings.slot === k ? "selected" : ""}>${esc(r.label)}</option>`).join("")}</select></label>
        <label class="field" style="margin-top:10px"><span>Theme</span><select data-ch="set" data-k="theme">${["auto", "light", "dark"].map(x => `<option ${S.settings.theme === x ? "selected" : ""}>${x}</option>`).join("")}</select></label></div>
      <div class="card"><h2>Pomodoro</h2><div class="grid g2">
        <label class="field"><span>Focus (min)</span><input type="number" min="10" max="90" data-ch="set" data-k="focus" value="${S.settings.focus}"></label>
        <label class="field"><span>Short break (min)</span><input type="number" min="1" max="30" data-ch="set" data-k="short" value="${S.settings.short}"></label>
        <label class="field"><span>Long break (min)</span><input type="number" min="5" max="60" data-ch="set" data-k="long" value="${S.settings.long}"></label>
        <label class="field"><span>Daily target (🍅)</span><input type="number" min="1" max="40" data-ch="set" data-k="target" value="${S.settings.target}"></label></div>
        <p class="muted" style="margin-top:8px">Tip: once you are comfortable, 50/10 "deep pomodoros" also work. Set focus 50, short 10, target 10.</p></div></div>
    <div class="card section-gap"><h2>Backup</h2><div class="btn-row"><button class="btn primary" data-act="export">⬇ Export backup (.json)</button><label class="btn">⬆ Import backup<input type="file" accept="application/json" data-ch="import" hidden></label><button class="btn bad" data-act="reset">Reset everything</button></div>
      <p class="muted" style="margin-top:8px">Last saved automatically on every change. Items ticked: ${Object.keys(S.items).length} · notes: ${S.notes.length} · pomodoros: ${S.pomo.length} · mocks: ${S.mocks.length}.</p></div>`;

  /* ================= router & render ================= */
  let current = (() => { const h = (location.hash || "").slice(1); return VIEWS[h] ? h : "dashboard"; })();
  // Navigate in script; the claude.ai viewer does not reliably deliver #hash changes.
  function go(view) {
    current = VIEWS[view] ? view : "dashboard";
    try { history.replaceState(null, "", "#" + current); } catch (e) { /* sandboxed */ }
    render(); window.scrollTo(0, 0);
  }
  function render() {
    document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("active", a.dataset.v === current));
    $("#main").innerHTML = VIEWS[current]();
    if (current === "mocks") paintMistakes();
    updateBadge(); pPaint();
  }
  window.addEventListener("hashchange", () => { const h = (location.hash || "").slice(1); if (VIEWS[h] && h !== current) go(h); });

  /* ================= actions ================= */
  const ACT = {
    goto: el => { const t = TOPIC[el.dataset.t]; S.ui.subj = t.subj; S.ui.open[t.id] = true; save(); if (current !== "syllabus") go("syllabus"); else render(); setTimeout(() => { const d = document.querySelector(`details.topic[data-t="${t.id}"]`); if (d) d.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60); },
    subj: el => { S.ui.subj = el.dataset.s; save(); render(); },
    expandAll: () => { SUBJ[S.ui.subj].topics.forEach(t => S.ui.open[t.id] = true); save(); render(); },
    collapseAll: () => { S.ui.open = {}; save(); render(); },
    conf: el => { const st = ts(el.dataset.t), n = +el.dataset.n; st.conf = st.conf === n ? 0 : n; if (n <= 2 && st.conf) { addRev(el.dataset.t, "Low confidence (" + n + "★)"); toast("Low confidence: topic added to Revision."); } else if (n >= 4 && S.rev[el.dataset.t]) toast("Feeling good? Remove it from Revision once it stays easy."); save(); render(); },
    tough: el => { const id = el.dataset.t; if (S.rev[id]) { removeRev(id); toast("Removed from Revision."); } else { addRev(id, "Marked tough"); toast("Added to Revision."); } save(); render(); },
    copyExplain: el => copy(explainPrompt(TOPIC[el.dataset.t])),
    copyPyq: el => copy(pyqPrompt(TOPIC[el.dataset.t])),
    noteFor: el => { S.ui.noteSubj = TOPIC[el.dataset.t].subj; save(); go("notes"); setTimeout(() => { const s = $("#nf_t"); if (s) { s.value = el.dataset.t; $("#nf_text").focus(); } }, 50); },
    noteAdd: () => { const tid = $("#nf_t").value, text = $("#nf_text").value.trim(); if (!text) return toast("Write something first."); S.notes.push({ id: uid(), tid, subj: TOPIC[tid].subj, text, imp: $("#nf_imp").checked, date: today() }); save(); toast("Note saved to " + SUBJ[TOPIC[tid].subj].short + " short notes."); render(); },
    noteImp: el => { const n = S.notes.find(x => x.id === el.dataset.id); if (n) n.imp = !n.imp; save(); render(); },
    noteDel: el => { S.notes = S.notes.filter(x => x.id !== el.dataset.id); save(); render(); },
    noteSubj: el => { S.ui.noteSubj = el.dataset.s; save(); render(); },
    notesMd: () => { const s = SUBJ[S.ui.noteSubj] || SUBJ.la; download(s.short.replace(/\W+/g, "_") + "_short_notes.md", notesMarkdown(s), "text/markdown"); },
    notesPrompt: () => copy(subjectNotesPrompt(SUBJ[S.ui.noteSubj] || SUBJ.la)),
    print: () => window.print(),
    dayDone: () => { const d = today(); S.daysDone[d] = !S.daysDone[d]; save(); if (S.daysDone[d]) toast("Great work today. Sleep on time 😴"); render(); },
    pomoTopic: el => { P.tid = el.dataset.t; go("pomodoro"); },
    pToggle: () => { P.running ? pPause() : pStart(); },
    pReset: () => pReset(),
    pSkip: () => { P.running = false; if (P.mode === "focus") { P.cycle++; P.mode = P.cycle % 4 === 0 ? "long" : "short"; } else P.mode = "focus"; P.left = null; render(); },
    pMode: el => { P.running = false; P.mode = el.dataset.m; P.left = null; render(); },
    pUndo: () => { const i = S.pomo.map(p => p.d).lastIndexOf(today()); if (i >= 0) S.pomo.splice(i, 1); save(); render(); },
    notifPerm: () => { if ("Notification" in window) Notification.requestPermission().then(p => toast("Notifications: " + p)); else toast("This browser does not support notifications."); },
    rHard: el => { revStep(el.dataset.t, -1); save(); render(); },
    rOk: el => { revStep(el.dataset.t, 1); save(); render(); },
    rEasy: el => { revStep(el.dataset.t, 2); save(); render(); },
    rRemove: el => { removeRev(el.dataset.t); save(); toast("Removed. Well done 💪"); render(); },
    rAdd: () => { addRev($("#revAdd").value, "Added manually"); save(); render(); },
    rRoutine: el => { ts(el.dataset.t).revs++; save(); render(); },
    scrollToday: () => { const r = document.getElementById("d-" + today()); if (r) r.scrollIntoView({ block: "center", behavior: "smooth" }); else toast("Today is outside the syllabus phase."); },
    pq: el => {
      const k = el.dataset.k, v = el.dataset.v; const cur = S.practice[k];
      if (cur === v) delete S.practice[k]; else S.practice[k] = v;
      if (S.practice[k] === "h" && cur !== "h") toast("Saved to the Error Log.");
      if (S.practice[k] === "s" && (cur === "h" || cur === "w")) toast("Done. Removed from the Error Log.");
      if (v === "w" && cur !== "w") {
        const [bid, ref] = k.split(":"); const b = PBOOKS.find(x => x.id === bid); const q = b && b.q.find(x => qKey(b, x) === k);
        if (q && TOPIC[b.patterns[q.k].tid]) { addRev(b.patterns[q.k].tid, "Wrong: " + qName(b, q)); toast("Saved to the Error Log. Topic added to Revision."); }
      }
      save(); render();
    },
    pfBook: el => { S.ui.pf = { ...S.ui.pf, book: el.dataset.b, ch: "all", tid: "all", limit: 50 }; save(); render(); },
    pfMore: () => { S.ui.pf.limit += 50; save(); render(); },
    pdfSave: el => { S.settings.pdf = { ...(S.settings.pdf || {}), [el.dataset.b]: $("#pdfLink").value.trim() }; save(); toast("PDF link saved."); render(); },
    practiceTopic: el => { S.ui.pf = { ...(S.ui.pf || {}), book: el.dataset.b || (S.ui.pf || {}).book || "ross", tid: el.dataset.t, st: "all", g: "2", ch: "all", sec: "all", lvl: "all", limit: 50 }; save(); go("practice"); },
    mockToggle: () => { S.ui.mockOpen = !S.ui.mockOpen; draftMistakes = []; save(); render(); },
    mxAdd: () => { draftMistakes.push({ tid: $("#mx_t").value, type: $("#mx_type").value, note: $("#mx_note").value.trim() }); $("#mx_note").value = ""; paintMistakes(); },
    mxDel: el => { draftMistakes.splice(+el.dataset.i, 1); paintMistakes(); },
    mockSave: () => {
      const v = id => $(id).value;
      if (v("#m_score") === "") return toast("Enter the score.");
      const sec = {}; SECS.forEach(k => { const a = v("#ma_" + k), c = v("#mc_" + k), m = v("#mm_" + k); if (a || c || m) sec[k] = { a: +a || 0, c: +c || 0, m: +m || 0 }; });
      const m = { id: uid(), name: v("#m_name") || "Mock " + (S.mocks.length + 1), date: v("#m_date") || today(), source: v("#m_src"), score: +v("#m_score"), att: +v("#m_att") || 0, cor: +v("#m_cor") || 0, wr: +v("#m_wr") || 0, time: +v("#m_time") || 0, sec, mistakes: draftMistakes.slice(), reflect: v("#m_ref") };
      S.mocks.push(m);
      m.mistakes.forEach(x => addRev(x.tid, "Mock: " + m.name + " (" + x.type + ")"));
      draftMistakes = []; S.ui.mockOpen = false; save();
      toast("Mock saved." + (m.mistakes.length ? " " + m.mistakes.length + (m.mistakes.length === 1 ? " topic" : " topics") + " sent to Revision." : "")); render();
    },
    mockDel: el => { if (armed(el, "Click again to delete")) { S.mocks = S.mocks.filter(m => m.id !== el.dataset.id); save(); render(); } },
    mockPrompt: el => copy(mockPrompt(S.mocks.find(m => m.id === el.dataset.id))),
    export: () => download("gate-da-tracker-backup-" + today() + ".json", JSON.stringify(S, null, 1), "application/json"),
    reset: el => { if (armed(el, "Click again to erase everything")) { S = DEFAULT(); save(); applyTheme(); render(); } }
  };
  const CH = {
    item: el => { S.items[el.dataset.id] = el.checked; if (!el.checked) delete S.items[el.dataset.id]; const t = TOPIC[el.dataset.id.split(":")[0]]; refreshDone(t); save(); render(); },
    book: el => { ts(el.dataset.t).book = el.checked; save(); render(); },
    pyq: el => { ts(el.dataset.t).pyq = el.checked; save(); render(); },
    att: el => { const st = ts(el.dataset.t); st.att = Math.max(0, +el.value || 0); checkAcc(el.dataset.t); save(); render(); },
    cor: el => { const st = ts(el.dataset.t); st.cor = Math.max(0, Math.min(+el.value || 0, st.att || Infinity)); checkAcc(el.dataset.t); save(); render(); },
    dayDone: el => { S.daysDone[el.dataset.d] = el.checked; save(); },
    mockPlan: el => { S.mockPlanDone[el.dataset.d] = el.checked; save(); },
    pTopic: el => { P.tid = el.value; },
    pf: el => { S.ui.pf[el.dataset.k] = el.value; S.ui.pf.limit = 50; save(); render(); },
    claudeT: el => { S.ui.claudeT = el.value; save(); render(); },
    set: el => { const k = el.dataset.k; S.settings[k] = el.type === "number" ? Math.max(1, +el.value || 1) : el.value; save(); if (k === "theme") applyTheme(); if (!P.running) P.left = null; toast("Saved."); },
    import: el => {
      const f = el.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { try { const d = JSON.parse(r.result); if (!d || typeof d !== "object" || !d.settings) throw 0; const def = DEFAULT(); S = { ...def, ...d, ui: { ...def.ui, ...(d.ui || {}) }, settings: { ...def.settings, ...d.settings } }; save(); applyTheme(); toast("Backup imported."); render(); } catch (e) { toast("That file is not a valid backup."); } };
      r.readAsText(f);
    }
  };
  function armed(el, msg) {
    if (el.dataset.armed === "1") return true;
    el.dataset.armed = "1"; const old = el.textContent; el.textContent = msg;
    setTimeout(() => { el.dataset.armed = ""; el.textContent = old; }, 4000);
    return false;
  }
  function checkAcc(id) { const st = ts(id); if (st.att >= 5 && st.cor / st.att < 0.6) { addRev(id, "PYQ accuracy " + Math.round(st.cor / st.att * 100) + "%"); toast("PYQ accuracy below 60%: added to Revision."); } }

  document.addEventListener("click", e => {
    const el = e.target.closest("[data-act]");
    if (!el) {
      const a = e.target.closest('a[href^="#"]');
      if (a) { const v = a.getAttribute("href").slice(1); if (VIEWS[v]) { e.preventDefault(); go(v); } }
      return;
    }
    const fn = ACT[el.dataset.act]; if (!fn) return;
    if (el.tagName === "A" || el.tagName === "BUTTON") e.preventDefault();
    fn(el, e);
  });
  document.addEventListener("change", e => { const el = e.target.closest("[data-ch]"); if (el && CH[el.dataset.ch]) CH[el.dataset.ch](el, e); });
  document.addEventListener("toggle", e => { const d = e.target; if (d.matches && d.matches("details.topic")) { if (d.open) S.ui.open[d.dataset.t] = true; else delete S.ui.open[d.dataset.t]; save(); } }, true);
  $("#miniTimer").addEventListener("click", () => go("pomodoro"));

  applyTheme();
  render();
  initDb();
})();
