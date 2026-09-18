# 🍅 Pomodoro — Focus Timer

A beautiful, self-contained Pomodoro timer web app. No build step, no dependencies — just open it in a browser.

![modes](https://img.shields.io/badge/modes-focus%20%7C%20short%20%7C%20long-ff7a70) ![deps](https://img.shields.io/badge/dependencies-0-3fdcb4)

## Features

- **Focus / Short Break / Long Break** modes with an animated SVG progress ring
- **Smart cycle** — automatically suggests a long break after every N pomodoros (default 4), shown as cycle dots
- **Timestamp-based engine** — stays accurate even when the tab is throttled in the background
- **Task list** — add tasks, click to make one active, 🍅 counter per task, complete/rename (double-click)/delete, persisted in `localStorage`
- **Stats** — pomodoros today, focus time today, all-time sessions
- **Sound & notifications** — a pleasant synthesized chime (Web Audio, no assets), desktop notifications, live timer in the tab title + progress favicon
- **Settings** — custom durations, long-break interval, auto-start breaks/pomodoros, volume
- **Keyboard shortcuts** — `Space` start/pause · `R` reset · `N` skip · `M` mute · `1/2/3` switch modes
- **✨ Smart Routine (AI coach)** — a toggle that manages your routine for you (see below)
- Fully responsive, respects `prefers-reduced-motion`

## ✨ Smart Routine

Flip the **Smart Routine** switch and an on-device adaptive coach takes over the routine management:

- **Learns from how you actually perform** — completed sessions, mid-session abandons, and skipped breaks all feed a completion-trend model
- **Adapts durations automatically** — strong streaks stretch focus time, early quits shrink it and lengthen breaks, skipped breaks get trimmed
- **Time-of-day awareness** — if you historically struggle in a part of the day, it starts you smaller there; strong parts of the day get a little more
- **Fatigue management** — if long breaks keep getting skipped, it forces one and extends it by 5 minutes; a completed long break resets fatigue
- **Daily goal** — progress bar with a stepper; it congratulates you when you hit it
- **Explainable** — every decision shows up as a coach note ("🔥 3 in a row — stretching focus to 31m") in the card and as a toast

Everything runs locally in your browser (rules + trend statistics, no network calls, no data leaves the device). Manual timings in Settings still apply whenever the toggle is off.

## Run it

Any static file server works:

```bash
python3 -m http.server 4173
# then open http://localhost:4173
```

Or simply open `index.html` directly in your browser.

## Files

| File | Purpose |
|---|---|
| `index.html` | Markup & structure |
| `styles.css` | Theme (per-mode accent colors), layout, modals |
| `app.js` | Timer engine, tasks, stats, audio, notifications |
