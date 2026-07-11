# Hand-cut puzzle art — drop-in folder

Cut the pieces out of the book pages and drop them here. Then run:

```
python3 tools/import_manual.py
```

It wires your images into `data/puzzles.json` and `assets/`, replacing the
auto-generated art for any puzzle you provide. Re-run it any time; it only
touches puzzles you've made a folder for.

## Layout — one folder per puzzle, named by the printed puzzle number

```
manual/
  book1/
    01/
      map.png              the crime-scene MAP only  (see notes)
      Adam.png             one image per suspect = the whole card
      Bella.png            (portrait + name + clue, as printed)
      Cora.png
      David.png
      Ella.png
      Vincent_victim.png   the victim: add "_victim" to the file name
      bg.txt   (optional)  the page background colour, e.g.  #eef1f0
      grid.txt (optional)  the clickable grid, e.g.  6x6      (see notes)
  book2/
    04/
      ...
```

See `CHECKLIST.md` for every puzzle number, its title, and the exact suspect
names to use.

## What to keep in mind

1. **One image per suspect = the whole card** (portrait + name + clue). Keeping
   the clue on the card is the point — some clues describe appearance.
2. **Mark exactly one victim** by adding `_victim` before the extension
   (`Valan_victim.png`). Everyone else is a suspect.
3. **Use the exact suspect name** from `CHECKLIST.md` as the file name. Letters
   (A, B, C, … and V for the victim) are assigned automatically, alphabetically,
   so the murderer and the solution grid keep lining up. Spelling matters for
   the ~48 cases that auto-check the solved grid (all of book 1).
4. **Map = the crime scene only.** Leave out the empty answer grid at the bottom
   and the "De moordenaar is …" box. A thin margin of page background around it
   is fine (it helps colour + grid detection).
5. **Cards: transparent PNG is cleanest** (cut around the scroll shape) — it
   blends on any background with no stray edges. Rectangles that include the
   page background also work. PNG keeps the text crisp.
6. **Background colour**: put the hex in `bg.txt`, or leave it out and it's
   sampled from the map's corner. The whole page adopts this colour so the cards
   sit on it seamlessly.
7. **Clickable grid**: for a normal rectangular room, skip `grid.txt` — an
   `n×n` grid is fitted to the map automatically. For an irregular room
   (cross / L / T shape) put the size and the blocked squares in `grid.txt`:

   ```
   9x8
   blocked:
   1,1
   1,2
   2,1
   ```

   `9x8` = 9 columns, 8 rows; each `r,c` under `blocked:` is a square that
   isn't part of the room (row 1 = top, column 1 = left). Blocked squares are
   shown but not clickable. Without `grid.txt` an irregular map still displays —
   just with a plain grid that may not follow the walls.
8. Roughly **consistent card proportions** make the side column look tidy, but
   it's not required.

Formats accepted: `.png`, `.jpg`, `.jpeg`, `.webp`.
