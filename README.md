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

- **155 cases** extracted from the two books (titles, suspects, clues, room
  labels, special rules, murderer, step‑by‑step hints, difficulty, and the
  original crime‑scene illustration for each case).
- **Book‑faithful puzzle pages (105 cases).** Rather than re‑typesetting the
  clues, the pipeline renders the book's own fixed‑layout pages with headless
  Chromium (exact fonts + artwork) and cuts out the pieces: one card per suspect
  (portrait + name + clue, straight from the page) and the crime‑scene map on
  its own (answer grid and murderer box removed). Each puzzle page then adopts
  that case's real background colour, lays the cut‑out cards down the side and
  the map — with an aligned interactive grid — beside them, mirroring
  murdoku.com. All 77 book‑1 cases and 28 book‑2 cases are converted; the rest
  (irregular themed book‑2 layouts) fall back to the earlier clue‑text cards.
- **Case‑file home**, styled after murdoku.com: every case is a sealed kraft
  **envelope** ("CASE AVAILABLE! — click to reveal") that flips to a file card
  showing the crime‑scene peek, title, difficulty tier badge, grid size and
  suspect count. Filter by difficulty tier (Very Easy → Expert) and sort by
  difficulty or case number.
- **Crime scene** — the book's real floor‑plan illustration, tap to zoom.
- **On‑scene placement** — for 115 cases, the interactive grid is overlaid
  directly on the crime‑scene illustration (like murdoku.com), with row/column
  index labels drawn around it. The grid's pixel position is detected
  automatically from the image (see below). The other 40 cases fall back to a
  separate scratch grid so every case stays playable.
- **Tap = note, hold = place** — matching the real site: select a suspect, tap
  a cell to leave a small pencil mark, or press‑and‑hold to commit them there.
  Placing someone automatically crosses out (✕) the rest of their row and
  column. A manual **✕ tool** marks any cell impossible yourself, **⌫** erases
  one cell (hold to clear the whole grid), and **↺** undoes the last action.
- **Clues** in the original Dutch, per suspect — shown on parchment suspect
  cards that double as the placement selector, with the victim highlighted red
  as *het slachtoffer*, the selected suspect outlined, and placed suspects
  dimmed. Each card shows the suspect's **portrait** cropped straight from the
  book's clue‑page artwork (92 cases), which matters because clues sometimes
  describe a suspect's appearance; cases without a reliably‑mapped portrait use
  a colour‑coded silhouette + letter badge instead.
- **Timer** with a saved best time per case.
- **Hints** — a one‑at‑a‑time hint viewer (paged, "Hint N / total") revealing
  the book's own solution reasoning, with suspect letters shown as coloured
  badges inline.
- **Submit** — enabled once every suspect is placed. For the 48 cases with a
  recovered solution grid, it validates the whole board (marking cells
  green/red) and reveals the murderer on a correct solve; for the rest it asks
  you to name the murderer, checked against the extracted answer.
- **Difficulty** — a 1–5 rating per case, shown as a named tier badge
  (Very Easy, Easy, Medium, Hard, Expert).
- **Progress** — solved cases, best times, revealed envelopes and in‑progress
  boards are all saved locally; any case can be opened in any order.
- **First‑run tutorial** and an in‑app **how‑to‑play** reference (rules,
  controls, keyword glossary: *naast*, *alleen*, *alleen met*, *hoek*, *rij*,
  *kolom*, …), mirroring the site's onboarding.
- **Light / dark** themes (auto by system) and offline support.

## Structure

```
index.html            app shell
css/style.css         styles (iPad‑first, theme‑aware)
js/app.js             app logic (router, play, hints, accuse, settings)
sw.js                 service worker (offline)
manifest.webmanifest  PWA manifest
data/puzzles.json     all 155 cases (+ cards / map / bg / grid for 105)
assets/scenes/*.jpg   crime‑scene illustrations (full book page)
assets/cards/*.jpg    per‑suspect cut‑out cards (portrait+name+clue) <id>_<letter>.jpg
assets/maps/*.jpg     cropped crime‑scene map only (no answer grid) <id>.jpg
assets/portraits/*.jpg  per‑suspect portrait crops (legacy fallback)
icons/                app icons
tools/extract.py      the EPUB → puzzles.json extraction pipeline
tools/extract_grids.py  solution-grid recovery from the Oplossingen pages
tools/render_pages.cjs  renders book xhtml pages to PNG (headless Chromium)
tools/build_assets.py   renders each page pair, cuts out the suspect cards +
                        the map, samples the background colour, detects the grid
tools/detect_grid.py  detects each scene's grid box for on-scene placement
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
- Full **placement** checking is available for **48 cases across both books**.
  Their solved grids were recovered automatically because each suspect's letter
  is positioned at its cell in the *Oplossingen* pages, so `(row, col)` falls out
  of ranking the coordinates (every case is a permutation — one person per row
  and column). Grids are matched to puzzles by title/murderer proximity and
  validated against the puzzles' positional clues (zero violations); only grids
  whose letters exactly match the extracted suspects are shipped. The rest are
  limited by suspect‑list extraction accuracy on irregular layouts. Every case
  where a murderer was extracted (143/155) still checks the **murderer** — the
  puzzle's actual answer.
- The original Book 2 EPUB (`Manuel_Garand-Murdoku_-_Terug_in_de_tijd.epub`) is
  kept in the repo because the pipeline needs the source fixed‑layout files to
  regenerate the data; it is not used at runtime.
- **On‑scene grid detection** works for **115/155** cases. It locates the
  illustration's black grid border via dark‑pixel row/column projections, then
  divides it evenly by the puzzle's suspect count `n` — validated to ~5px
  accuracy against precisely‑detected interior lines, and further gated by a
  corner‑darkness check that rejects irregular/rotated room outlines a plain
  bounding box can't represent. The remaining 40 cases (non‑square or
  irregular layouts) use the separate scratch grid instead.
- **Suspect portraits are now shipped for 92 cases.** Each clue page draws
  every suspect as a framed portrait in a grid, with a blank name banner
  underneath; the suspect's *name* is printed on that banner as absolutely
  positioned text, so the name span's pixel position identifies which portrait
  is whose — no guessing. `tools/extract_portraits.py` locates each known
  suspect name on the page, clusters the names into the portrait grid, and
  crops the illustration sitting above each banner into `assets/portraits/`.
  This covers **all 77 book‑1 cases and 15 book‑1‑style book‑2 cases** (794
  portraits). The remaining ~60 book‑2 cases are in themed sections whose
  suspect *lists* are themselves only approximately extracted; the pipeline
  deliberately refuses to place a portrait it can't tie to a verified name
  (mislabelling a face in a suspect‑ID game is the real risk), so those cases
  fall back to the colour‑coded silhouette + letter badge.

Puzzle content © Manuel Garand / Uitgeverij Lannoo. This app is a personal
companion for the print books.
