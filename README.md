# GATE DA 2027 — Rank-1 Tracker

A static website (no build, no server) for preparing for GATE DA 2027.

**Live site (after enabling GitHub Pages):** https://anshu7372.github.io/PRIYAM_GATE_DA_TRACKER/

To enable it: repo **Settings → Pages → Source: Deploy from a branch → Branch: `claude/jolly-goodall-4cooem`, folder `/ (root)` → Save**. The site goes live in 1–2 minutes.

## What's inside
| Page | What it does |
|---|---|
| **Dashboard** | Countdowns, overall and subject progress, on-track vs behind-plan status, backlog, score targets |
| **Today** | Today's Track A and Track B topics, GA task, revision due, daily routine, quick note |
| **Syllabus Tracker** | 8 subjects → 73 topics → sub-topics → 580+ sub-sub-topics. Each topic has its GATE depth, study chapter, practice book with question target, how GATE asks it, must-know facts, PYQ accuracy counter, confidence, tough flag and Claude prompts |
| **PYQ Map** | Heat-map of the whole syllabus by PYQ frequency, plus a topic-wise PYQ mapping table |
| **Schedule** | Day-by-day plan 28 Sep → 31 Dec 2026 (two parallel tracks, Sunday tests), a phase Gantt, and the January mock plan |
| **Pomodoro** | Timer with topic logging, daily target, 14-day chart, hours per subject |
| **Revision** | Tough-topic queue that fills automatically (low confidence, <60% PYQ accuracy, mock mistakes) and uses spaced repetition, with a remove button once a topic is easy. Also R1/R2/R3 revisions of completed topics |
| **Mocks & Analysis** | Log mocks with section-wise marks and tagged mistakes. Shows score trend, accuracy, marks vs target, mistake types, weakest topics, insights and a Claude analysis prompt |
| **Short Notes** | Per-subject notes plus the built-in must-remember lists. Print or download as .md |
| **Books & Practice** | Books per subject and per topic, with question targets and trend sources |
| **Study with Claude** | Prompt generator: attach your GO Classes notes, and Claude builds an animated, beginner-friendly explainer that adds anything missing |

Progress is stored in your browser's localStorage. **Export a backup every Sunday** (Settings & Backup).

PYQ frequencies come from a memory-based review of the 2024–2026 papers. Verify them as you solve the actual PYQs.
