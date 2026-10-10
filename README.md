# RegFit

A small web app for a personal trainer: today's sessions, clients with their personal bests and past workouts, a session builder (start from scratch or copy a previous session), and an editable exercise library. Built for iPad and iPhone.

It is a static site — plain HTML, CSS and JavaScript modules, no build step.

## Run locally

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765.

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository (the files at the repository root).
2. In the repository, go to **Settings → Pages**, set **Source** to *Deploy from a branch*, pick `main` and `/ (root)`, and save.
3. After a minute the app is live at `https://<your-username>.github.io/<repo-name>/`.

When you ship changes, bump `VERSION` in `sw.js` so installed copies pick up the new files.

## Install on iPad / iPhone

Open the site in Safari → **Share** → **Add to Home Screen**. It then opens full-screen and works offline.

## Data

All data is stored in the browser on that device (`localStorage`). Devices do not sync with each other. Use **Settings → Export backup** to save a JSON backup, and **Import backup** to restore it or move it to another device. The app starts with demo clients and sessions; **Settings → Erase clients & sessions** clears them.

## Code map

- `index.html` — app shell (sidebar, tab bar)
- `styles.css` — all styling; breakpoints: sidebar ≥1024px, icon rail 700–1023px, tab bar <700px
- `js/app.js` — hash router, event delegation, toast/modal
- `js/store.js` — data model, persistence, demo data, personal-best logic
- `js/views/*.js` — one module per screen
- `js/pdf.js` — client training-summary PDF (name only, no other personal details)
- `vendor/jspdf.umd.min.js` — [jsPDF](https://github.com/parallax/jsPDF) 4.2.1, MIT licence
- `fonts/` — Manrope (SIL Open Font License, see `fonts/OFL.txt`), embedded in exported PDFs
- `sw.js`, `manifest.webmanifest`, `icons/` — installable/offline support
