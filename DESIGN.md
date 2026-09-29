# Nanta Practice — Design

Status: approved and built in Milestone 8, 2026-09-28. The approved decisions are in §9.
SPEC.md §5 holds the hard rules. This file describes the look and how it keeps those rules.

---

## 1. Direction

**Painted beams, plain paper (단청 들보, 한지 판).** The site is built like a Korean hall. Saturated, dancheong-painted structure (beams, lintels, name boards) frames plain hanji paper, and all practice happens on the paper. The ornament spans, frames and divides. It never sits under notation, the tap pad or the transport bar.

Everything on screen belongs to one of three layers:

| Layer | What it is | Look |
|---|---|---|
| **Structure** | App header, Library hero, page-title plaques, section beams, card lintels | Bold: jade ground, graded blue/jade stripes, vermilion edges, ivory dividing lines, gold only in fine lines |
| **Paper** | Chart panel, drill pad, transport bar, forms, tables, cards | Plain: flat ivory (dark: charcoal), a thin ink frame, no texture, no pattern |
| **Signals** | Playhead, cued cell, accents, misses, heat, reveals | Functional colors, used only on paper, with the same meaning as today |

**Ornament follows the grades of dancheong.** Real buildings are painted at different densities, and each page gets the grade that fits its job:

| Grade | On a building | On this site |
|---|---|---|
| 금단청 geum (full) | Every surface patterned | **Library**: painted hero, plaque, lintelled cards |
| 얼금단청 eolgeum (medium) | Ends plus some center work | **Progress**: plaque, lintelled cards |
| 모로단청 moro (ends only) | Patterns only at the ends of each beam; the middle left plain | **Player, Drills**: ornament at the top and edges, and plain paper wherever notation is |
| 긋기단청 geutgi (lines) | Painted edge lines only | **Editor**: thin lines; a dense tool stays calm |
| 가칠 gachil (plain coat) | One flat color | Errors and loading messages |

**From the reference sites, mood only.** Moowoosoo Academy shows how confident a large traditional painting looks as a first impression. Dancheong Studio shows pattern carrying an identity. We take nothing else from them: no assets, layouts or branding. Our hero is a painting set into a painted beam, not a full-bleed slider with a slogan over it. Our patterns are drawn from scratch. Our brand mark is a drum head.

---

## 2. Palette

### 2.1 Pigments

These are fixed colors, the same in both themes. Components never use them directly; they use the roles in 2.2. The one exception is ornament drawings, which are painted in pigments.

| Token | Hex | Traditional name | Used for |
|---|---|---|---|
| `--jade-900` | `#0e3a30` | 하엽 (dark) | Deepest hwi stripe (dark tiles) |
| `--jade-800` | `#134b3e` | 하엽 | Header beam (dark), dark hwi stripe |
| `--jade-700` | `#1a6150` | 뇌록/하엽, **rich jade** | Header beam, hero end zones, primary buttons |
| `--jade-500` | `#2b8a6e` | 양록 | Middle hwi stripe, rosette petals |
| `--jade-300` | `#86c4aa` | 양록 (light) | Light hwi stripe, dark-mode button edge |
| `--jade-100` | `#d7ede3` | | Tints (rarely) |
| `--blue-900` | `#14285e` | 삼청 (dark), **deep blue** | Plaque ground, dark hwi stripe |
| `--blue-700` | `#1e4596` | 삼청 | Playhead (light), links, focus |
| `--blue-500` | `#3a6cc8` | 양청 | Middle hwi stripe |
| `--blue-300` | `#93b2ec` | 양청 (light) | Light hwi stripe, playhead (dark) |
| `--blue-100` | `#dce5f7` | | Tints (rarely) |
| `--vermilion-800` | `#8a2a1e` | 석간주 | Deep red ornament (dim tiles) |
| `--vermilion-600` | `#c0392b` | 주홍, **vermilion** | Strong accents, misses, band rules, plaque frame |
| `--vermilion-500` | `#d9482f` | 장단 | Rosette petals |
| `--vermilion-400` | `#e86a48` | | Accents and misses (dark) |
| `--vermilion-200` | `#f5b9a0` | | Rosette inner petals |
| `--gold-700` | `#7c5e1a` | | Text only: late verdicts on paper |
| `--gold-500` | `#b38a32` | **restrained gold** | Hairlines, the ring of the brand mark |
| `--gold-400` | `#d1a43f` | 황 | Rosette heart, the yellow of the samtaegeuk |
| `--gold-200` | `#ebd59a` | | English labels under Korean text on beams and plaques |
| `--yellow-600` | `#d49b17` | | Signal: dragging heat (light) |
| `--yellow-400` | `#e9b949` | | Signal: reveal, solo, dragging heat (dark) |
| `--ivory-50` | `#fffbf3` | 한지 (bleached), **warm ivory** | Paper surfaces; light text on beams and fills |
| `--ivory-100` | `#f6eedc` | 한지 | Page ground |
| `--ivory-200` | `#ede1c8` | | Placeholder fill |
| `--ivory-400` | `#d6c6a4` | | Dividing lines in dim tiles |
| `--ink-1000` | `#0e0d0b` | 먹 | Page ground (dark) |
| `--ink-950` | `#141311` | | Paper (dark) |
| `--ink-900` | `#1a1714` | 먹 | Text; ink outlines in ornament |
| `--ink-700` | `#3d372f` | | Panel frame (light) |
| `--ink-600` | `#5e564a` | | Muted text (light) |
| `--ink-500` | `#6f6759` | | Panel frame (dark) |
| `--ink-300` | `#b5aa95` | | Muted text (dark) |

Gold is restrained on purpose. It appears as lines no wider than 2 px, in the heart of the rosette, in the brand ring and in the English labels on beams and plaques. It is never a large fill and never a metallic gradient.

### 2.2 Roles (light / dark)

These replace the current role tokens in `tokens.css`. The names already in the code (`--bg`, `--fg`, `--surface`, `--playhead`, `--danger`, `--reveal`, `--link`, `--cell-bg`, `--border`) keep their meaning. New names cover places where the code hardcodes `--obang-*` or hex values today.

| Role | Light | Dark | Meaning |
|---|---|---|---|
| `--bg` | `ivory-100` | `ink-1000` | Page ground (hanji texture on top, light theme only) |
| `--surface` | `ivory-50` | `ink-950` | Paper: chart panel, transport, pad, cards, panels |
| `--fg` | `ink-900` | `ivory-50` | Text, hand letters, marks |
| `--fg-muted` | `ink-600` | `ink-300` | Muted text, line numbers, the tilde, the breath period |
| `--border` | ink at 22% | ivory-50 at 22% | Control outlines; dashed rest and hidden cells |
| `--frame` | `ink-700` | `ink-500` | The 1.5 px frame around paper panels |
| `--cell-bg` | ink at 5% | ivory-50 at 7% | Cell squares (unchanged idea) |
| `--beam` / `--on-beam` | `jade-700` / `ivory-50` | `jade-800` / `ivory-50` | Header beam, hero end zones |
| `--plaque` / `--on-plaque` | `blue-900` / `ivory-50` | same | Page-title plaques |
| `--gloss` / `--gloss-on-color` | `fg-muted` / `gold-200` | same | The English label under Korean display text, on paper / on beams and plaques |
| `--action` / `--on-action` | `jade-700` / `ivory-50` | `jade-700` / `ivory-50` | Primary buttons, selected choices |
| `--action-edge` | `jade-700` | `jade-300` | 2 px border of primary and selected buttons |
| `--playhead` / `--on-playhead` | `blue-700` / `ivory-50` | `blue-300` / `ink-900` | Playhead fill, cued ring, current line number, loop marks, count-in beat |
| `--playhead-wash` | blue-700 at 12% | blue-300 at 16% | Editor drop overlay |
| `--danger` / `--on-danger` | `vermilion-600` / `ivory-50` | `vermilion-400` / `ink-900` | Strong accents, misses, errors, cresc., rep, mute |
| `--reveal` / `--on-reveal` | `yellow-400` / `ink-900` | same | "Show me", solo, the "saved in this browser" badge |
| `--heat-early` | = `--playhead` | = `--playhead` | Rushing bar |
| `--heat-late` | `yellow-600` | `yellow-400` | Dragging bar |
| `--heat-miss` | = `--danger` | = `--danger` | Missed bar, the letter of a missed cell, wrong ring |
| `--late-text` | `gold-700` | `yellow-400` | "late +40 ms" verdicts and stats (replaces `#a37b12`) |
| `--link` / `--focus` | `blue-700` | `blue-300` | Links; 3 px focus ring on paper |
| `--focus-on-color` | `ivory-50` | `ivory-50` | Focus ring on beams, plaques and filled buttons |

Dark mode flips the playhead: a light-blue fill with ink letters instead of ivory letters on dark blue. The current dark playhead barely stands out from the page (2.8:1); the new one reaches 8.7:1 (see 2.4).

### 2.3 Color grammar

Each hue means one thing, so a glance from 2 m is enough:

- **Blue is where the music is.** Playhead, cued cell, current line number, loop marks, count-in beat, rushing heat. It is also used for links and focus rings, and nothing else.
- **Jade is your choice, and go.** Play, Practice, Save, the selected part and drill mode, a pressed pad half. It is also the ground of the painted structure. (Today these use blue; moving them to jade leaves blue for the music alone.)
- **Vermilion is attention.** Strong accents, misses, errors, crescendo, repeat count, mute.
- **Yellow is reveal and drag.** Show me, solo, dragging heat, new-in-this-browser.
- **Gold is ornament only.** It is never a signal.

### 2.4 Legibility: notation colors, now vs proposed

These are WCAG contrast ratios, computed from the token values: today's `tokens.css` vs this palette, each against the surface it actually sits on. Every notation pair keeps or improves its contrast in both themes.

| Pair | Light now → new | Dark now → new |
|---|---|---|
| Hand letter and every mark (circle, triangle, underline, up-arrow, X, boxed syllable, grace letter) on a cell | 14.0 → **15.7** | 13.9 → **15.2** |
| Extender tilde on a cell | 4.6 → **6.4** | 6.1 → **6.8** |
| Line number, breath period | 5.1 → **7.0** | 7.2 → **8.1** |
| Rest / hidden-cell dashed box | 1.4 → **1.6** | 1.7 → **2.0** |
| Playhead letter on playhead fill | 5.8 → **8.7** | 5.8 → **8.3** |
| Playhead fill vs chart surface | 5.8 → **8.7** | 2.8 → **8.7** |
| Cued cell (blue letter) | 5.3 → **7.9** | 2.4 → **7.3** |
| Heat bar: rushing | 5.3 → **7.9** | 2.4 → **7.3** |
| Heat bar: dragging | 1.5 → **2.2** | 8.6 → **8.6** |
| Heat bar: missed; missed letter; wrong ring | 4.3 → **4.8** | 3.0 → **4.9** |
| Late verdict text | 3.8 → **5.9** | 9.2 → **10.2** |
| Accent text (cresc., rep, errors) | 4.7 → **5.3** | 3.5 → **5.8** |

The structure pairs also pass: ivory on the jade beam is 7.1 (dark 9.7), a title on a plaque 13.6, an English label on the beam 5.1 and on a plaque 9.7, primary button text 7.1. The dark primary button's fill is only 2.7:1 against the page, so it gets the `--action-edge` border (9.7:1).

---

## 3. Type

| Role | Face | Weight | Desktop / phone | Where |
|---|---|---|---|---|
| Page name on a plaque (Korean) | **Noto Serif KR** | 900 | 40 / 30 px (hanging), 30 / 24 px (compact) | Every page title |
| Brand (Korean) | Noto Serif KR | 900 | 22 / 19 px | Header: 난타 연습 |
| Nav labels (Korean) | Noto Serif KR | 700 | 17–18 px | Header and page nav |
| English label beneath | current system stack | 700 | 12–16 px | Under every Korean nav item and page title |
| Piece title | Noto Serif KR | 900 | 30 / 24 px | Player, Drills, Editor (the page's h1) |
| Card and section titles | Noto Serif KR | 700 | cards 28 / 24 px, sections 22 / 20 px | Piece cards, chart section names, Progress piece titles |
| Hand letters | **Noto Sans KR** | 800 | **28 / 22 px (unchanged)** | Cells, legend, grace letters |
| Gu-eum syllables | Noto Sans KR | 800 | 14 / 12 px (unchanged) | Cells |
| Pad letters, count-in beat | Noto Sans KR | 800 | hand + 16 px, hand + 12 px (unchanged) | Drill pad, count-in |
| UI text | current system stack | 400 / 600 / 800 | 16 / 13 px (unchanged) | Everything else |

- **Why these faces.** Noto Serif KR is a Myeongjo, the Korean book and woodblock letterform. At 900 it has the weight of a painted name board and covers full Hangul and good Latin. Noto Sans KR 800 is as heavy as today's letters and has open counters, so R and B should stay distinct at 22 px (see the check below). It also draws Latin letters and Hangul syllables from one family on every phone. Today that depends on the device (SF, Roboto, Segoe; Apple SD Gothic, Malgun Gothic).
- **Tokens:** `--font-display: 'Noto Serif KR', 'Nanum Myeongjo', AppleMyungjo, Batang, Georgia, serif`; `--font-notation: 'Noto Sans KR', system-ui, -apple-system, 'Segoe UI', Roboto, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`; `--font` stays the current system stack. New size tokens: `--title-size`, `--title-compact-size`, `--card-title-size`, `--section-size`. `--hand-size` and `--gueum-size` do not change.
- **Loading:** one `<link>` in `index.html`, after preconnects to `fonts.googleapis.com` and `fonts.gstatic.com`: `https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@800&family=Noto+Serif+KR:wght@700;900&display=swap`. Checked 2026-09-28: both families serve these weights, split into 124 unicode-range slices per weight, and a page downloads only the slices its characters use. The Latin slice is 14 KB (Sans 800) and 19 KB (Serif 900); a Hangul slice is 8–11 KB (Sans) and 15–22 KB (Serif). The placeholder piece's syllables (그, 덩, 딱) need three Hangul slices.
- **Check before keeping the notation font:** compare the legend (every mark) at 22 and 28 px, before and after, on a phone at 2 m. The letter must sit centered in the strong-accent circle. Noto Sans KR's tall line metrics can set Latin letters a pixel or so lower than today's font, so allow a 1–2 px nudge. If anything reads worse, keep the system stack for hand letters and use Noto Sans KR only for syllables.
- Keep `font-variant-numeric: tabular-nums` on BPM, counts and the count-in. Do not use faux bold or italics in Hangul.

---

## 4. Ornament system

### 4.1 Motif rules

**Only Korean motifs, all drawn from scratch for this site.** No assets, traced art or icon packs.

| Allowed | Where it comes from |
|---|---|
| 휘 hwi | Graded, curved stripes that run along dancheong beams |
| 머리초 meoricho | The lotus rosette painted at each end of a beam |
| 긋기 geutgi | Parallel painted lines along the edges of a member |
| 별지화 byeoljihwa | A framed picture set into the middle of a beam (the hero) |
| 현판 hyeonpan | A building's name board (page titles) |
| 삼태극 samtaegeuk | The three-color swirl painted on Korean buk drum heads (brand mark only) |
| 한지 hanji | Mulberry-paper fibers (page ground only) |

**Never use:** Japanese seigaiha, asanoha, kikkō or shippō patterns; sakura; kamon crests; a 16-petal gold roundel (the chrysanthemum seal); mitsudomoe or taiko graphics; torii. Chinese ruyi clouds, dragons, lanterns, or red-and-gold "fortune" treatments. The black-and-white taijitu with dots. Tibetan or Indian mandalas. Faux-Asian "brush" display fonts. 卍. Flag elements (태극기 trigrams).

The samtaegeuk always has three colors (vermilion, deep blue, yellow) that fill the whole disc with no gaps. Never draw it in one color, or as three separate tadpoles in a ring: that is the Japanese mitsudomoe.

### 4.2 The elements

**O1. Hwi band (휘띠), the main border.** It comes in sizes L and M.
- *Drawing:* a repeating SVG tile, viewBox `0 0 48 16`, kept as an inline data URI in `tokens.css` (`--orn-hwi`). The 먹선/분선 edge lines (1 px ink, then 1 px ivory, along both edges) are a CSS gradient (`--orn-edges`) so they stay crisp at any scale. The tile holds two groups of stripes, 24 units wide each. A group is three stripes 6 units wide, graded dark → middle → light, and each stripe is followed by a 2-unit ivory dividing line. Each stripe's edges are shallow ")" curves: a quadratic curve from the top edge to the bottom edge, bulging 4 units at mid-height. The first group is jade (`jade-800`, `jade-500`, `jade-300`) and the second is blue (`blue-900`, `blue-500`, `blue-300`).
- *Mirroring:* on header and hero bands, the right half uses the tile flipped horizontally, so the stripes bow toward the center. Real beams do this, with the hwi radiating from both painted ends.
- *Band M:* the tile scaled to **12 px** tall (10 px on phones). Used for section beams, card lintels and the header's lower edge. Section beams get 8 px solid `vermilion-600` end caps at both ends: the painted end of the beam.
- *Band L:* **24 px** tall (16 px on phones): 1 px ink, 3 px `vermilion-600`, then the hwi tile at 16 px, then 3 px vermilion and 1 px ink. On phones the rules are 2 px and the tile 10 px. Used under the Library hero and the Progress plaque.
- *Dark theme:* a `-dim` tile with the same drawing. Dividing lines are `ivory-400` and each stripe is one step darker, so a band does not glare at night. Bands carry their own ground, so they read the same on either page color.

**O2. Geutgi lines (긋기선), band S.** **6 px** of parallel lines, top to bottom: 1 px `ink-900`, 2 px `vermilion-600`, 1 px `ivory-50`, 2 px `jade-700`. This is a pure CSS gradient with no image. Used for the top edge of the transport bar and the drill pad, the bottom edge of the editor toolbar, and editor section heads.

**O3. Meoricho rosette (머리초 연화).** Inline SVG, viewBox `0 0 96 96`, centered at (48, 48).
- An outer ring of 8 pointed petals reaching radius 46. They alternate `jade-700` and `blue-700`, and each holds an inner petal of its light tone (`jade-300` / `blue-300`) set in 5 units, separated by a 1.5-unit ivory line. Outlines are 1-unit ink.
- An inner ring of 8 petals reaching radius 32, rotated 22.5°: `vermilion-500` with `vermilion-200` inner petals and ivory dividing lines.
- A heart: a disc of radius 13 in `gold-400` with an ink outline, 8 ivory seed dots (radius 1.6) on a circle of radius 8, and a `vermilion-600` dot of radius 3 in the center.
- *Sizes:* 20, 32, 48 or 96 px. Below 20 px, use a plain vermilion dot instead. Uses: hero end zones, either side of the Library plaque, and empty states. It is decorative (`aria-hidden`).

**O4. Plaque (현판), the page title.** Deep-blue `--plaque` ground, a **5 px `vermilion-600` frame** (4 px on phones), a 1 px `gold-400` line inside the frame, and a 1 px ink line outside it. Inside, the page name in Korean (`--on-plaque`, Noto Serif KR 900) with its English label beneath (`--gloss-on-color`). The plaque is only as wide as its text, never wider than its container, and titles wrap. Corners are square; there is no soft shadow. It has three variants:
- *Hanging:* centered, with its top edge on the center line of the Band L above it, so it hangs from the beam. Title 40 / 30 px, padding 16 × 32 px (12 × 20 px on phones).
- *Compact:* beside the piece title on Player and Drills. Title 30 / 24 px, padding 10 × 16 px.
- *Lines:* the Editor's (긋기): Korean over English on the paper, with no board and no band of its own.

**O5. Samtaegeuk drum mark (삼태극 북), the brand.** Inline SVG, viewBox `0 0 100 100`. From the outside in: a 1-unit ink outline, a 4-unit `ivory-50` rim (the drum hide), a 1.5-unit `gold-500` ring, then a samtaegeuk filling the disc. It has three interlocking comma regions, swirling clockwise, in `vermilion-600`, `blue-700` and `gold-400`. Header: 36 px (32 px on phones). The same drawing replaces Vite's purple default in `public/favicon.svg`.

**O6. Hanji ground.** A faint fiber texture: long, sparse fibers, tiled every 256 px, as an inline SVG data URI in `tokens.css` (`--orn-hanji`, under 1 KB). It appears on the page ground of Library and Progress only, never on `--surface`, and changes page brightness by less than 3%. Player, Drills and Editor keep a plain ground, so a playhead repaint never redraws texture. The dark theme has no texture.

### 4.3 Placement rules

1. **Ornament never goes under notation, the pad or the transport.** Those elements, and every element inside them, have `background-image: none`. Bands go on their edges, outside the content box, as pseudo-elements.
2. **Clear space:** at least 12 px (10 px on phones) between any band and the nearest letter, mark, line number or control.
3. **A section beam is a divider, not a background.** It sits between blocks of lines, like a ruled line on a paper chart. The section name, badges and pulse count sit on plain paper below it. In the chart, bands are never taller than Band M.
4. **One band per edge.** Do not stack two bands. Where the header's Band M meets the hero, the hero's top edge has no band of its own.
5. **Ornament is static.** No animation, no transition, no hover effect, no parallax, and no `background-attachment: fixed`. No `filter`, `backdrop-filter` or `mix-blend-mode` on ornament or on paper panels. Replace the Play button's hover `filter: brightness()` with a color change.
6. Ornament is decorative: CSS backgrounds, or SVG marked `aria-hidden`. Korean labels carry `lang="ko"`; both lines of a bilingual label are read out.

### 4.4 Implementation shape

- **Tokens** (in `tokens.css`): the pigments and roles above; `--band-l`, `--band-m`, `--band-s` (with phone values); `--orn-hwi` (swapped to the `-dim` file in the dark block); `--orn-lines` (the band S gradient); `--orn-hanji`; `--radius: 6px` for controls (was 8 px); and a new `--radius-panel: 2px` for panels, cards and plaques, which are square like timber. Retire `--obang-*` and `--dancheong-stripe`.
- **Files:** the hwi tiles and the hanji texture are inline SVG data URIs in `tokens.css`, each under 1 KB. They are not separate files because Vite does not rewrite `url()` inside custom properties. Components, each with its own CSS: `BeamBand` (the mirrored header and hero bands), `BeamTitle` (Band L with the hanging plaque), `Plaque`, `BiLabel`, `PageNav`, `Rosette`, `BrandMark` and `LandscapeHero`. `pageNames.ts` holds the bilingual page names.
- **Techniques:** bands that are not mirrored (section beams, card lintels, band S on the transport, pad and toolbar) are pseudo-elements or backgrounds, so playback re-renders do no extra work for them. The mirrored header and hero bands are `BeamBand`: two halves anchored at the center, the right one flipped. **Never use `100vw`**: it includes the scrollbar and scrolls sideways on Windows. Bleed to the edges with negative margins, the way the transport bar already does, or place full-width parts outside `.app-main`'s max width.
- **Playback stays untouched.** No new React state, effect, listener or rAF work. Nothing is added to `Tone.Draw` callbacks. Components that re-render with the playhead (`ChartLine`, `Cell`, `SectionHeader`) gain only static CSS.

---

## 5. Pages

### 5.1 Shared

- **Header beam** (every page): `--beam` ground, **72 px** tall (56 px on phones), static rather than sticky. Its lower edge is a mirrored Band M. On the left is the brand link: the drum mark, then 난타 연습 with "Nanta Practice" beneath. On the right, 연습 기록 with "Progress" beneath. Both links are ≥ 56 px tall on phones, and focus rings on the beam use `--focus-on-color`. Add `<meta name="theme-color">` in `jade-700` / `jade-800` so phone browser bars match the beam.
- **Page nav** (← 곡 목록 / Library, 연습 / Player, 연습 기록 / Progress): bilingual links, Korean over English, each at least 56 × 56 px on phones.
- **Paper panels** (legend, loop and mixer panel, drill setup, member field, progress tools, cards): `--surface`, a 1.5 px `--frame`, `--radius-panel`, no shadow.
- **Buttons:** primary and selected use `--action` fill and `--action-edge`; secondary buttons are outlined in `--border` and turn `--fg` on hover; destructive buttons use `--danger` on hover. Toggles keep their ink "on" pill. Mute (vermilion) and solo (yellow) keep their colors.

### 5.2 Library `/`: 금단청, full

```
┌────────────────────────────────────────────────────────────────┐
│ (o) Nanta Practice                                    Progress │  header beam, jade
│     난타 연습                                                  │
├))))))))))))))))))))))))))))))))((((((((((((((((((((((((((((((((┤  Band M, mirrored
│ jade         ┌──────────────────────────────┐          jade │
│  @           │ painting panel (별지화), the │           @  │  hero beam
│ end          │ whole painting, framed       │         end  │  (@ = rosette)
│              └──────────────────────────────┘              │
│                 김홍도 〈무동〉 · credit label                │
├#=====)))))))))))))))))))┏━━━━━━━━━━━━━┓(((((((((((((((((((====#┤  Band L, mirrored
                          ┃   곡 목록   ┃
                     @    ┃   Library   ┃    @     hanging plaque
                          ┗━━━━━━━━━━━━━┛         painting credit
  Who's practicing? [________________]               [+ New piece]
  ┌))))))))))))))))))))))))))))))))))┐   card: Band M lintel,
  │ Placeholder (Hard)               │   paper, 1.5 px frame
  │ 3 sections · 325 pulses/min      │
  │ Last practiced: never            │
  │ [ Practice ] [ Drills ] [ Edit ] │
  └──────────────────────────────────┘
```

- **Hero beam:** full viewport width, with a `--beam` ground. The painting hangs in the middle as a framed panel, shown **whole at its own aspect ratio**, never cropped. The ratio comes from the image's pixel size (`--art-w` / `--art-h`, set in `LandscapeHero.tsx`). The panel is `min(58vh, 560px)` tall, and never wider than the page column, so the plaque stays in the first screen. A 4 px `vermilion-600` frame with a 1 px `gold-500` line inside and a 1 px ink line outside surrounds it. A credit label sits under the frame on the jade (§6). The **end zones** are the jade fields left and right. When a zone is at least 128 px wide it shows a rosette, sized to the zone's width minus 48 px and at most 176 px, centered.
- **Plaque:** hanging, 곡 목록 over "Library". A rosette sits on the band on each side of it, 48 px (32 px on phones) and 16 px clear of the plaque. The painting's credit sits under its frame, in the hero.
- **Phones (≤ 600 px):** the framed painting is at most 46vh tall and at most the page column wide, centered on the jade (330 × 388 px on a 390 × 844 phone), above a 16 px Band L with the plaque hanging from it.
- The **member field** and **"+ New piece"** share one row, which wraps on phones: the button goes full width below the field. **Cards** get a Band M lintel. Titles use `--font-display` 700 at 28 / 24 px. Practice uses `--action`; Drills and Edit are secondary. The "saved in this browser" badge keeps its `--reveal` outline.

### 5.3 Player `/play/:pieceId`: 모로단청, ends only

```
 header beam (jade) + Band M
 ← Library
 ┏━━━━━━━━━━━━━━━━━━━━━━┓
 ┃ 연습                 ┃  compact plaque
 ┃ Placeholder (Hard)   ┃
 ┗━━━━━━━━━━━━━━━━━━━━━━┛  325 pulses/min · 3 sections · Hard part on Drum
 [Hard part]                  part selector (selected = jade)
 > Marks                      paper panel
 Loop [Whole piece v]  M S    paper panel
┌#)))))))))))))))))))))))))))))))))))#┐  section beam: Band M, vermilion ends
│ A                         24 pulses │  section name: display 700
│ 1  B B   L L L L L L L L            │
│ 2  R L R L   R L R L   R L R L      │  chart panel: plain paper,
│#)))))))))))))))))))))))))))))))))))#│  nothing behind any cell
│ Build ×8  cresc.           4 pulses │
│ 1  L R R ~                          │
└─────────────────────────────────────┘
 =====================================   Band S: top edge of the transport
 [> Play] [Stop] [Metronome ON]  A · rep 3 / 8    sticky bar, plain paper
 [-5] ------o------ [+5] 325 BPM  [+5 every loop]
```

- **Chart panel:** `--surface` with a 1.5 px `--frame`; 20 px padding on desktop. Each section starts with a **section beam** (Band M, edge to edge across the panel, 8 px vermilion ends), then 12 px of clear paper, then the section name row. The first section's beam is the panel's top edge.
- **Phones:** the chart panel bleeds to both screen edges (negative margins, as the transport does) with 16 px inner padding and no side frame. That keeps 358 px for lines at 390 px, and a 10-cell group plus its line number needs 344 px, as today.
- **Transport:** plain `--surface`, with Band S replacing the 1 px top border. Play is `--action`. The sound gate and count-in stay plain; the count-in beat stays `--playhead` and the cue text stays `--danger`.
- The playhead, cued outline, loop gutter bar, heat bars and breath period stay as they are, in the new role colors.

### 5.4 Drills `/drill/:pieceId`: 모로단청

- The same as the Player, with 암기 훈련 over "Drills" on the compact plaque.
- The drill setup, stats chips and chart use plain paper; selected modes are `--action`.
- The **drill pad** is plain `--surface` with Band S as its top edge. The halves are flat `--cell-bg` squares with 3 px `--border` edges, and a pressed half uses `--action`. The pad still fills the bottom third of the screen.
- In a blind run the notation disappears but section beams stay: they are structure, not notation.

### 5.5 Progress `/progress`: 얼금단청, medium

- The header beam, then a full-width Band L with a **hanging plaque**: 연습 기록 / Progress. There is no painting.
- The member select and Export/Import sit on one paper panel. Each **piece card** gets a Band M lintel and a display-face title (22 / 20 px). Tables and accuracy charts stay plain paper. The accuracy line is `--playhead` and the 85% line is `--heat-late`.

### 5.6 Editor `/edit`, `/edit/:pieceId`: 긋기단청, lines only

- The header beam. The sticky toolbar is paper with Band S on its bottom edge. The page name, 악보 편집 over "Editor", uses the lines-only plaque (no board, no band). The piece title below it uses `--font-display` 900 at 30 / 24 px.
- Each section head gets Band S on its top edge, replacing the 3 px stripe. The editing grid, cell menu and forms are plain paper; pressed choices in the cell menu are `--action`. The drop overlay uses `--playhead-wash`.

### 5.7 Errors, loading, empty: 가칠, plain

Errors and loading messages get the header beam only. Error cards are paper with a 2 px `--danger` frame. Empty states ("No pieces…", "No progress yet…") are invitations, so they show a 48 px rosette above the text.

---

## 6. The painting: `public/art/landscape.webp`

The club chose **Kim Hong-do (김홍도, Danwon), *Dancing Boy* (무동)**, a leaf from his album of genre paintings (late 18th century), which is held by the National Museum of Korea. A boy dances while six seated musicians play a drum, a janggu, two piri, a daegeum and a haegeum. It is a portrait painting, not a landscape. The file keeps the agreed name.

| | |
|---|---|
| **File** | WebP, **598 × 703 px** (ratio 0.85), 177 KB |
| **Made from** | The club's 601 × 707 scan. It was trimmed 2 px left, 1 px right and 4 px at the bottom to remove dark scan edges, then re-encoded at quality 0.95. Nothing was redrawn |
| **Limit** | **≤ 300 KB**, hard limit |
| **Shown** | Whole, at its own aspect ratio, never cropped (§5.2) |

**Why whole, not a 12:5 crop.** The original spec asked for a 1920 × 800 landscape. A 12:5 crop of this painting would be a thin band that cuts off either the dancer or the musicians, and it would have to be enlarged about 3× from a 598 px wide scan. So the hero adapts to the painting instead. A painting of any shape works: set `width`/`height` in `LandscapeHero.tsx` to the file's pixel size, and the frame follows.

**Sharpness.** The panel shows the painting at up to 560 CSS px tall, so this scan is sharp on ordinary screens and slightly soft on high-density ones (2×). A higher-resolution scan of the same leaf, about 1100 px tall or more and still ≤ 300 KB as WebP, would fix that without any code change beyond the size.

**How the site shows it.**
- `<img src="art/landscape.webp" width="598" height="703" loading="lazy" decoding="async" alt="…">` inside the framed panel. The alt text describes the scene.
- The panel reserves its box, so nothing shifts when the image arrives. Until then it shows `ivory-200`.
- **Credit** (a `<figcaption>` under the frame, 12 px, on the jade): 김홍도 〈무동〉 · Kim Hong-do, *Dancing Boy*, late 18th century · National Museum of Korea. Check the museum's terms for the scan you use; Korean public collections often use KOGL (공공누리) terms that require exactly this kind of credit line.
- If the image fails to load, the same box shows a **placeholder**: flat `ivory-200` with a 2 px dashed ink border inset 8 px. It reads "Painting placeholder" and "add public/art/landscape.webp · WebP ≤ 300 KB", and the credit is hidden. The placeholder contains no picture, gradient or drawn scenery.
- The painting is supplied by the club. Implementation never fetches or generates one.

---

## 7. Guardrails and checks

How each rule in SPEC.md §5 is met, and how to prove it at the end of the style milestone. Check at 390 px and 1280 px wide, light and dark.

| Rule | How the design keeps it | Check |
|---|---|---|
| Plain surface under chart, pad, transport | These are `--surface` paper; bands only on their edges (pseudo-elements); texture only on `--bg` | Computed `background-image` is `none` on `.chart`, `.chart-line`, `.cell`, `.drill-pad`, `.drill-pad-half`, `.transport` and their children |
| Hand letters ≥ 28 / 22 px | `--hand-size` unchanged | Computed size of `.cell-letter` at 1280 and 390 px |
| Marks as legible as now | §2.4 (all pairs ≥ now); marks keep `currentColor` and their sizes; notation-font check in §3 | Legend and placeholder chart, before and after, read at 2 m on a phone |
| Tap targets ≥ 56 px on phones | Fix list below | Script at 390 px: every `a`, `button`, `select`, text or range `input`, `summary`, and the `label` around each checkbox is at least 56 px in both dimensions (except the editor cells, see §9) |
| No horizontal scroll at 390 px | No `100vw` for layout; bleed with negative margins; the painting panel is never wider than the page column; header labels stack; plaques wrap | `document.documentElement.scrollWidth === innerWidth` on every route, both themes, with a long piece title |
| No image over 300 KB; WebP; lazy | One painting (177 KB); tiles and texture are data URIs under 1 KB each | `ls -l public/art dist/assets`; network panel shows `loading="lazy"` |
| Nothing added to the playback frame | Static CSS only; no new state, effect, listener, animation or filter | Performance recording of 10 s of playback at 325 pulses/min, before and after: no increase per highlight step; Paint flashing shows only the changed cells |
| Animations ≤ 150 ms | None added; hover transitions stay 120 ms | Search the CSS for `transition` and `animation` |
| tokens.css + component CSS | Tokens in `tokens.css`, tiles in `src/styles/ornament/`, each component its own CSS | Review |

**Tap targets that were under 56 px on phones** (all fixed in Milestone 8; the check finds none left):
- **Header:** the "Nanta Practice" and "Progress" links.
- **Page nav:** "← Library", "Player" and "Progress" links.
- **Library:** "+ New piece" (44 px).
- **Progress:** member select, Export and Import (44 px), and the Practice/Drills links on each card.
- **Player:** the "Marks" summary (~46 px) and the "+5 BPM every loop" toggle (48 px).
- **Drills:** every drill control button (48 px) and the "Tap along too" checkbox label.
- **Editor:** every `.editor-button`, `.editor-input` and `.editor-select` (44 px, 36 px for small and icon buttons); cell-menu choices and checkboxes (36 px); the "+" add-cell button (28 × 44 px); the parts and section checkboxes (20 px); the "Instruments and parts" summary.

---

## 8. Build order (style milestone)

1. Tokens and fonts only: swap in the pigments and roles, add the two families. Recheck §2.4 and the notation-font test before touching layout.
2. Paper panels, frames, radii, button color grammar, and the tap-target fixes.
3. Ornament assets: hwi tiles, rosette, brand mark, hanji texture, favicon. Then the header beam and plaques.
4. Chart section beams; Band S on the transport and pad.
5. The Library hero beam with the placeholder.
6. The Progress and Editor treatments, a full dark-mode pass, and `theme-color`.
7. The §7 checks at 390 and 1280 px, light and dark; screenshots of every page.

---

## 9. Decisions (approved 2026-09-28)

1. **Editor cells on phones** are exempt from the 56 px width only. A chart cell is about 30 px wide at 390 px, and it has to stay that narrow for a 10-cell group to fit without horizontal scrolling. Cells are at least 56 px tall, and every other editor control, the "+" add-cell button included, is 56 × 56 px.
2. **Jade primary buttons** (Play, Practice, Save, selected choices) and the **light-blue dark-mode playhead** with ink letters.
3. **Bilingual names.** Every nav item and page title shows the Korean as display text with the English label beneath in smaller type, e.g. 암기 훈련 over Drills. Buttons and controls stay English. The names are 난타 연습 / Nanta Practice, 곡 목록 / Library, 연습 / Player, 암기 훈련 / Drills, 연습 기록 / Progress and 악보 편집 / Editor.
4. **The painting** is Kim Hong-do's *Dancing Boy* (무동), shown whole rather than cropped to 12:5 (§6). The labeled placeholder only appears if `public/art/landscape.webp` is missing.
