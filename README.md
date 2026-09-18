# 🍅 Pomodoro Suite

A beautiful, self-contained productivity suite: a Pomodoro focus timer with an on-device AI coach, a rich Notes app, and a Calendar — locked behind a PIN screen. No build step, no dependencies, no network calls.

![pages](https://img.shields.io/badge/pages-lock%20%7C%20timer%20%7C%20notes%20%7C%20calendar-ff7a70) ![deps](https://img.shields.io/badge/dependencies-0-3fdcb4)

## 🔒 Pages & PINs

Opening the app shows the **lock screen**. Enter a PIN (keypad or keyboard):

| PIN | Opens |
|---|---|
| `123` | ⏱ Timer — focus timer + Smart Routine |
| `1234` | 📅 Calendar — month view, events, pomodoro history |
| `12345` | 📝 Notes — rich-text notes with images |

You stay unlocked in the tab until you press the 🔒 lock button (or hit `L`). This is a client-side lock screen for privacy/organisation — not real security (everything runs in the browser).

## ⏱ Timer (timer.html)

- **Focus / Short Break / Long Break** modes with an animated SVG progress ring
- **Smart cycle** — long break after every N pomodoros, shown as cycle dots
- **Timestamp-based engine** — accurate even when the tab is throttled; a running session survives switching to Notes/Calendar and even reloads
- **Task list** with per-task 🍅 counts, **stats** (today / focus time / all-time)
- **Settings** — durations, interval, auto-starts, volume, notifications
- **Keyboard** — `Space` start/pause · `R` reset · `N` skip · `M` mute · `1/2/3` modes

## ✨ Smart Routine (AI coach)

Flip the **Smart Routine** switch and an on-device adaptive coach manages your routine:

- Learns from completions, mid-session abandons and skipped breaks
- Adapts focus/break lengths; time-of-day buckets tune your starting point
- Forces + extends long breaks when fatigue builds (breaks being skipped)
- Daily goal with progress bar; every decision shown as an explainable coach note

Fully local — rules + trend statistics in `localStorage`, no network, no keys.

## 📝 Notes (notes.html)

- Multiple notes with **8 pastel colours**, pinning, search and autosave
- **Rich text** — bold / italic / underline / strikethrough, H1–H3, bullet & numbered lists, **checklists**, highlight, clear formatting
- **Images** — insert via toolbar, **drag & drop**, or **paste** (auto-compressed); click an image to download or remove it
- **Export** — any note as a standalone `.html` (images embedded); all notes as a `.json` backup; **import** backups with smart merge (newer edits win)

## 📅 Calendar (calendar.html)

- Month grid with today highlight, month navigation
- **Events** — add with optional time per day, shown as chips + an Upcoming list
- **Pomodoro history** — each day is shaded by sessions completed (from the timer's stats) with a 🍅 count
- Click any day to see its stats and manage its events

## Run it

```bash
python3 -m http.server 4173
# open http://localhost:4173 → enter a PIN
```

Or open `index.html` directly in a browser.

## Files

| File | Purpose |
|---|---|
| `index.html` | 🔒 Lock screen (PIN pad) |
| `timer.html` / `app.js` | Timer + Smart Routine |
| `notes.html` / `notes.js` | Notes app |
| `calendar.html` / `calendar.js` | Calendar |
| `auth.js` | PIN auth + page guard |
| `styles.css` | Shared theme + per-page styles |

## Tests

Minimal DOM-shim test suites that run the real scripts under Node:

```bash
node tests/test-timer.js           # timer lifecycle, tasks, settings
node tests/test-ai.js              # Smart Routine adaptations
node tests/test-notes-calendar.js  # auth/PINs, notes, calendar
```
