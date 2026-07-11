# Murdoku — iPad / Web App

A playable, installable app for **Murdoku**, the murder‑mystery logic puzzles by
Manuel Garand. It contains the puzzles extracted from the two Dutch e‑books
(*Murdoku* and *Murdoku — Terug in de tijd*) and reproduces the website's core
gameplay: read the clues, reason on a grid, and identify the murderer — with a
timer, hints, a difficulty rating per case, and a progression system.

## What it is

A dependency‑free **Progressive Web App** (plain HTML/CSS/JS). It runs in any
modern browser and installs on iPad via Safari → **Share → Add to Home Screen**,
where it launches full‑screen and works offline. It can later be wrapped with
Capacitor for a native App Store build.

## Features

- **154 cases** extracted from the two books (titles, suspects, clues, room
  labels, special rules, murderer, step‑by‑step hints, difficulty, and the
  original crime‑scene illustration for each case).
- **Crime scene** — the book's real floor‑plan illustration, tap to zoom.
- **Clues** in the original Dutch, per suspect, with the victim highlighted.
- **Scratch grid** — an interactive N×N board (rows/columns match the book's
  *rij/kolom*) to place suspects while reasoning.
- **Timer** with a saved best time per case.
- **Hints** — reveal the book's own solution reasoning one step at a time.
- **Accuse** — pick the suspect; the app checks against the real murderer.
- **Difficulty** — a 1–5 skull rating per case.
- **Progression** — cases unlock in order as you solve them (can be disabled in
  settings); progress, times, and in‑progress boards are saved locally.
- **Light / dark** themes (auto by system) and offline support.

## Structure

```
index.html            app shell
css/style.css         styles (iPad‑first, theme‑aware)
js/app.js             app logic (router, play, hints, accuse, settings)
sw.js                 service worker (offline)
manifest.webmanifest  PWA manifest
data/puzzles.json     all 154 cases
assets/scenes/*.jpg   crime‑scene illustrations
icons/                app icons
tools/extract.py      the EPUB → puzzles.json extraction pipeline
```

## Run locally

```
python3 -m http.server 8099
# open http://localhost:8099/
```

## Regenerating the data

`tools/extract.py` parses the two EPUBs (fixed‑layout, PDF‑derived) into
`data/puzzles.json` plus the scene images. It reconstructs text from positioned
spans, detects suspect names vs. clue text, handles one‑ and multi‑column
layouts, and maps each case to its murderer and solution steps from the
*Oplossingen* section.

## Known limitations

- Clues are in **Dutch**, as printed in the books.
- **6** cases with highly irregular / multi‑grid layouts are not yet included
  (154 of 160), and ~15 cases in Book 2's themed sections have an approximate
  grid size or suspect list. The scene image, clues, and answer still work for
  the extracted cases. The pipeline in `tools/` can be refined to close these.
- Full **placement** checking (verifying every suspect's cell) needs the solved
  grids; the app already checks the **murderer** (the puzzle's actual answer)
  for every case where it was extracted, and the data model is ready to accept
  per‑cell solutions when added.

Puzzle content © Manuel Garand / Uitgeverij Lannoo. This app is a personal
companion for the print books.
