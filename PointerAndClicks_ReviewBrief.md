# TryLipi Demo Studio — how the creator's pointer and clicks are found

A brief for reviewing this pipeline for bugs and design flaws. It describes what
the code does today (2026-09-25). File paths are relative to the repo root.

---

## 1. The product constraint that shapes everything

- TryLipi is a **100% browser-based** screen recorder for product demos. It records
  with `getDisplayMedia` (usually a Chrome tab, sometimes a window or screen).
  After recording, the server edits the video automatically: it **zooms the
  camera onto each click**, draws a larger smooth pointer of its own over the
  creator's, and adds captions and narration.
- **No browser extension and no desktop helper.** That is a deliberate product
  decision, not a gap. So the pipeline gets **pixels only**: no mouse events, no
  click events, no DOM. Clicks have to be inferred from the video.
- Everything that decides a click must work on **any website, in any browser, on
  Windows or macOS**. Getting clicks right is the whole product: a missed click
  means no zoom where the creator pressed something, and a false click means a
  zoom on nothing.
- Known facts about the capture:
  - The OS composites the cursor into the frames. `cursor: "always"` is
    requested, but Chrome **tab capture ignores it and hides the pointer while it
    is idle**. A parked pointer vanishes from the video; it reappears when it moves.
  - Chrome's recorder is **variable frame rate**: it writes a frame only when
    something on screen changes. A still screen can have **no frames for 0.5–5 s**.
  - Recordings are commonly 1920×1020 (a tab) at about 23–30 fps, H.264.
  - Pages often contain **other people's cursors**: embedded YouTube demos,
    laptop mock-ups showing an app with its own cursor, autoplaying product
    videos. These must never be taken for the creator's pointer or clicks.

---

## 2. Data captured in the browser while recording

`src/components/Studio/capture.js` and `src/components/Studio/tracker.worker.js`
(a Web Worker). It runs at **24 Hz** on a frame downscaled to a 960 px long side.

Each tick, on the difference between this frame and the previous one:
- **Motion sample** `{t, energy, x, y, w, h, dy}`:
  - `energy` = share of pixels whose luma changed by more than 18.
  - `x,y,w,h` = bounding box of all changed pixels, as fractions of the frame.
  - `dy` = vertical shift from row-profile correlation. Computed only when
    energy > 1% and the changed band is taller than 1/8 of the frame, otherwise 0.
    It has a **limited search range**, so fast scrolls read as `dy ≈ 0`.
- **Pointer sighting** `{t, x, y, shape, conf}`:
  - Taken from connected components of the change mask. The cursor normally
    appears as two small blobs, where it left and where it arrived. The arrival
    is chosen by signed contrast: the current frame has the harder edge there.
  - No sighting when more than 25% of the frame changed (a new page), and the
    last position is dropped.
  - A 192 px full-resolution patch around the pointer is also read. It refines
    the position and measures the glyph: height, and whether the body is light
    or dark.
  - `shape` ∈ `default` (arrow) | `pointer` (hand) | `text` (I-beam) | …
  - A sighting is stored only if the pointer moved more than 0.0015 of the frame
    or 0.25 s has passed.
- **Cursor profile**: the median glyph height and light/dark body over at least 6
  readings, with an agreement score (`capture.cursor`). The server treats it as a
  weak prior.

This is a **frame-difference tracker**. A pointer that isn't moving produces no
sighting, so **gaps in the track mean the pointer is resting**. It also produces
false sightings: small animated things like rolling price digits, spinners, or
the cursor inside an embedded video.

---

## 3. Server pipeline (`backend/services/studio/analyse.js`)

These run in order for every recording:

1. **`sync.js alignCapture`**: finds the time offset between the browser
   tracker's clock and the video (score/margin/confidence), and derives the
   cursor size in video pixels.
2. **`sync.js readScreen`**: reads the whole video at 12 fps, 480 px wide, grey.
   It produces:
   - `motion[]` `{t, cover, x,y,w,h}`: share of the frame changed, per frame.
   - `scroll[]` `{t, dy, offset, agree, regions, phase}`. Per-frame vertical
     travel is the **median of 4×16 region shifts**; positive dy means content
     moved UP. `agree` is the share of regions moving with that median. `phase`
     (frames with ≥ 8% changed) is a phase-correlation reading
     `{shifted, still, dx, dy}`: how strongly the frame is the previous one moved.
   - A busy mask of self-animating cells (spinners, carousels), excluded from
     `cover`.
   - **Media spans**: regions playing video or animation (`inMedia`,
     `playingRegions`).
3. **`locate.js locatePointer`**: finds the creator's pointer in the video
   itself, frame by frame (§4). This is the primary pointer track. The browser
   sightings are only hints.
4. **`locate.js withoutStrangers`**: removes stretches of the path that belong
   to somebody else's cursor (§4.5).
5. **`events.js inferEvents`**: rests, navigations, click candidates, scrolls and
   typing, from the motion samples, the merged pointer path and `screen` (§5).
6. **`locate.js snapToLocated`**: moves each click to the located pointer
   position within 0.12 s.
7. **`locate.js stayedChanged`**: for candidates with no visible consequence,
   checks whether the control under the pointer **stayed changed** after the
   pointer left (§5.4).
8. **UI reading (Gemini, optional)**: when `STUDIO_VISION_ON_ANALYSE=on`
   (production has it on), frames every 2 s go to Gemini with the `UI_ANALYZER`
   prompt. It returns elements with bounding boxes, type, label, state and
   importance (at most 24 per frame, JSON schema). These give **`on_control`**:
   whether a click lands on a named control.
9. **`events.js confirmClicks`**: the gate. It decides `zoomable` per candidate
   with vetoes plus a weighted score (§5.5), then `ownConsequence` (§5.6).
10. **`events.js zoomsFromClicks`**: one camera move per zoomable press. The
    press's lead and hold are merged when close, the level comes from the
    control's box, and the hold follows `settleAfter`.
11. **Review job (later, asynchronous)**: `audit.js` flags uncertain presses and
    Gemini arbitrates them with frames. `witness.js` has Gemini 2.5 Pro watch the
    whole video (10 fps) and list clicks, in shadow mode: logged and offered as
    suggestions, never applied. `STUDIO_AUTO_PRESS_ZOOMS=0`: the review never
    edits zooms by itself.

---

## 4. Finding the creator's pointer in the video (`locate.js`)

### 4.1 Templates
- Outline polygons for the Windows **arrow** (`default`) and **hand**
  (`pointer`), plus resize/crosshair/move fallbacks. The hand's height ratio to
  the arrow is searched over `[1.16, 1.21, 1.26, 1.31]`.
- Two designs: **light** (Windows: white body, dark rim) and **dark** (macOS,
  handled by inverting). Heights are searched.
- Matching is normalized cross-correlation on a rim ring (grey frames at source
  resolution). A match counts when its score is at least `FOUND = 0.72`
  (`FLICK = 0.6` for a soft match right after losing the pointer).

### 4.2 Calibration: which design and size is this recording's pointer
- The pointer is sampled from `CAL_FRAMES = 12` frames where the pointer is
  likely visible (moving). Each `(design:height)` candidate is ranked by mean fit.
  Each sighting records `clear` (margin over the runner-up ≥ `UNIQUE = 0.12`)
  and whether it is near a moving picture.
- **`chooseIdentity`**: rivals are other candidates with mean fit ≥ 0.78, at
  least one unique sighting, and a genuinely different pointer (not the same
  design within a 1.15 size ratio). At most 3 rivals. Order of preference:
  1. The model's answer (`POINTER_IDENTITY`: Gemini sees sample frames and says
     which pointer is the creator's).
  2. Clean sightings, meaning clear and not near a moving picture, leading by at
     least 2.
  3. The browser's measured profile (only if it agrees with the platform default).
  4. The platform default (Windows → light, macOS → dark).
  5. Best fit.
- **Verification** when not contested but the page has media: ask the model. If
  it says the chosen pointer is "content" with ≥ 0.6, recalibrate without it
  (3× the frames) and switch only if the new one is judged the creator's own.

### 4.3 Tracking loop (every frame at 30 fps, over the whole video)
- **Unchanged frame** (`sameFrame`): the previous hit is repeated.
- **Pointer known recently**:
  1. Search ±70 px (`NEAR`) around the position predicted from velocity.
  2. If that fails, search around the last position.
  3. If still not found, search around the browser's hint for this time.
  4. Then the extra templates.
- **Pointer lost**: a whole-frame search (every frame at first, then every 3rd,
  then every 6th). It needs a unique best, meaning the margin over the second
  candidate is at least `UNIQUE`, unless the browser hint corroborates it.
  `isContent` rejects matches judged to be part of the page content.
- **Ride test** (`rideVerdict`): compares the patch around the match with frames
  0.25 s earlier.
  - If the glyph moved **with** the content under it, it is content (a cursor
    painted into a video or picture): `RODE`. Two rides in a row drop the track.
  - If the content moved but the glyph **stayed** composited on top, it is proven
    the creator's: `STAYED`.
- **Provenance**: each run of consecutive sightings is marked `proven` when:
  - it is the first sighting and not inside or near a moving picture,
  - or it returns within 150 px of where the last proven run ended,
  - or it is near the frame edge,
  - or it passes a ride test with `STAYED`.
  A run must be seen `PROVEN_SEEN = 3` times before it sets `provenEnd`.
- **Backfill** (added 2026-09-24): if the first sighting is after 0.1 s, frames
  before it are searched at that exact spot. The pointer is drawn from as far
  back as it is still there, because parked pointers are hidden by tab capture
  and often sit beside animations.
- **Flashes** (`flashesFrom`): mean brightness in a ring around the pointer
  (outer 2.6× the cursor height, hole 1.35×). A sudden short deviation while
  the pointer is still is a **click acknowledgement**: a ripple, `:active`
  darkening, or focus ring.

### 4.4 The path the export draws
- `mergeLocated(located.track, browserTrack)`: located sightings win, and the
  browser track fills gaps.
- `stepPath` smooths it.

### 4.5 Strangers (`withoutStrangers`)
- Runs of the path (gap ≤ 0.5 s) are compared with a reference: the longest
  proven run.
- Unproven runs of at least 0.25 s (up to 8 of them) go to Gemini
  (`POINTER_RUNS` prompt: "decide by what surrounds the pointer, never by what it
  looks like", with a reference check).
- A run judged "content" with ≥ 0.6 is replaced by the creator's pointer held at
  its last known place. The spans are returned as `dropped`, and clicks inside
  them are ignored.

---

## 5. From pointer + screen changes to clicks (`events.js`)

The inputs are `samples` (the merged pointer path), `motion` (browser 24 Hz
samples), `screen` (readScreen) and `located` (the pixel track with shapes).

### 5.1 Rests (`dwells`)
- **A gap in the track is a rest** at the last seen position: any gap of at
  least `GAP_REST = 0.25 s` becomes `{start, end, x, y, shape, blind: true}`.
- **A speed rest**: consecutive samples with speed ≤ `stillSpeed = 0.035`
  frame/s (speed over a 3-sample window), at least 90 ms long. Its position is
  the last sample.
- *Fixed today:* a speed rest now ends at a gap after which the pointer reappears
  more than 2% of the frame away. Speed measured across a long gap is tiny, so a
  rest used to run through the gap and take its position from where the pointer
  reappeared.

### 5.2 Navigations: whole-screen changes
For each motion sample, in order:
- **Energy**: at least `navEnergy = 0.02`, or a faint whole-frame change.
- **Box**: at least 0.6 of the frame in both dimensions (`whole`), or a
  "surface" of at least 0.25 of the area.
- **Scroll veto**: `|dy| ≥ 0.004` means it's a scroll, so skip it. **Unless** the
  shift is *lonely* (no other shifted sample within 0.2 s) **and** the video's own
  measurement did not see a coherent scroll. That second condition means no
  `scroll` row within 0.12 s with `|dy| ≥ 2/270` and, where `phase` exists, a
  phase peak ≥ 0.2 that is vertical and agrees with the region dy (otherwise
  `agree ≥ 0.5`). Real one-frame page swaps logged `dy −0.21 / −0.249`.
  Measured: phase misread 0 of 23 labelled page swaps as scrolls and read 62 of
  64 scroll frames correctly; `agree` misread 2 swaps (57%, 67%).
- **`scrollingAround`**: a run of at least 5 same-direction shifts means a scroll.
- **`sustained`**: if a large share of the surrounding second is also changing,
  it's a scroll or drag, not a page swap. This catches a scrollbar drag that reads
  `dy = 0`.
- **`screenAgrees`**: the video must have seen `cover ≥ 0.12` within ±0.25 s, or
  the equivalent share of a pane.
- **Debounce**: `navGap = 0.4 s`.

### 5.3 Click candidates
- **From navigations**: for each nav, pick the **most recent** unspent rest that
  satisfies all of these:
  - `rest.start + 0.04 ≤ nav.t ≤ rest.end + 1.1` (`NAV_REACTION`),
  - fresh: started at most 2.5 s before, or 6 s if the OS drew a hand,
  - `whole`, or within `clickRadius = 0.16` of the change.

  The press goes at `nav.t − 0.12`, clamped into the rest. *Since today* it is
  also placed no later than the last located sighting on the rest spot, looking
  back at most 0.35 s. Source `nav`, `corroborated: true`, confidence
  0.72 + 0.2 for a hand + 0.06 for a long dwell. If no rest fits,
  `settledAfter` may place a `parked` press.
- **From small changes**: for each remaining rest, take the best motion sample in
  `[rest.start + 0.04, rest.end + 0.52]` that meets all of these:
  - energy between `noiseEnergy = 0.0015` and `clickMaxEnergy = 0.42`,
  - within 0.16 of the rest,
  - scored as `energy / (1 + 6·distance)`.

  The press goes at `sample.t − 0.12` in the rest. `corroborated = grewAfter(…)`,
  meaning something appeared or grew afterwards. `scrolled` = the
  `scrolledAfter` sum (needs at least 2 shifted samples) ≥ 0.05, or
  `scrollingAround`, or `sustained`.
- **Each rest can be clicked only once.** Double clicks: two presses less than
  380 ms and 0.02 apart.

### 5.4 `stayedChanged` (`locate.js measureStay`)
This is for candidates that would be refused as "no consequence", like a toggle
or a tab that changes only itself. It compares a box around the control
(±80 px wide, −20…+60 px tall, scaled to 1920) in two pictures:
- **Before**: the last moment the pointer was clear of the box, searched back
  from 0.3 s before arrival for up to 3 s.
- **After**: the first clear moment after leaving, from 0.35 s after, for up to
  3 s. A moment with no pointer sighting counts as clear.

*Since today:*
- The pair clear of the whole **surroundings** (±200 px) is tried first.
- A picture at time t is the **last frame written at or before t**. The search
  reads back 0.5 s, then 5 s, because of variable frame rate.

The two pictures are first **lined up on the surroundings** (the inner box is
excluded), using only vertical shifts that the video's measured scroll allows,
and zero when the page didn't move. They count as lined up if the surroundings
mismatch ≤ 12%, or ≤ 30% with a clear winner over ±24 px. Then:
- if at least 8% of the box's pixels differ by more than 10 grey levels, the
  press is `corroborated` and gets `stayed` recorded,
- if there is a moving picture at the spot, the check is skipped.

### 5.5 The gate (`confirmClicks`)
**Hard refusals**, in order:
- `no-consequence`: not corroborated.
- `in-media`: the press is inside a video or screenshot the model named.
- `in-picture`: the pointer appeared from nowhere inside something playing.
- `position-unknown`: the pointer was last seen too long before.
- scrolling / moving / arrow proxies, which feed the score.

**Weighted score**:

| Signal | Weight |
|---|---|
| something changed | +0.25 (0 if the change was a video or animation) |
| flash at the pointer | +0.6 |
| settled hand or caret | +0.5 |
| held clickable | +0.3 |
| on a model-named control | +0.5 |
| drawn as pressed | +0.5 |
| aimed and stopped | +0.3 |
| still passing through | −0.3 |
| in the browser toolbar | −0.25 |
| plain arrow | −0.2 |
| never settled | −0.3 |
| page scrolling | −0.35 |

`zoomable = score ≥ 0.5 && sawPress`, where `sawPress` = flash, or pressed look,
or settled, or held clickable. `osShapeAt` reads the located track within 0.6 s.
"Held" means the pointer was seen at the same spot continuously from before the
press time **to at least the press time**.

### 5.6 `ownConsequence`
A zoomable press is refused as `still-arriving` when all of these hold:
- it lands inside the previous zoomable press's settle window,
  `settleAfter(screen, t, max 2.6 s)` (the last video frame with `cover > 0.012`
  plus a 0.3 s beat),
- it is at least 0.45 s after that press,
- its case is circumstantial: no flash or pressed look, **and** not on a
  model-named control.

It exists because of a real false click: a hand resting on a panel while its
data loads looks exactly like a press followed by a change.

### 5.7 Zooms
`zoomsFromClicks`: roughly 0.3 s lead and 0.45 s hold (the hold follows
`settleAfter`), close presses merged, level from the control's box (1.4–1.8 in
practice), `capZoomed`, and `restToFull`.

---

## 6. Recent bugs, each found on a real recording (the pattern matters)

| Recording | Symptom | Cause | Fix |
|---|---|---|---|
| cursorful.com (embedded YouTube demo) | Our pointer rode the demo's cursor; nav clicks missed | Calibration picked the demo's cursor | chooseIdentity + Gemini identity, provenance, withoutStrangers |
| cap.so (laptop mock-up) | Pricing / Lifetime missed | One-frame page swap logged as a big `dy` → "scrolling" | scrolledAfter needs ≥ 2 shifted samples |
| cap.so | Lifetime (a toggle) missed | No visible consequence beyond the toggle | stayedChanged |
| cap.so #3 | Our pointer not drawn for the first 2.5 s | Parked pointer beside auto-rotating chips never re-acquired | Backfill before first sighting |
| cap.so #4 | Pricing missed | nav branch discarded the one-frame swap as a scroll | lonely shift must be confirmed by video scroll |
| cap.so #5 | Pricing missed again | The video's median-of-regions scroll also "saw" the swap | `agree` share ≥ 0.5 required |
| cap.so #5 | Lifetime missed (replay) | Rest ran through a 3.5 s gap (idle pointer hidden), placed where the pointer reappeared | End rest at a gap with reappearance > 2% away |
| cursorful #3 | Editor refused after the swap fix | nav press placed 0.06 s after the hand left → "never settled" | Bound the press by the last sighting on the rest |
| claude.ai (blind test) | Zoom on empty space; the real chat click refused | Slow page load credited to the later rest; stayedChanged got no frame (VFR gap) and misaligned (neighbour hover) | Frame = last written ≤ t; surroundings-clear pair first |

**Open:** on claude.ai, two real clicks made 1.9–2.5 s after the previous one
(Projects, Settings) are refused by `ownConsequence` unless Gemini's UI reading
names the control. Production has that reading on, and they pass there.

---

## 7. How it is tested

- **Truth harness**: `backend/scripts/pointerTest/truth.mjs`, with 11 real
  recordings labelled in `truth/*.json`: click times and positions, stranger
  boxes and budgets, `pointer_drawn_from`. Each passes when:
  - every labelled click has a zoomable press within 0.8 s and 90 px, and a
    zoom covering it,
  - no zoom covers an unlabelled moment,
  - time spent drawing our pointer on strangers stays within budget.

  It runs twice: with Gemini, and pixel-only (`STUDIO_POINTER_VISION=off`).
- **Synthetic suites** in the same folder: strangers, video, content, parked,
  sticky, clicks, edges (including "the press nobody made" for
  `ownConsequence`), bench, profile, glyph, camera, coverage, cursors, cadence,
  salvage, scrolled.
- **Caveat:** the replay **simulates** the browser tracker from the video
  (`replayLib.mjs replayTracker`), so its hints and motion differ from what the
  real browser records. The replay also runs without the Gemini UI reading
  unless `STUDIO_VISION_ON_ANALYSE=on`.

---

## 8. Where I suspect remaining weaknesses (please challenge these)

1. **Attribution of a screen change to a rest** is the fragile core. Choosing
   "the most recent qualifying rest" fails when the page loads slowly and the
   pointer drifts. Choosing the change nearest a rest fails when a hover tooltip
   is bigger than the click's own feedback. Is there a more principled
   assignment, such as a global matching of changes to rests with costs?
2. **Press time** comes from `change.t − 0.12` or `nav.t − 0.12`, and can be
   0.5–1 s off (a tooltip at 9.34 s gave a press at 9.22 s for a click at about
   9.8 s).
3. **Scroll vs page swap** relies on `dy`, which has a limited range, plus
   `agree`, `sustained` and `scrollingAround`. Every earlier fix here broke
   something else once.
4. **Variable frame rate**: any code that samples "the frame at t" by reading a
   short window after t is wrong on still screens. `measureStay` and
   `extractFrameAt` were fixed on 2026-09-25 to take the last frame written at
   or before t. There may be other places.
5. **Idle pointer hidden by tab capture** creates gaps that look like rests but
   can hide movement.
6. **`ownConsequence`** cannot tell "data landing under a resting hand" from
   "a real second click soon after" without the model.
7. **Thresholds** were tuned on about 11 recordings, mostly two sites
   (cursorful.com, cap.so) plus claude.ai.
8. **Two sources disagree**: browser tracker samples (24 Hz, 960 px) vs video
   reads (readScreen at 12 fps and 480 px; the locator at 30 fps, full size).
   Time alignment and the differing rates may create off-by-one-frame issues.

## 9. What I'd like from a reviewer
- Concrete failure scenarios for the rules above: inputs → wrong output.
- Simpler or more robust formulations of §5.2–5.6. In particular: how to decide
  which rest caused a screen change, and when a press happened.
- Whether any evidence available in pixels alone is being ignored.
- Constraint to keep: browser-only capture, no extension. Gemini is available
  (Vertex / AI Studio) for vision on frames or the whole video, cost permitting.
  In experiments, Gemini deciding clicks by itself was worse than the rules
  (17/17 with 0 false positives for the rules), but good at telling whose pointer
  is whose.
