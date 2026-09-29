# Nanta Practice Site — Spec

A practice website for a school Nanta (Korean percussion) club. It holds the club's own pieces as data, plays them back with a moving highlight over grid notation that mirrors the club's handwritten charts, and runs memorization drills that slowly hide the notation until a member can play from memory.

**How to use this file with Claude Code:** put it in the repo root, then start each session with
"Read SPEC.md and do Milestone N. Do not skip ahead." Milestones are at the bottom.

---

## 1. Goals and non-goals

**Goals (v1)**
- Store any club piece as a JSON file and render it as a grid that looks like the club's charts: rows of hits, clustered into groups.
- Follow-along playback: metronome pulse, one synthesized sound per surface, current cell highlighted, adjustable tempo, loop a section or line range, mute/solo parts, count-in.
- Memorization drills: Fade, Gu-eum only, Fill the gap, Tap-along, Cue drill, Blind run.
- Per-member progress saved in the browser (localStorage).
- Works on a phone in a rehearsal room (big tap targets, readable from a distance, dark mode).
- A piece editor so officers can add pieces without editing JSON by hand (later milestone).

**Non-goals (v1)**
- No accounts, no server, no database. Everything is static files + localStorage.
- No audio recording or pitch detection. Tap-along uses keyboard/touch taps, not a microphone.
- No Western staff notation, no time signatures. The club's charts are unmetered sequences of hits, and the site respects that.

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Piece** | One performance piece. One JSON file. |
| **Part** | One player's line, e.g. "Hard part". A piece has one or more parts. |
| **Instrument** | What a part is played on (drum, bucket, cutting board…). Defines surfaces and gu-eum syllables. |
| **Surface** | A strikeable area of an instrument: head, rim, side. Each surface has its own sound. |
| **Section** | A named chunk of a piece. Sections can repeat and can crescendo across repeats. |
| **Line** | One row of the chart. Display only, adds no time. |
| **Group** | A cluster of hits within a line (what the chart separates with spaces or periods). Display only, adds no time. |
| **Pulse** | The smallest time unit. Every cell occupies exactly one pulse. |
| **Cell** | One grid square = one pulse. Holds a hit, a rest, or an extender. |
| **Hit** | A stroke: which hand(s), which surface, plus modifiers. |
| **Extender (`~`)** | One pulse of silence after a hit, because the player is making a big arm motion before the next note. Drawn as a tilde. |
| **Gu-eum (구음)** | Spoken mnemonic syllables for strokes (덩, 그, 딱…). Displayed under cells and used in drills. |
| **Cue** | A signal from the lead player that a section is about to change. Stored per section so the Cue drill can test entries. |
| **Modifier** | Extra instruction on a hit: soft, small accent, strong accent, lift, cross-arm. |

---

## 3. Data format

Club charts are not metered sheet music. They are rows of hits written in groups, with rests, arm motions and repeats marked by hand. The format mirrors that structure exactly instead of forcing bars and time signatures.

**Model:** a piece has sections; a section has, for each part, a list of lines; a line has groups; a group has cell tokens. Every token = one pulse. Lines and groups add no time; they only control layout.

### 3.1 Piece file

All pieces live in `public/pieces/*.json`. `public/pieces/index.json` lists them.

```json
{
  "id": "placeholder-hard",
  "title": "Placeholder (Hard)",
  "pulseBpm": 325,
  "linePause": 2,
  "instruments": [
    {
      "id": "drum",
      "name": "Drum",
      "defaultSurface": "head",
      "surfaces": {
        "head": { "sound": "low",   "gueum": { "R": "쿵", "L": "쿵", "B": "덩" } },
        "rim":  { "sound": "click", "gueum": { "R": "딱", "L": "딱", "B": "딱" } }
      }
    }
  ],
  "parts": [
    { "id": "hard", "name": "Hard part", "instrument": "drum", "lead": false }
  ],
  "sections": [
    {
      "id": "a",
      "name": "A",
      "repeat": 1,
      "cueIn": "",
      "lines": {
        "hard": [
          { "groups": [ ["B{덩}", "B>{덩}"], ["L_", "R_", "L_", "R_", "L_", "R_", "L", "L"] ] },
          { "groups": [ ["R'", "L", "R", "L"], ["R'", "L", "R", "L"], ["R'", "L", "R", "L"] ],
            "note": "the 1-2-3-4 line: small accent on each 1" },
          { "groups": [ ["L/R{그덩}"], ["R/L{그덩}"] ], "pauseAfter": 0 }
        ]
      }
    },
    {
      "id": "build",
      "name": "Build ×8",
      "repeat": 8,
      "crescendo": true,
      "lines": { "hard": [ { "groups": [ ["L^", "R", "R", "~"] ] } ] }
    },
    {
      "id": "ending",
      "name": "Ending",
      "tempoScale": 0.5,
      "lines": { "hard": [ { "groups": [ ["B{덩}", "~", "R:rim{딱}", "R:rim{딱}"] ] } ] }
    }
  ]
}
```

Rules:
- `pulseBpm` = pulses per minute at performance speed. Every token occupies one pulse. (Placeholder (Hard) runs at about 325 pulses/min, measured from a rehearsal recording; ~0.18 s per hit.)
- `linePause` (piece level, in pulses, default 0) is silence appended after every line. The club phrases with a short breath between chart lines, so Placeholder (Hard) uses 2. A line can override it with `pauseAfter` (0 to remove it, e.g. on a line that repeats). The pause is rendered as a small gap after the line, not as cells, and taps during it count as misses.
- `tempoScale` on a section multiplies the pulse length for that section only (0.5 = each pulse lasts twice as long). Use it for slow endings and free-time passages. Defaults to 1. The tempo slider scales on top of it.
- `lines` is keyed by part id. Within a section, every part's total pulse count must be equal. The loader validates this and reports the section id and part id on failure. Parts may have different line/group layouts.
- A part missing from a section is silent for that section (pulse count taken from the first part present).
- `repeat` defaults to 1. `crescendo: true` ramps volume from soft to full across the repeats; the player shows "rep 3 / 8".
- `note` on a line is free text drawn under that line. `cueIn` is free text shown during the count-in.
- `lead: true` marks the part whose cues drive section changes.

### 3.2 Cell token grammar

```
cell     := "-" | "~" | hit
"-"      : plain rest, one pulse, drawn empty
"~"      : extender, one pulse of silence after a big arm motion, drawn as a tilde
hit      := [ grace ] hand [":" surface] { modifier } [ "{" gueum "}" ]
grace    := hand "/"                             flam: this hand plays a soft pickup ~40 ms before the main hand, same pulse
hand     := "R" | "L" | "B"                      right hand, left hand, both
surface  := ":" + surface id, e.g. ":rim".  Omitted = instrument.defaultSurface
modifier := "_"   soft
          | "'"   small accent
          | ">"   strong accent
          | "^"   lift: raise the striking arm high after the hit (visual, same sound)
          | "x"   cross-arm: this hand crosses over to the other side for this hit
gueum    := "{" syllable "}"   override the displayed syllable, e.g. R{덩}
```

Loudness ladder: `_` < (none) < `'` < `>`. Playback gain: `_` −8 dB, `'` +3 dB, `>` +7 dB. `B` uses a heavier sound.

Modifiers may stack in any order (`R>^`, `L>x`). The renderer draws unknown modifier characters as-is instead of crashing, so new marks can appear in pieces before the code supports them.

Examples: `B>{덩}`, `R'`, `L_`, `R>^`, `Rx`, `L:rim{딱}`, `L/R{그덩}`, `~`

A grace hit (`L/R`) occupies one pulse: the grace hand plays at −10 dB about 40 ms before the main hand. The cell shows the grace letter small and the main letter large.

### 3.3 Gu-eum resolution

Displayed syllable for a hit:
1. the `{override}` if present, else
2. `instrument.surfaces[surface].gueum[hand]`, else
3. the hand letter.

Rests and `~` show no syllable.

### 3.4 Sounds

v1 uses Web Audio synthesis, one generator per `sound` id: `low` (short thump, fast decay), `mid`, `high`, `click` (noise burst for rim). Later, `sound` can point to a sample file in `public/samples/`. Cross-arm and lift do not change the sound.

---

## 4. Pages

### 4.1 Library (`/`)
- One card per piece: title, number of sections, pulse BPM, "last practiced" from progress.
- Buttons: Practice (player), Drills, Edit.
- A name field at top ("Who's practicing?") that sets the current member for progress.

### 4.2 Player (`/play/:pieceId`)
- Part selector at the top. v1 shows one part at a time (a stacked multi-part view can come later).
- Grid: each line of the chart is a row; groups are drawn as clusters with a visible gap between them; sections get a header with the section name, repeat count and crescendo marker.
- Each cell shows the hand letter large and the gu-eum syllable under it. Modifier marks: soft = small underline, small accent = small triangle above, strong accent = circle around the letter, lift = up-arrow above, cross-arm = X below. `~` draws as a large tilde. Match the club's handwriting conventions so the screen looks like the chart.
- Playback: play/pause, stop, current cell highlighted, auto-scroll so the active line is visible.
- Tempo slider: 40% to 120% of `pulseBpm`, plus a "+5 BPM every loop" toggle.
- Loop: choose a section, or a line range within the current part.
- Mute/solo per part. Muted parts still highlight.
- Count-in: four pulses of metronome before playback; if the section has `cueIn`, show it during the count-in.
- Metronome toggle: a click on every pulse, louder on the first pulse of each group.
- Keyboard: space = play/pause, ←/→ = jump one line, [ and ] = tempo −/+ 5 BPM.

### 4.3 Drills (`/drill/:pieceId`)
Pick a part, pick a section (or whole piece), pick a mode. All modes use the player engine underneath.

| Mode | Behavior | Scoring |
|---|---|---|
| **Fade** | Each loop hides an additional 15% of the section's cells (random, seeded so a hidden cell stays hidden). "Show me" button or a miss in tap mode un-hides 10%. | Loops completed at full blank |
| **Gu-eum only** | Hand letters hidden, syllables shown. Stage 2: syllables hidden too, only the pulse grid remains. | Loops completed per stage |
| **Fill the gap** | 3–6 cells blanked. Before the pulse lands, the member taps R / L / B / rest on big on-screen buttons (keys F / J / F+J / space). Correct answers reveal; wrong ones flash. | % correct |
| **Tap-along** | Member taps their part (F = left, J = right, F+J = both; screen halves on mobile). Each hit is scored against the grid: on time ±45 ms, early/late within ±110 ms, else miss. Taps during `~` or `-` count as misses. | Accuracy % and a per-cell heatmap (rushing vs dragging) |
| **Cue drill** | Only the lead part's cue cells and the metronome play. The member must tap the first hit of the next section on time. | Hit/miss per transition |
| **Blind run** | Screen goes blank, full performance tempo, member taps the whole section. Afterwards show the heatmap and the three worst lines. | Accuracy % |

Timing windows scale with tempo: multiply by `pulseBpm / currentBpm` so slow practice is not artificially easy.

### 4.4 Editor (`/edit/:pieceId`) — Milestone 7
- Grid editor: click a cell to cycle `- → R → L → B → ~ → -`; long-press or right-click opens a menu for surface, modifiers and gu-eum override.
- Line/group controls: add a group, add a line, split a group, merge groups.
- Section controls: add/rename/reorder sections, set repeat, crescendo, cueIn.
- Instrument editor: add surfaces and syllables.
- Save = download the JSON file (v1 has no backend). Load = drag a JSON file in.
- Unsaved changes warning.

### 4.5 Progress (`/progress`)
- Per member, per piece, per section: best BPM passed in Tap-along at ≥ 85% accuracy, last accuracy, attempts, last practiced date.
- One line chart per section: accuracy over time.
- Export/import progress as JSON so it can move between devices.

Stored in localStorage under `nanta.progress.v1`:

```json
{
  "members": {
    "Jaden": {
      "placeholder-hard": {
        "build": { "bestBpm": 96, "lastAccuracy": 0.82, "attempts": 14, "lastPracticed": "2026-09-27" }
      }
    }
  }
}
```

---

## 5. Visual style

The look of the site is specified in **[DESIGN.md](DESIGN.md)**: direction, palette tokens for light and dark mode, type, the dancheong ornament system, the treatment of each page, and the spec for the Library landscape art (`public/art/landscape.webp`). DESIGN.md replaces the palette and ornament notes that used to be here.

Hard rules. These come first, and if DESIGN.md ever conflicts with them, the rules win (this is a practice tool read from two meters away):
- The chart/notation area, the drill tap pad and the transport bar sit on a plain, high-contrast surface with no artwork or pattern behind them. Ornament goes around them, never under.
- Hand letters ≥ 28 px on desktop, ≥ 22 px on phones. Every notation mark (circle, triangle, underline, up-arrow, X, tilde, boxed syllable, grace letter) stays at least as legible as it was before the redesign.
- Tap targets ≥ 56 px on phones. Drill buttons fill the bottom third of the screen. No horizontal scroll at 390 px.
- No image over 300 KB. Landscape art is WebP and lazy-loaded. Nothing is added to the playback animation frame.
- No animations longer than 150 ms except the playhead.
- Korean motifs only. Styles stay in tokens.css + component CSS, no CSS framework.

---

## 6. Tech

| Layer | Choice | Notes |
|---|---|---|
| Framework | Vite + React + TypeScript | Plain JS acceptable if TS slows things down |
| Audio | Tone.js | `Tone.Transport` with scheduled callbacks and lookahead. Never `setInterval` for timing. |
| Routing | react-router | Hash router so GitHub Pages works without config |
| State | React state + a `usePlayer` hook wrapping Tone | No Redux |
| Storage | JSON under `public/pieces/`, localStorage for progress | |
| Tests | Vitest for the token parser, pulse-count validator, section expander and tap scorer | Audio and UI are tested by hand |
| Hosting | GitHub Pages (or Vercel) | `npm run build` then deploy `dist/` |

**Tempo reality check:** the club's pieces are fast. At 325 pulses/min a pulse is ~185 ms, so the Tap-along windows (±45 ms on time, ±110 ms early/late) are already most of a pulse. Keep them as specified but make them configurable in `scorer.ts` so they can be tightened later.

**Audio gotchas (known, handle up front):**
- iOS Safari and Chrome block audio until a user gesture. Call `Tone.start()` inside the first click/tap handler and show a "Tap to enable sound" overlay until it succeeds.
- Schedule sounds ahead of time on the Transport; update the highlighted cell from a `Tone.Draw` callback so visuals stay in sync.
- Changing tempo must not restart playback: `Transport.bpm.rampTo(newBpm, 0.1)`.
- Crescendo sections: compute the gain per repeat once when the section is expanded, not per note.
- `tempoScale` sections: expand.ts emits per-pulse durations, so the player schedules from the expanded timeline and never assumes a constant pulse length.

---

## 7. Project structure

```
nanta-practice/
  SPEC.md
  CLAUDE.md
  public/
    pieces/index.json
    pieces/placeholder-hard.json
    samples/                          (optional, later)
  src/
    engine/
      tokens.ts           cell token parser (grammar in 3.2)
      loadPiece.ts        parse + validate JSON, resolve gu-eum, check pulse counts
      expand.ts           flatten sections/repeats/line pauses into a timeline of pulses with duration + gain per pulse
      player.ts           Tone.js transport, scheduling, tempo, loop, mute/solo
      sounds.ts           synth voices by sound id
      scorer.ts           tap timing evaluation
    components/
      Chart.tsx           renders one part: lines → groups → cells, highlights, hides (drills)
      Cell.tsx
      Transport.tsx       play/pause/tempo/loop/mute controls
      DrillPad.tsx        big tap buttons for drills
    pages/
      Library.tsx  Player.tsx  Drills.tsx  Editor.tsx  Progress.tsx
    styles/
      tokens.css          colors, type sizes, spacing
    storage/
      progress.ts
```

Suggested `CLAUDE.md`:

```
This is the Nanta practice site. Read SPEC.md before doing anything.
Work one milestone at a time. Run `npm run dev` and check the result in a browser before marking a milestone done.
Never use setInterval/setTimeout for audio timing; use Tone.Transport.
Piece JSON is the source of truth; do not hardcode pieces in components.
The charts are unmetered: every cell is one pulse, lines and groups are layout only.
Keep components small. Keep styles in tokens.css + component CSS, no CSS framework.
```

---

## 8. Milestones and acceptance criteria

Do one per Claude Code session. Do not start the next until the acceptance list passes.

**M1 — Scaffold + data**
- Vite/React/TS project runs. `placeholder-hard.json` loads through `loadPiece`; validation errors name the section and part. Unit tests for `tokens.ts` cover every modifier, `~`, `-`, surfaces and overrides. Unit test for the pulse-count check. `expand.ts` produces the correct pulse count for a section with `repeat: 8`, honors `linePause`/`pauseAfter`, and emits longer pulse durations for a `tempoScale` section.

**M2 — Static chart**
- Player page renders the piece as lines and groups with the marks in 4.2 (circle, triangle, underline, up-arrow, X, tilde) and syllables. Looks right on a 390 px wide phone and on desktop.

**M3 — Playback engine**
- Play/pause/stop. Metronome. One sound per surface. Highlighted cell moves in time with no visible drift over 2 minutes at 140 BPM. Crescendo sections get louder per repeat. Works on iPhone after the "tap to enable sound" overlay.

**M4 — Controls**
- Tempo slider, +5 BPM per loop, section loop, line-range loop, mute/solo, count-in with cueIn text, keyboard shortcuts.

**M5 — Fade + Tap-along**
- Both drills work end to end for one part and one section. Tap scorer has unit tests for on-time/early/late/miss/extra-tap/tap-during-rest. Heatmap displays.

**M6 — Remaining drills + progress**
- Gu-eum only, Fill the gap, Cue drill, Blind run. Progress saved and shown on the Progress page. Export/import works.

**M7 — Editor**
- Can build a new 2-section piece from scratch in the editor, download it, reload the site, and play it.

**M8 — Style + deploy**
- Palette, texture, dark mode, type sizes per section 5. Deployed to GitHub Pages. Tested on one iPhone and one Android.

---

## Appendix A — Club handwriting → tokens

Confirmed with the club. Applies to all pieces unless a piece says otherwise.

| Handwritten | Meaning | Token |
|---|---|---|
| `R`, `L` | right hand, left hand | `R`, `L` |
| `B` | both hands | `B` |
| `1 2 3 4` | R L R L, one hit per number | `R L R L` |
| Triangle on a letter/number | small accent | `'` |
| Circled letter, or dot above a letter | strong accent (harder than triangle) | `>` |
| Underline | play softer (**Placeholder (Hard) only**; other pieces may use it differently) | `_` |
| `~` after a letter | rest/extender: big motion after the hit, time passes before the next note | separate `~` cell after the hit |
| Period after a letter, `!`, `!!` | nothing | ignore |
| ↑ above a letter (sometimes looks like a `4`) | after hitting with that hand, lift the arm up | `^` |
| X below, with a curved arrow | cross-arm; the arrow shows which arm crosses | `x` on the crossing hand |
| `11` above a hit | arms straight (not crossed) | no `x` |
| Korean syllable (덩, 그, 딱) | gu-eum; 딱 and boxed 딱 = rim hit. A 딱 with no hand written = both hands; a hand written next to it = that hand | `B:rim{딱}`, `R:rim{딱}` |
| 그덩 | flam: 그 is a soft pickup right before 덩. 그덩 그덩 with "L R, R L" under it = L pickup / R main, then R pickup / L main | `L/R{그덩} R/L{그덩}` |
| Period at the end of a line | short breath before the next line (~2 pulses) | `linePause: 2` on the piece |
| `×8` | repeat 8 times, starting very quiet and getting louder | section `repeat: 8, crescendo: true` |
| Scribbled-out text | dead, not played | omit |
| Ending lines (그덩 그덩 덩 딱 / 덩~ 딱 딱) | played at about half the body speed in the recording | own section with `tempoScale: 0.5` |
