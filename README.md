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
- Fully responsive, respects `prefers-reduced-motion`

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
