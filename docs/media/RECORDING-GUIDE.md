# README GIF recording guide

The README references three GIFs that don't exist yet. This is the exact shot list —
record these, drop the files in this folder with the names below, and the README
will pick them up automatically (no other changes needed).

## Tools

Any screen recorder that exports GIF or MP4 works. On macOS:

- **[Kap](https://getkap.co)** (free) — records straight to GIF, has built-in trim/crop.
- Or record with QuickTime → File → New Screen Recording, then convert with
  [gifski](https://gif.ski) (`brew install gifski`) for much smaller, sharper files
  than QuickTime's own GIF export.

## General rules for all three

- **Obsidian window width:** ~900–1000px, so the GIF stays under ~900px wide in the
  README (GitHub scales down further anyway, but smaller source = smaller file).
- **Keep it short:** 10–20 seconds each. Trim dead time — no long pauses waiting for
  a generation call to finish; cut to right before the result appears.
- **Target file size:** under 5MB each (GitHub renders large GIFs slowly). `gifski
  --fps 12 --width 900 in.mov -o out.gif` is a good starting point.
- **Use a real note**, not a placeholder Lorem Ipsum doc — something with 3–4 real
  headings so the section cards look like they'd actually help someone. Blur/redact
  anything private first.
- **Light or dark theme**, whichever you use day to day — no need to match; just be
  consistent across all three so the README doesn't look stitched together.

## 1. `generate-and-study.gif` — the hero shot

This is the first thing anyone sees. It has to sell the whole plugin in ~15 seconds.

1. Start on a note with headings, nothing generated yet.
2. Open the command palette, run **FirstRecall: Generate study material for this
   note**.
3. Cut/skip ahead to the Note Brief and section cards now visible beside the note
   (Summary / Recall question / Key terms visible on at least one card).
4. Start **Study Mode** (ribbon icon or command palette).
5. Show one recall question with its answer still hidden, then click to reveal it.

Stop there — don't show the whole note's worth of cards, just enough to read one
fully.

## 2. `note-and-cards.gif` — static-ish product shot

Lower motion than the hero shot; this one just needs to show the layout clearly.

1. A generated note, scrolled so the Note Brief and at least two full section cards
   are visible at once, in Reading view.
2. Optional: a slow scroll down the note so a few more cards come into view.
3. If you want to show off the Cornell-style layout too, do a quick toggle in
   Settings → FirstRecall → Display and show the same card in both layouts back to
   back.

This one can be a touch longer (up to ~20s) since it's mostly holding still on
content, not demonstrating an interaction.

## 3. `managed-folders.gif` — the differentiator

This is the feature that's actually hard to find anywhere else, so give it a clean
shot.

1. Settings → FirstRecall → Managed folders.
2. Add a folder (**Add folder**, pick one with a handful of notes, some already
   generated, some not).
3. Show the scan result: counts of missing / outdated / ready / failed.
4. Click **Bring study material up to date** and let it run briefly, then cut to the
   folder now showing mostly "Current."
5. Toggle **Update automatically** on for that folder.

If you can also capture a quick "edit a note → card badge flips to Outdated → auto
updates back to Current" moment, that's a great bonus fourth GIF
(`auto-update.gif`) — but it's optional; the README doesn't currently link to it.

## After recording

Send me the raw recordings (or the converted GIFs) and I'll crop, trim, resize, and
optimize them to fit the README cleanly — just drop them in this repo or share the
files directly.
