# TryLipi — How the auto zoom-in is decided, end to end

**What this document is.** A complete, self-contained description of how this
product decides *where* and *when* to zoom in on a screen recording, including
exactly where Gemini vision models are used, what they are asked, and what is
done with their answers. It is written to be handed to another model or engineer
for critique, so it states the real constants, the real prompt text, the real
failure modes, and the places where the design is known to be weak.

**Product.** TryLipi (trylipi.online) — browser-native screen recording plus
automatic editing. A creator records their screen in a browser tab; the
recording is uploaded and edited automatically: dead air cut, camera moves added
on the things they clicked, captions written.

---

## 0. The one constraint that shapes everything

The recording comes from `getDisplayMedia()`. That API hands over **pixels and
nothing else**.

- No pointer events, no clicks, no key events — JavaScript sees input only
  inside its own tab, and a creator demoing *another* window or tab generates
  none.
- No DOM, no accessibility tree, no window list for the captured surface.
- The operating system **composites the cursor into the frames**, so the cursor
  is there to be *found*, but nothing says where it is.

Therefore: **there is no click sensor anywhere in this product.** Every single
press in the finished timeline is an *inference from pixels*. This is the
central fact. Competitors avoid it by shipping a native app (Screen Studio) or a
browser extension (Supademo). We do not.

Everything below is the machinery for turning "a rectangle of pixels changed" into
"a person pressed the *Pricing* button, so push the camera in on it."

---

## 1. The pipeline at a glance

```
BROWSER (during recording)
  └─ tracker.worker.js ─── coarse pointer path + per-frame motion
                      └── NEW: full-resolution glyph measurement
                          (which cursor design, how tall)

SERVER (job queue: prepare → analyse → [vision] → review → render)

  prepare   remux, probe, thumbnail

  analyse   ├─ locate.js      find the OS pointer in EVERY frame (template NCC)
            │                 └─ flashesFrom()  the click "ripple" at the pointer
            ├─ sync.js        readScreen()  what changed, 12×/sec, in a 40-col grid
            ├─ GEMINI #1      UI_ANALYZER — every frame, what elements are on it
            ├─ events.js      inferEvents()  dwell + consequence ⇒ candidate clicks
            ├─ events.js      confirmClicks()  ⇦ THE GATE. weighted evidence sum
            ├─ GEMINI #2      STEP_DETECTOR — group the demo into steps
            ├─ events.js      zoomsFromClicks()  ⇦ ONE ZOOM PER ACCEPTED CLICK
            ├─ events.js      restToFull / capZoomed / dropScrollZooms
            └─ timeline.js    sanitizeTimeline()  non-overlap invariant

  review    ├─ audit.js       plan()       what is worth paying to look at
            ├─ GEMINI #3      PRESS_ARBITER — 6 frames, "was this a press?"
            ├─ GEMINI #4      CHANGE_AUDITOR — 2 frames, "what happened here?"
            ├─ audit.js       findings ⇒ suggestions
            └─ studioRunner   auto-apply add_zoom where confidence ≥ 0.8

  render    ffmpeg zoompan with gated-sum expressions
```

The **arbiter** the user asks about is stage `review` → `PRESS_ARBITER`. It is
*not* the click detector. It is a second opinion, paid for only at moments where
the first opinion is genuinely in doubt.

---

## 2. Capture-time (browser) — `src/components/Studio/`

### 2.1 `tracker.worker.js` — coarse pointer, live

Runs in a Web Worker at **24 Hz** on frames downscaled to a **960px long side**.

Finds the pointer by **frame differencing**. Between two frames of a screen
recording almost nothing changes, and usually the only thing that moved is the
pointer — which shows up as exactly two small patches: *where it was* and *where
it now is*.

The hard part is telling those apart. Both patches are the same size and shape,
and the hole often sits over busier pixels than the arrival does. The solution:

> At the **arrival**, the cursor is in the current frame and was not in the
> previous one, so the *current* frame has the harder edge. At the **departure**
> it is the other way round. Measure contrast in both frames over the same box
> and take the **signed difference**. Its sign *is* the answer.

```js
arrival = contrast(current) - contrast(previous)     // >0 arrival, <0 the hole
if (arrival < -12) reject                            // clearly lost contrast = the hole
score   = (arrival * 3 + contrast) * nearness
```

Guards: if more than **25%** of the frame changed (`BUSY`), no pointer is
reported for that frame at all — a page that just navigated has thousands of
difference patches and a confident wrong answer is worse than a gap.

Also emits per-frame **motion**: `{ energy, x, y, w, h, dy }` where `dy` is a
row-profile correlation giving vertical page translation (the scroll signal).

### 2.2 Full-resolution glyph measurement (recent addition)

The 960px downscale halves a 19px cursor to 9px, and the uploaded video is
H.264 — both destroy the **one-pixel rim** that says whether the cursor is a
white body in a black rim (Windows) or the reverse (macOS).

So a **192×192 patch is cut from the original frame at 1:1**, around the last
known pointer, and the glyph is measured there before any encoder sees it:

- **design** — light-bodied or dark-bodied
- **height in pixels**

The measurement is *not* trivial, because the mask holds what *changed*, and a
cursor is two tones ~250 grey levels apart, so whichever one matches the
background is simply absent:

| Case | What changes | What's missing |
|---|---|---|
| White cursor, white page | the rim only | the body — a hole inside the rim |
| Black cursor, white page | the body only | the rim, entirely |
| Either, busy page | both | nothing (the easy case) |

Fix: flood-fill the footprint from the border (what the flood cannot reach is
*enclosed*, and enclosed is glyph), then compare the **inside** against a **ring
spanning the edge and one pixel beyond** — so the rim is caught whichever side
of the footprint it fell on. When the footprint's own edge looks like the body
rather than the rim, the rim was invisible and the height is corrected by 2px.

Measured on real Windows cursors composited over four background types at two
sizes: **16/16 measured, 16/16 design correct, height error mean −0.2px, worst
±1px, 0.24 ms/frame.**

These two numbers ride along with the upload and are used by `locate.js` instead
of being searched for.

### 2.3 `environment()`

Also uploaded: `platform` (windows/macos/linux/…), `dpr`, `screen_w`,
`screen_h`, `scheme`. The cursor's height in the video follows from

```
cursorPx = glyphCss × videoWidth / screenWidthCss      // pixel ratio cancels
```

and `screen.width` is the one term the server can never see.

---

## 3. Pointer recovery — `backend/services/studio/locate.js`

This is the source of truth for where the pointer is. It is a **masked
normalized cross-correlation (NCC) template matcher**.

### 3.1 Templates

Hand-traced outlines for `arrow`, `hand`/`handL`, and four resize cursors
(`ew`, `ns`, `nwse`, `nesw`), drawn at a given pixel height, in light-body and
dark-body variants. Scoring compares the **relation** between a bright core and
a dark rim, not absolute brightness — so it works on any page colour.

### 3.2 Calibration — the decision everything rests on

Before tracking, the locator decides **one design and one size** for the whole
recording, from 12 sampled frames.

Candidate sizes come from a spread around a best guess. Priority order:

1. **The browser's measurement** (§2.2) — a measurement, not an inference.
   Spread `[0.90, 0.95, 1.00, 1.06, 1.14]`.
2. `cursorPx` measured from the recording itself by `alignCapture`.
3. `GLYPH_CSS(19) × W / screen_w` — arithmetic from the reported screen size.
4. `20 × W/1920` — the legacy assumption that everyone has a 1920 desktop.

Sources 2–4 get a wider spread `[0.75, 0.85, 0.95, 1.05, 1.15, 1.30]`, and when
they disagree by more than ±25–30% **all of them are offered**, because a size
not in this list can never be found later.

Candidates are ranked by **best fit**, not by movement. Three arrangements were
tried on real recordings:

- *Arrows only* fails on a sidebar demo where the pointer is a hand throughout.
- *Arrows first, hands as fallback* fails when the arrow pass finds **noise**
  (dark 10px arrows fitting text at 0.768) rather than nothing, so the hand pass
  never runs.
- *Both, ranked by movement* is worse than either — **noise moves**.
- *Both, ranked by fit* holds. A template matching text scores 0.74–0.77; the
  pointer it was drawn for scores 0.85+.

Two filters separate a pointer from a glyph printed on the page:

- **Uniqueness** — `best − second < 0.12` ⇒ reject both. A real pointer beats
  everything else on screen; a template matching text finds dozens of equal fits.
- **Movement** — a candidate whose best match wanders beats one whose best match
  never leaves its spot.

If the browser's measurement is firm (`confidence ≥ 0.6`), the search is
**narrowed to that design only** — unless it names a design the platform does
not draw by default (a dark pointer on Windows, a light one on macOS). The
browser reads glyphs where its difference tracker saw movement, and on a page
with a demo playing that is mostly the demo's cursor; a narrowing that
contradicts the platform is the one that cannot be trusted, so both designs are
searched instead. If a narrowed search returns nothing, the full search is
re-run — this fallback is covered by a regression test.

#### 3.2.1 When two pointers both look real — `chooseIdentity()` (2026-09-24)

**Fit cannot tell two real pointers apart.** Ranking by fit is right when the
alternatives are text (0.74–0.77 against 0.85+). It says nothing when both
candidates are pointers — the creator's and one inside a demo on the page. On
"Cursorful_demo_now" (2026-09-24) the demo's black arrow fitted `dark:22` at
0.848 and the creator's white one `light:18` at 0.845; production read 0.860
against 0.802 and chose the demo's. The pointer was then found in 271 of 1074
frames, every press was filed where the demo's cursor was, and Pricing and
Editor were both refused — no zoom at all. Forced to `light:18`, the same code
zoomed both. The per-frame content veto could not help: the creator's pointer
was **not drawn from 2.6 s to 23.9 s** (a tab capture stops drawing an idle
pointer), and on the sampled frames the demo showed still screens.

A **rival** is a candidate with fit ≥ `RIVAL_FIT` (0.78) that was the clear best
match (`margin ≥ UNIQUE`) in at least one sampled frame — text never is — and is
a different pointer (other design, or height ratio > `SAME_POINTER` 1.15). With
two or more rivals, fit stops deciding:

1. **The model** (`POINTER_IDENTITY`, §12 #10) is shown up to three frames of
   each rival with the pointer boxed and asked which is the computer's own and
   which is inside a picture of another screen. Decides when exactly one group
   is "own" at ≥ 0.6.
2. **The sightings** — the rival that was the clear match *away from any moving
   picture within ±1.5 s* at least `CLEAN_LEAD` (2) more times wins.
3. **Priors** — the browser's firm reading, then the platform default.
4. **Fit**, as before.

On the recording above: the model answered `dark:22` "content (1.00) — inside a
browser window that is itself content on the page" and `light:18` "own (1.00)";
the pixel fallback alone agrees (4 clean sightings against 0).

**When only one pointer qualifies.** A contest needs the creator's pointer in at
least three of the twelve samples; at 20% visibility that fails more often than
not, and the demo's cursor then wins unopposed. So on a recording with any
moving picture, an uncontested winner is shown to the model on its own; if it
is "content", calibration looks again at 36 frames without it and switches only
if the model calls the new winner "own". A wrong "content" costs a second look
and nothing else.

**What calibration cannot do.** A demo's pointer of the SAME design and size as
the creator's (a white hand beside a white hand) is one identity to calibration
— the model rightly called such a mixed group "own". That case is settled per
run of sightings, below.

### 3.2.2 The drawn path, without somebody else's pointer — `withoutStrangers()`

With the right design, the locator still followed the demo's pointer for 4.3 s
while the creator's was hidden: lost, it searches the whole frame, and the
demo's cursor is a perfectly good match. Its presses were refused ("in-picture",
§7.2), but the **drawn** pointer rode the demo's hand — the complaint of
2026-09-23. Each run of sightings that did not begin where the creator's pointer
was (unproven, §3 provenance) and lasts ≥ 0.25 s is put to the model
(`POINTER_RUNS`, §12 #11) beside a sighting known to be the creator's; runs it
calls "content" at ≥ 0.6 are not drawn — our pointer holds where the creator's
was last seen until theirs is seen again (the renderer's halfway switch across a
long gap would otherwise show it on the next place the creator went, seconds
early). The tracker's own samples inside those runs are dropped too.

It changes **only the drawn path**; presses are placed and gated from the track
as found, so a wrong verdict can never cost a click. Without the model, nothing
changes.

**"First" is not proof inside a picture.** The first run of a recording used to
be the creator's by definition. On a clip that opens with the creator's pointer
idle (not drawn), the first run is the demo's hand: it was "proven", its click
on a YouTube thumbnail was zoomed, and it became the reference the run check
compared everything against. Now, until something is proven, a run counts as
"first" only if no moving picture played where it began (from 1.5 s before to
0.25 s after, backward-looking like `madeInPicture`). The demo's hand stays
unproven, the in-picture rule refuses its click, and the creator's first run
clear of any picture is the proven one. At the very start, where there is no
"before", the opening 1.5 s is the evidence.

**A glimpse is not a place.** "Returning" is judged against where the last
proven run was. On `cursorful-2026-09-24` frame 0 matched the demo's cursor for
one frame — first, so proven — and became that place: the creator's own run a
frame later was "from nowhere", and the demo's cursor coming back to the same
thumbnail at 4.9 s was "returning", proven, never asked about, and drawn for
2.5 s. A proven run now marks the creator's place only after `PROVEN_SEEN` (3)
sightings, and the model's reference is taken from the longest proven run.

### 3.3 `playingRegions` — the embedded-video veto

**This solved a real reported bug.** A creator recorded a competitor's home page
that had a product demo *playing* on it. That video contains *somebody else's
cursor*, moving, looking exactly like a cursor — because it is one. It passes
every test:

- it fits the template perfectly — it **is** an OS pointer
- it moves — the property nothing printed on a page has
- it is unique in its neighbourhood

`sync.js playingRegions()` finds screen regions that were animating for **most
of the recording** (share ≥ 1/3, connected-blob analysis on a 24-cell grid), and
`locate.js` refuses a sighting inside one *when it has no continuity to reason
from* — i.e. while calibrating or re-acquiring. A pointer it is already
**following** is never refused this way, because a creator moving their own
cursor onto a video to press pause is ordinary.

Safety valve: if more than **35%** of screen cells are flagged, the measurement
is meaningless and the whole veto is dropped (`PLAYING_MAX_COVER`). This was
added after the first version flagged 520 of 960 cells on a real recording and
took the locator from 98% found to 0%.

> The lesson recorded in the code: *"The lesson is not a better threshold. It is
> that this measurement has a range outside which it is meaningless."*

**Revised 2026-09-24 — the veto counted scrolling as video.** `playingRegions`
totalled how often each place on the *screen* changed, and a page being scrolled
changes every place on the screen. A fix on 2026-09-23 used that map *uncapped*
as the tracking loop's re-acquisition veto; the next recording of cursorful.com
scrolled for most of its length, 363 of 840 cells came out as "video" (the nav
bar among them), the pointer was located in 21% of frames, and both presses on
the nav bar — Pricing and Editor — were lost, while a demo's cursor that scrolled
up the screen (never in one place long enough to be "video") was followed and
had our cursor drawn on it. A realistic synthetic page came out at 274 cells —
*under* the valve — and there calibration vetoed every place the real pointer
went and the whole recording got **no pointer at all**.

What replaced it:

| | |
|---|---|
| `sync.js playingRegions` | still totals `busy`, but **only the time the page stood still** (samples where the page moved at least a row, widened by half the busy window, are left out) and against that time. A video plays whether or not the page moves; a scroll no longer counts as one. Calibration, `explainMotion` and re-acquisition all read it — capped by the valve; the uncapped version is used for calibration only. |
| `sync.js readMedia` / `inMedia` | "moving picture" measured **per moment** on grids with the page's own scroll taken out (each changed pixel is tested against the previous frame shifted by 0, ±1–2 rows, the measured scroll, and a wide-range shift for anchor jumps; sub-row blends allowed with 3 grey levels of slack). Catches a video that scrolls up the screen with the page. Deliberately conservative: it may miss a slowly changing video, and must never land on the real pointer (0 of 17 hand-checked real positions on two recordings). |
| `locate.js ridesWithPage` | the test for a re-acquired match (and, twice within a second, for a followed one): **did this glyph move with the page?** Find where the same glyph (any size of its shape) was in the frame before and a quarter-second before; if it moved, and the pixels around it that changed — outside its old and new place — moved the same way (allowing its own drift, ≤40% of the move), it is content. The OS pointer is drawn in screen coordinates and never rides the scroll. |
| `alignCapture` | browser-tracker samples inside a playing picture are dropped, so the drawn cursor cannot be dragged onto a demo's cursor while the real one is out of sight. |

Known limit, stated in `scrolled.mjs`: a stranger's cursor inside a demo on a
page that is **standing still**, while the creator's own pointer is hidden, is
indistinguishable from pixels alone. That needs the vision pass's "picture of a
screen" regions (`mediaUnder`).

### 3.4 `flashesFrom()` — the only first-hand press signal

Every other signal in this product infers a click from its **consequence** —
second-hand, hundreds of milliseconds late, and useless when a press produces
nothing visible.

But a press is not invisible. Almost every interface **acknowledges** one, at
the moment it happens, at the pointer: a Material ripple, an `:active`
darkening, a native button depressing, a focus ring landing.

It is read as a **ring, not a patch**, because the cursor is drawn *on top* of
whatever it is over — a patch centred on the hotspot would be mostly cursor.
The acknowledgement happens *around* the cursor, so the cursor's footprint is
cut out. *The ring is the page; the hole is us.*

```
RING       = 2.6 × pointer height     outer size
RING_HOLE  = 1.35 × pointer height    the hole (hangs below-right of the hotspot)
STILL_RUN  = 4 frames                 pointer must be held still first
STILL_PX   = 2.5 source px            how far it may drift and still count
FLASH_MAX  = 8 frames                 longer than this is the page, not a press
FLASH_FLOOR= 3.5 grey levels          absolute floor (JPEG noise runs 2-3)
FLASH_SIGMA= 4                        adaptive term for busy regions
```

Only read while the pointer is still: a moving pointer drags new pixels through
the ring every frame.

**This is the highest-value signal in the system and the least exploited.**

---

## 4. Screen change measurement — `sync.js readScreen()`

Decodes the recording at **12 fps** (6 fps past 10 minutes), at a 480px long
side, into a **40-column grid**. For each sample it records
`{ t, cover, x, y, w, h }` — what fraction of the screen changed and where.

Two derived functions matter for zoom:

- **`settleAfter(screen, t)`** — how long after a press the screen went quiet
  (`cover ≤ 0.012` for 300 ms), clamped to `[0.55, 2.6]`. This is how long the
  camera holds: *a control that answers instantly is unaffected; one that loads
  for a second no longer has its loading framed and its answer missed.*
- **`changeMoments(screen)`** — peaks in the change series. These become audit
  candidates (§8).

---

## 5. GEMINI #1 — `UI_ANALYZER`, what is on each frame

**Model:** `GEMINI_VISION_MODEL` (default `gemini-2.5-flash`)
**Cadence:** one frame every `STUDIO_FRAME_EVERY` seconds (default 2), 1280px
long edge, **one frame per call** (`FRAMES_PER_READ = 1`).
**Gate:** only runs when `STUDIO_VISION_ON_ANALYSE=on`. **Default is off.**

Asked for, per frame: `screen` (a 2–3 word name for the view), `busy`, `app`,
and up to 25 `elements`, each with `type`, `label` (exact text), `bbox`
(fractional 0–1), `importance` (high/medium/low).

Key rules in the prompt:

> **ALWAYS report every region that is a PICTURE OF ANOTHER SCREEN**, however
> unimportant it looks, and never drop one to stay under the limit. […] This
> matters more than anything else in this list. Those regions were recorded on
> somebody else's machine and contain somebody else's mouse pointer, moving and
> clicking. This tool reads the pointer to decide where to point the camera, and
> it cannot tell that pointer from the real one. **You are the only part of the
> system that can see the difference between a screen and a picture of a
> screen**, so a region you leave out becomes a zoom onto a click that never
> happened.

> **NEVER report a sidebar, nav, menu, toolbar, tab bar, list or table as a
> single element INSTEAD of what is inside it.** […] A sidebar reported as one
> box tells the reader nothing about which item a person was pointing at, and
> that is the single most important thing this tool needs from you.

Output feeds two things:

- `controlUnder(shots, t, x, y)` — was the pointer over a named control?
- `mediaUnder(shots, t, x, y)` — was the pointer inside a video/image region of
  at least 3% of the frame?

**Why `FRAMES_PER_READ = 1`:** batching six frames at 25 elements each produced
replies that ran past the token limit, and a reply that overruns **does not come
back half-parsed — it does not parse at all**, and the whole batch is lost. On a
real recording the first batch of six came back empty, so the first ten seconds
had no elements, so the two most important clicks in the demo could not be
judged and the gate waved them through. It was invisible because a lost batch
looks exactly like six frames with nothing on them.

---

## 6. Candidate clicks — `events.js inferEvents()`

Pure arithmetic over the pointer path and the motion series. A click candidate
is proposed where:

1. The pointer **dwelled** (`REST_MS = 200`; a fresh rest within 2.5 s, or up to
   6 s if the OS was drawing a hand — people park the pointer on the thing they
   are about to show, talk for five seconds, *then* press), **and**
2. Something **came of it** within `CONSEQUENCE = 1.4 s`, at least
   `CONSEQUENCE_GROWTH = 3×` bigger than the press's own flicker, or covering at
   least 5% of the screen on the press frame itself.

This also produces `scroll`, `type`, and `idle` events. Scroll is detected from
the same per-frame `dy` the tracker measures (`SCROLL_SHIFT = 0.004` frame
heights, coherent over `SCROLL_RUN = 5` frames at `SCROLL_COHERENCE = 0.85`).

**Scroll is a boolean flag.** There is no scroll *offset*, no viewport model, no
element re-anchoring. This is a known structural gap — see §11.

---

## 7. THE GATE — `events.js confirmClicks()`

This is the function that decides whether the camera moves. Everything above
feeds it; everything below obeys it.

### 7.1 Design history (important for critique)

It used to be an **if/else ladder**: first matching rule decides, everything
below unreachable. That was a fair model with two signals and stopped being one
with four — *a press refused because a speed threshold called the pointer
"moving" could not be saved by anything, however much else agreed it was a
press.* Reported by the creator as a missing zoom on "Projects"; structurally
unfixable inside a chain.

It was also a **blocklist** — a list of reasons to refuse, ending in "nothing
was read here; allowed". The creator's instruction:

> "we should not hard code what things need to be ignored for the zoom in or
> camera rotation, we should only focus on at what interaction we should move
> the camera … if we follow that simple rule, any other new interaction comes,
> it simply ignores it."

So it is now an **additive positive-evidence model**. A new kind of interaction
nobody has thought of scores zero and is ignored, without anybody writing a rule
against it.

### 7.2 Two hard vetoes

```
1. !corroborated           "nothing came of it"       → no zoom, stop
2. mediaUnder(...)         inside a video/screenshot  → no zoom, stop
```

The second exists because a press inside a picture of another screen is not
*weak* evidence — it is *positive evidence that nobody here pressed anything*.
The pixel pipeline cannot reach this conclusion; only the model knows the region
is a video.

**Added 2026-09-24 — a pixel-only version, `in-picture`.** With vision off by
default the veto above never runs, and on a recording of cursorful.com the
embedded demo's own hand "clicked" a thumbnail (flash, consequence, a hand) and
got a zoom. The region alone cannot settle it, but *where the pointer came from*
can: `locate.js` marks every sighting `proven` — its run began where the
creator's pointer was last seen, came in from the edge, was the first of the
recording, or was seen staying put while the page scrolled under it (the one
thing only the real pointer does). A press is refused as `in-picture` when its
pointer is **unproven** AND a moving picture was playing at that spot
(`sync.js inMedia`) at least twice in the 3 s before. Measured: the demo's click
meets both; none of 13 real presses across four recordings had a picture at its
spot beforehand. It is in `HEURISTIC_REFUSAL`, so the arbiter can overturn it.

**Added 2026-09-24 — a small control that stayed changed (`locate.js
stayedChanged`).** Veto 1 asks for a change bigger than the press's own flicker —
a menu, a panel, a page — because a hover's highlight is small. But toggles,
tabs, checkboxes and segmented switches are small too. On cap.so the creator
pressed "Lifetime": the switch's pastel pill moved and the price went $29 → $58,
all inside one card, and the press was vetoed. Size cannot separate that from a
hover; **persistence** can. A hover's highlight goes when the pointer goes; a
press's state stays. So, for every press veto 1 would refuse, the patch around
it is compared just **before the pointer arrived** and just **after it left**
(the pointer in neither picture), after lining the two up on the surroundings so
a scroll straight afterwards is taken out. ≥ 8% of the control's box changed by
more than 10 grey levels (encoder noise on unchanged content: 0%) ⇒ corroborated.
Not asked when a moving picture played at the spot, when the pointer never left,
or when the surroundings cannot be lined up (the control scrolled away).
`STUDIO_TRACE_STAY=1` prints why each one was or was not.

*Refined the same evening on a second Cap recording ("Cap_demo_just_now"),
where the creator eased onto "Lifetime" and stayed beside it after pressing:*
the two pictures were a fixed 0.3 s before and 0.35 s after the dwell, and both
had the pointer in them, so nothing was compared. They are now the last moment
before and the first after when the pointer was **clear of the control**
(searched up to 3 s either side; a moment it was not drawn at all counts as
clear). That exposed a second flaw — a white card "lined up" 515 px away with a
page that had not moved, and every pixel then read as changed — so the shifts
searched are now only those the video's own scroll measurement allows between
the two pictures (none at all when the page did not move).

**Fixed 2026-09-24 — a page replaced in one frame is not a scroll.** On the same
recording the click on "Pricing" (a hand held on the link) replaced the page in
one frame; the tracker logged that frame as a quarter-screen shift and the press
was refused as "the page was scrolling". A scroll plays out over frames, so
`events.js scrolledAfter` now needs at least two samples of shift.

**Measured the same day — the arbiter is not the answer to either.** Run on this
recording (`scripts/pointerTest/arbiter.mjs`), it called three auto-rotating tab
changes on the home page presses and missed both real ones. From a few stills it
can see that a tab now looks selected, not whether the person or the page did
it. `STUDIO_AUTO_PRESS_ZOOMS` stays off.

**Added 2026-09-24 — a second witness that never decides (`witness.js`).** In
the review job, Gemini 2.5 Pro watches a light copy of the whole recording
(10 fps, 1280 wide, no sound) and lists every click it sees. Its timing is good
(16/17 labelled clicks within 0.8 s) and its positions are not (~200 px off),
and it takes an embedded demo's clicks for the creator's. So only its timing is
used, and a click it claims is a question for the creator only when all hold:
the camera did not zoom there; the creator's own pointer (`timeline.captured`,
somebody else's taken out) was resting then; the pipeline itself found a
candidate press at that spot and refused it; that refusal was not "inside a
picture"; and the model's claimed spot is within 0.3 of the frame's width of
where the pointer rested. Such a click becomes a "Possible missed click"
suggestion in the Review panel (badge "Second check"), with the zoom aimed at
OUR measured pointer position. Zooms the witness did not see are logged, never
offered. **Shadow by default** (`STUDIO_WITNESS=shadow`, log only): on the seven
labelled recordings the camera already caught every click, and the first
version's three offers were all a demo's search-button click. Turn on
`suggest` when the logs on real recordings show its offers are worth a click.
Scored with `scripts/pointerTest/witness.mjs`.

**Frame reading is held to a schema (`vision.js UI_SCHEMA`).** One frame's
UI_ANALYZER reply ran to the full 16384-token allowance in production (44 000
characters, ~200 elements) — the prompt's "at most 25" pulled against "every
item in a list". The reply is now constrained by a response schema with
`maxItems: 24` (40 and 28 are refused by Vertex as too large a grammar; 24 is
accepted), 8192 tokens of room, and a prompt order for what to keep. A schema
the service refuses is retried once without it rather than losing the frame.

### 7.3 The weighted sum

```js
W_CHANGED  = +0.25   // something came of it (necessary, and evidence in itself)
W_FLASH    = +0.60   // the interface acknowledged a press, at the pointer
W_HAND     = +0.50   // the OS drew a clickable glyph AND it settled
W_HELD     = +0.30   // ...or drew one and held it ≥200ms without settling
W_CONTROL  = +0.50   // Gemini named a control under the pointer
W_ARROW    = -0.20   // the OS drew a plain arrow
W_MOVING   = -0.30   // the pointer never settled          (a PROXY)
W_SCROLLED = -0.35   // the page was scrolling             (a PROXY)

PRESS_BAR  =  0.50   // zoomable = score >= PRESS_BAR
```

**Proxies retire when answered.** `W_MOVING` is not an observation about a
press — it is a speed threshold standing in for *"did they hold still long
enough to press something"*, and a flash or a held clickable glyph answers that
question **directly**. A stand-in does not get to outvote the thing it was
standing in for. Same for `W_SCROLLED`.

```js
if (moving   && !lit && !pressedLook && !heldClickable(os)) add(-W_MOVING);
if (scrolled && !lit && !pressedLook && !stuck)             add(-W_SCROLLED);
if (passing  && !settled && !lit && !pressedLook)           add(-W_PASSING);
if (inChrome && !lit && !on && !pressedLook)                add(-W_CHROME);
```

`stuck` is the new one: the element is **fixed**, by the model's reading or by
the pixel measurement, so "the page scrolled" is a fact about a different part
of the screen.

### 7.4 The scroll penalty — a deliberate, documented loss

Half the links on a marketing page are anchors: pressing "Pricing" in a nav does
not navigate, **it scrolls**. A real demo lost its Pricing zoom to this.

The obvious repair — soften the penalty when the OS drew a hand — **was tried and
reverted**, because the two cases are *the same evidence*:

| | |
|---|---|
| Anchor click | hand on a link, page scrolls, pointer stays put |
| Wheel scroll with pointer resting on a nav item | hand on a link, page scrolls, pointer stays put |

Softening enough to pass the first passes the second by exactly the same margin,
and the second is the precise false positive the penalty was added for (a
creator scrolled a billing page with the pointer resting on a dropdown, and a
zoom landed on a click that never happened).

The code said there was **no cheap third signal**. There is, and it is
geometric rather than temporal: **the navigation bar is fixed.** It does not
move when the page scrolls under it, so "the page scrolled" is a statement
about a different part of the screen.

`readScreen` measures each region's translation separately and marks the ones
that hold still while the rest moves. The penalty retires only where the
element is actually fixed — a dropdown that scrolls with the page keeps it, so
the billing-page false positive this was added for still fails.

The other two rescues remain: the **flash** (a wheel scroll does not make a nav
item light up) and the **audit** (§9).

### 7.5 Output

Every event carries its own audit trail: `zoomable`, `basis`
(`flash|hand|control|held|scrolling|moving|arrow|off-control|nothing-read`),
`score`, `why` (a human sentence), `pointer_shape`, `control`, and `target` (the
control's bbox, if named).

---

## 8. Zoom construction — `events.js zoomsFromClicks()`

**The camera moves for a click and for nothing else.** There used to be a second
source — Gemini's `ZOOM_PLANNER` watched the recording and proposed emphasis of
its own. It is **deleted, including its model call**, because:

- On one recording a planned zoom arrived 1.5 s after the API Keys click, over
  a page that had already loaded — *"zoom is happening after some delay"*.
- On another it landed on a billing page the creator was only scrolling.
- A planned zoom has **no press behind it by definition**, so it breaks the one
  rule the creator cares about most.

### 8.1 One click, one zoom

Per accepted click (`confidence ≥ 0.55`, `corroborated !== false`,
`zoomable !== false`):

```
start = click.t - SETTLE(0.3)                 // fully zoomed before the press
end   = click.t + max(HOLD(0.55), settleAfter(t))
rect  = containingBox([controlBox or clickPoint], level)
level = levelForBox(...)
ramp_out = 0.42, easing "smooth"
camera = controlBox ? "element" : "cursor"
```

### 8.2 Zoom level is derived, not fixed

```js
TARGET_SHARE   = 0.34    // the thing should occupy ~a third of the picture
LEVEL_MIN      = 1.4     // below this nobody can see the camera moved
LEVEL_MAX      = 2.8
MAX_UPSCALE    = 1.8     // ceiling = 1.8 × sourceWidth / 1920, clamped
level = clamp(TARGET_SHARE / max(box.w, box.h), LEVEL_MIN, ceiling)
```

**A zoom does not magnify, it crops and rescales.** The cap used to be a flat
2.8, which is right for a 4K recording and badly wrong for a 1080p one —
exported at 1080p, a 1080p source at 2.4× *is* a 2.4× upscale, and every zoomed
frame of a real demo came out mushy while the unzoomed ones were sharp.

### 8.3 Framing that cannot miss its own target

`containing()` clamps the **centre** into the range the window may legally
occupy, *before* building the rect. Clamping the rect afterwards moves it *away*
from the point — which is how a click at `x = 0.05` ended up outside its own
zoom. The level is **lowered**, never the framing sacrificed: *a wider shot that
contains what was clicked beats a tighter one that does not.*

### 8.4 Merging — and its limit

Two clicks closer than `MERGE = 1.6 s` become one camera move covering both.
Pulling out and back in between two presses a second apart is why auto-zoom has
a reputation for making people seasick.

But the rect **grows** to hold everything it merges, and a rect grown to nine
tenths of the frame is not a zoom — *it is the whole screen with the edges
trimmed*, which is exactly what one real demo exported. So `MERGE_MAX = 0.62`
(≈1.6×): past that the clicks get separate zooms instead.

When Gemini's `STEP_DETECTOR` has grouped presses into a step, the window
relaxes to `MERGE_IN_STEP = 3.2 s` *within* a step and not at all across a step
boundary — six presses filling one form are one thing the viewer is watching,
however slowly the person typed.

### 8.5 Zoom hygiene, in order

| Function | Rule |
|---|---|
| `restToFull(zooms, rest=0.35)` | The camera **must reach 1.0×** between moves. Gap is measured between *influences* (ramp-in to ramp-out), not between start/end. Anything that cannot be given that beat is **dropped** — *one clean zoom reads better than two that never let go.* Without this the previous zoom is still pulling out as the next pulls in, and the picture never reaches full frame: a permanent crop that wobbles. |
| `capZoomed(zooms, duration)` | `MAX_ZOOMED = 0.6` — a demo may not be zoomed for more than 60% of its length. |
| `dropScrollZooms(...)` | A zoom with more than `SCROLL_RATE = 0.06` frame-heights/sec of page travel under it is dropped. Measured as **distance, not frame count**: a trackpad scroll is bursty, and over one real 3.5 s zoom only 18% of frames carried a shift — which added up to the page moving more than half a screen height. |
| `sanitizeTimeline(...)` | **Non-overlap invariant**: sorted by start, and any zoom starting before the previous ends truncates the previous. Zooms shorter than 0.05 s after truncation are removed. |

---

## 9. THE ARBITER — `audit.js` + `PRESS_ARBITER`

This is the part the question is really about.

### 9.1 What it is not

> It is not a second click detector. The clicks come from `events.js` reading the
> pointer, and `locate.js` finding it by its shape in every frame, and that stays
> the source of truth. A model cannot compete there and should not be asked to:
> a press is a tenth of a second of pointer behaviour, the frames are sampled
> every two seconds, and **the moment is literally between them**. Sampling
> thirty times finer to see it would cost thirty times the frames to answer a
> question the template matcher already answers to the pixel.

### 9.2 What it is

The check that nothing was missed, at the small number of moments where the
decision is genuinely in doubt — reported as something the creator can accept or
ignore.

**The idea that makes it affordable:** *"find every click we missed"* is
unbounded and mostly pointless. *"Find every click worth a camera move"* is
bounded, because **every one of those produced a visible change on screen** —
that is what makes it worth watching. A press that changed nothing is a press
nobody wants a zoom on.

So the candidate set is arithmetic, not a model call. On a real demo that is a
couple of dozen moments, not a couple of hundred, **because it counts what
HAPPENED rather than how long the recording is.**

### 9.3 Neither side outranks the other

An earlier version only audited presses the pipeline was *already unsure about*,
on the reasoning that where it is confident it is right. **That reasoning cost
the creator real clicks.** A press refused for "the pointer never stopped here"
is a *confident* no by the gate's own reckoning, and it was also wrong.

> The honest position is that the pixel pipeline is not a sensor. There is no
> hardware click anywhere in this product […] so every press in the timeline is
> already an inference from pixels. Ranking one inference above another and only
> checking the loser is a **habit, not a hierarchy of reliability**.

### 9.4 `plan()` — what to spend money on

Candidates, ranked:

| Priority | Kind | What it is |
|---|---|---|
| 0 `refused` | press | A press the gate turned down on a **heuristic** (`moving`, `scrolling`, `arrow`, `off-control`, `nothing-read`, `held`). Not `no-consequence` — that one is a *fact*, not an inference. |
| 1 `rested` | press (proposed) | A pointer **rest** with no event on it and no zoom over it. This is the click that was *never proposed* — because its result was a toggle flipping or a value changing on the other side of the screen — so it is invisible to both the event list and the change list. **Exactly the click a creator notices missing.** |
| 2 `unaccounted` | change | The screen changed and nothing explains it. Could be a refused press, *or something worth watching that nobody pressed* — a result arriving, an error, a value updating. No click rule could ever find those. |
| 3 `thin` | press | A press allowed on **one** signal only. Worth confirming, and worth a box to frame properly. |
| 4 `confirm` | change | Already accounted for. Reached on a short recording, skipped on a long one. |

**Folding rules** (one question per moment):

- A **change** folds into a **press that precedes it** — they are the same
  moment reported twice, and the change follows the press.
- Two **found** presses are *always* two questions, however close. The first
  version folded any two candidates within the explanation window and on a dense
  demo that ate the presses: thirteen candidates came out as four, and a click at
  4.45 s disappeared into the audit for a different click at 2.93 s.
- A **proposed rest** *does* fold, because it carries no claim beyond "the
  pointer stopped here".

**Budget:** `clamp(duration / 3, 24, 120)` moments.

### 9.5 The frame strip — why six frames, not two

The original was two frames at −0.16 s and +0.6 s. That is a keyhole **0.76
seconds wide**, and three of the four things that prove a press happened fall
outside it:

| Evidence | Why the keyhole misses it |
|---|---|
| The **approach** | The pointer arriving and stopping — what separates a press from the pointer being parked there |
| The **morph** | Arrow → hand: the OS itself saying the thing answers a click |
| The **ripple** | A frame or two long |
| **PERSISTENCE** | The one that actually decides it, and the one a single after-frame cannot show at all. *"Did the change STAY?"* is not answerable from one picture of the change. |

And the keyhole **actively misleads on a slow page**: at +0.6 s a page that had
to fetch is showing a spinner, so the model reads a real press as the screen
settling on its own and the camera is withheld.

```js
AUDIT.strip     = [-0.5, -0.18, 0.12, 0.4, 0.9, 1.8]     // 2.3s window
AUDIT.stripWide = [-1.2, -0.3, 0.15, 1.0, 2.5, 4.5]      // 5.7s window
AUDIT.stripEdge = 1024                                    // px long side
```

**Nothing here needs to happen in real time.** The recording is finished and
every frame is on disk, so the only cost of looking further is tokens — and they
buy the evidence that matters.

> This is the direct implementation of the creator's instruction: *"it is not
> necessary to take a decision at a particular frame, you can actually go back
> and forth so that you can make a judgment after some time — we have the whole
> time editing the video."*

### 9.6 The escalation

```js
let said = await arbitratePress({ frames: strip, at: p });
if (said.verdict === "unclear") {
  const wider = await frameStrip(video, p.t, { offsets: AUDIT.stripWide });
  const again = await arbitratePress({ frames: wider, at: p });
  if (again && again.verdict !== "unclear") said = again;
}
```

> An "unclear" is a **request for more time, not a verdict**. The model saying it
> cannot tell is the model saying the window it was given did not contain the
> answer. Treating that as "no press" throws away exactly the moments the audit
> exists for.

Only an unclear answer pays for the wide window, so a recording of ordinary
presses never does.

### 9.7 GEMINI #3 — the `PRESS_ARBITER` prompt (verbatim, abridged)

The call sends the prompt, then a **legend** giving each frame's offset, then the
images:

```
The pointer was resting at 42.1% across and 18.6% down the frame.
The moment in question is 0.00s. The 6 images that follow are, in order:
  1. -0.50s
  2. -0.18s
  3. +0.12s
  4. +0.40s
  5. +0.90s
  6. +1.80s
```

> Without the offsets it can see that things differ and not how far apart they
> are, and **the whole question is about time**.

The prompt:

> You are given SEVERAL frames from around that moment, in time order, each
> labelled with its offset in seconds from the moment (negative is before it).
> **Read them as a short film, not as separate pictures.**
>
> **WHAT A PRESS LOOKS LIKE ACROSS THESE FRAMES**
> A press is a sequence, and the sequence is the evidence:
> 1. The pointer ARRIVES at the position in the early frames and STOPS there.
> 2. It may change shape — an arrow becoming a hand, or a text caret over a
>    field. The operating system only draws a hand over something that answers a
>    click, so this is strong evidence when you can see it.
> 3. Around the moment there may be a brief ACKNOWLEDGEMENT at the pointer: a
>    ripple, a flash, a button darkening while held. It lasts a frame or two and
>    then goes.
> 4. Afterwards something CHANGES AND STAYS CHANGED for the rest of the frames.
>
> **Point 4 is the one that decides it**, and it is why you are given several
> frames after the moment rather than one. A change that is present in the first
> frame after and GONE by the last was decoration or an animation, not the
> result of a press.
>
> **BEFORE ANYTHING ELSE: IS THIS A PICTURE OF ANOTHER SCREEN?**
> […] If it sits inside an embedded video player, a screenshot or mockup of
> another application, a phone or laptop frame with a user interface drawn
> inside it, an animated GIF of software being used, or any other picture of a
> screen within the screen, then answer "content" and stop.
>
> This matters more than every other rule here. Such a recording was made on
> somebody else's machine and it contains THEIR mouse pointer, moving, clicking,
> opening menus and navigating between pages. Everything you are told to look
> for below […] is present inside it, perfectly and repeatedly, because a real
> person really did press those things. **They are simply not the person whose
> recording this is, and a camera move onto them is a camera move onto a
> stranger's mouse.**
>
> Tell it apart by its FRAME, not by its content: a browser window with its own
> tab strip and address bar sitting inside the page, a rounded rectangle with a
> drop shadow floating over a marketing layout, a device bezel, a play button or
> scrubber, letterboxing. **A real application fills its window to the edges of
> the recording; a picture of one sits inside a page with margins around it.**
>
> **WHAT IS NOT A PRESS**
> - HOVER: a shade, a highlight, an underline, a tooltip, a shadow. […] nothing
>   structural changed.
> - SCROLL: the same content moved up or down.
> - SETTLING: the screen changing on its own — a spinner resolving, a skeleton
>   filling in, data arriving. Tell this from a press by WHERE and WHEN: settling
>   is usually not at the pointer, and it is often **already under way in the
>   FIRST frame you are given**, before the moment.
> - **The pointer merely being over something clickable is NOT evidence. Only
>   the consequence is.**
>
> **BE PATIENT WITH A SLOW PAGE**
> Some presses take a second or more to show anything: a spinner first, the
> answer later. That is still a press […] Do not call a press "settling" just
> because the frame straight after it shows a loading state — **look to the end
> of the sequence.**
>
> **IF IT IS GENUINELY AMBIGUOUS**
> Say "unclear" with a low confidence. You may be asked again with a longer
> window. **An honest "unclear" is a useful answer; a confident guess is not.**

Response schema:

```json
{
  "verdict": "press|hover|scroll|settling|content|unclear",
  "confidence": 0.0,
  "target": "the label of what was activated, or \"\"",
  "target_type": "button|link|nav_item|tab|text_field|dropdown|toggle|checkbox|menu|list_item|icon_button|other|none",
  "target_bbox": [0,0,0,0],   // as it appears in the FIRST frame
  "result_bbox": [0,0,0,0],   // what CHANGED, as it appears in the LAST frame
  "typed": "text that appeared in a field, or \"\"",
  "settled_by": 0.0,          // offset of the first frame where the result is fully visible
  "what_happened": "one short sentence"
}
```

`settled_by` is clamped to `[0, 6]` — *a number outside the window it could have
been observed in is the model guessing rather than reading.* It becomes the
camera's hold time: `hold = max(1.5, settled_by + RESULT_BEAT(0.9))`.

### 9.8 GEMINI #4 — `CHANGE_AUDITOR`

Two frames (before/after), for moments where the pipeline found **nothing**.

> Two things live in that gap, and both matter:
> - **a press the pixel rules refused** — typically because the site drew a
>   plain arrow over a real button
> - **something worth watching that nobody pressed** — a result arriving, an
>   error, a value updating. No click exists to find, so no click rule could
>   ever have found it.
>
> The second is the reason this prompt is not just "was there a click here".
> **The camera exists to point at what matters, and what matters is not always
> something somebody pressed.**

Returns `kind` ∈ `content|action|result|scroll|loading|noise|unclear`, plus
`worth_camera`, `confidence`, `label`, `bbox`.

Server-side sanity check: `worth_camera: true` on a kind of `loading` or `noise`
is self-contradictory, so **the kind wins** — it is the harder judgement and the
one the schema describes in most detail.

### 9.9 Findings

| Finding | Raised when | Offered as |
|---|---|---|
| `missed_press` | verdict `press` on a press the gate refused | `add_zoom` |
| `missed_moment` | `CHANGE_AUDITOR` says `result` and `worth_camera` | `add_zoom` |
| `wrong_zoom` | verdict `hover`/`scroll`/`settling` on a press that *got* a zoom | `remove_zoom` |
| `reframe` | verdict `press`, zoom exists, but its rect doesn't **hold** the control | `adjust_zoom` |
| `no_change_needed` | `worth_camera` false | recorded only |

`holds()` is stricter than "contains": a shot more than **6× the area** of the
thing it is about contains it and shows the viewer a page.

### 9.10 The two confidence bars — and the bug that created them

```js
AUDIT.accept = 0.60   // worth showing the creator
AUDIT.apply  = 0.80   // worth doing to their edit WITHOUT BEING ASKED
```

> They answer different questions. `accept` asks *"is this worth showing the
> creator"*, where being wrong costs them a moment reading a suggestion and
> dismissing it. `apply` asks *"is this worth doing to their edit without being
> asked"*, where being wrong costs them a camera move they did not want and have
> to find and delete.

**The gap is not theoretical.** On a recording of a page with a demo video
playing on it, the arbiter answered `press` for ten moments inside that video —
**honestly**, because a real person really had pressed those things, on their own
machine, before this recording existed — and **ten camera moves onto a stranger's
mouse were applied to an edit that had correctly decided on none.** Production
log:

```
analysed …: 0 zooms
10 zoom(s) added for presses the camera had missed
```

The `content` verdict is the real fix; the two-bar split is what keeps the cost
of the *next* unforeseen case a suggestion rather than an edit.

### 9.11 Auto-apply

`STUDIO_AUTO_PRESS_ZOOMS` (default `1`). Only `add_zoom` with
`confidence ≥ 0.8` is applied unasked.

> A `wrong_zoom` still only ever offers to **remove** something, because taking a
> camera move away from a creator who wanted it is the mistake that cannot be
> undone by watching the result, and a `reframe` is a matter of taste.

### 9.12 The line that is never crossed

> What is invented may never be an **EVENT**. Nothing here writes a click into
> the timeline. It proposes camera moves, it annotates evidence already on the
> record, and every proposal is a button somebody presses. **A demo that
> confidently shows a button being pressed that was never pressed is not an
> edit, it is a fabrication.**

---

## 10. Render — `render/camera.js`

ffmpeg `zoompan` with supersampling and gated-sum expressions. Camera math
exists in **three parallel implementations**:

| Where | What |
|---|---|
| `src/components/Studio/model.js` | browser preview |
| `backend/services/studio/timeline.js` `cameraAt()` | node, for the editor |
| `render/camera.js` `EASE_EXPR` | ffmpeg expression strings |

**They can diverge.** This is a known risk.

`cameraAt()` ramps a new zoom in **from the full frame** (`lerpRect(full, target, k)`),
which is the cause of the pull-out/dive-in wobble a creator reported when two
zooms are close together.

---

## 11. What changed, and what is still weak

### 11.1 Fixed since this was first written

| Was | Now |
|---|---|
| Scroll was a boolean | `readScreen` measures **per-region vertical translation** on a 4 x 16 grid and integrates it into a viewport offset (`scrollAt`). A region that holds still while the rest moves is **fixed** (`isSticky`) |
| A press on a sticky navbar was refused for "the page was scrolling" | The penalty retires where the element is sticky, by the model's reading OR by the pixel measurement. Measured: the same press goes from score 0.4 (refused) to 0.75 (accepted) |
| Element boxes were read from a frame up to 1.4s away | `atTime()` moves a box by how far the page scrolled between the frame and the moment, unless it is fixed. A control read at 2.0s is found when pressed at 3.0s after 0.38 frame heights of travel |
| Cursor visibility was not modelled | `cursorAt` reports `held` and `since`. A following camera **freezes** while the pointer is unseen (measured: 0.0px of drift) and **eases back** over 0.6s rather than snapping |
| Camera math existed in three files | One module (`src/components/Studio/camera.mjs`), imported by two, and the ffmpeg third is checked numerically every run |
| Every zoom ramped in from the full frame | A move that interrupts another starts from where the camera actually is |
| No `pressed` / `sticky` reading | `UI_ANALYZER` reports both; `pressed` is worth +0.5, ranked with the flash as first-hand evidence |
| Nothing read the approach | `approachOf` classifies aimed / hesitant / passing from net displacement; +0.3 for aimed, -0.3 for passing |
| Motion was not attributed | `explainMotion` says whether a change was a video, a scroll, an animation or the page responding. "Something changed" no longer counts when it was a video playing |
| The camera aimed at the click coordinate | `flashesFrom` now returns **where** the interface lit up, and the shot centres on it within the slack the framing allows |

### 11.2 Still weak

- **Object identity without scroll.** Moving dialogs, carousels and animated panels are not tracked — scroll compensation cannot explain motion that is not scroll. Needs visual descriptors.
- **Cursor states: 6 of ~13.** `forbidden` is a *ring* and `buildTemplate` fills polygons with no hole support. `wait` is animated and needs a temporal detector, not a template. `grab`/`grabbing` are untraced.
- **The I-beam is still unmatchable** — NCC norm 0.76 across 1 grey level. Needs a blinking-caret detector.
- **Browser chrome vs a page's own fixed header** are the same thing from pixels: a band at the top that does not move. `chromeBand` therefore only fires when `getDisplayMedia` positively reported a monitor or window share, and is weak evidence retired by anything positive.
- **The scroll measurement undershoots** by roughly 10-15% on fast eased scrolls (measured 1.26 of 1.47 frame heights). Enough for sticky detection and box compensation; not a precise odometer.
- **Vision is still off by default** (`STUDIO_VISION_ON_ANALYSE`), so `W_CONTROL`, `pressed` and the embedded-video veto are inert unless turned on. The pixel-only path now covers sticky detection, which it did not before.
- **The blur pass is paused** (`STUDIO_BLUR=off`) while the camera is being worked on. The editor still says nothing has been checked.

## 12. Every Gemini call in the system

| # | Prompt | Model | Input | Cadence | Live? |
|---|---|---|---|---|---|
| 1 | `UI_ANALYZER` | vision | 1 frame @1280px | every 2 s | only if `VISION_ON_ANALYSE=on` |
| 2 | `STEP_DETECTOR` | text | up to 40 frame summaries + events | once | ✓ |
| 3 | `ZOOM_PLANNER` | — | — | — | **DELETED** (§8) |
| 4 | `BLUR_DETECTOR` | vision | 1 frame | every sampled frame | **paused** (`STUDIO_BLUR=off`) |
| 5 | `CAPTION_GENERATOR` | audio | audio track | once | opt-in |
| 6 | `NARRATION_WRITER` | text | steps | once | ✓ |
| 7 | **`PRESS_ARBITER`** | vision | **6 frames @1024px + offset legend** | ≤ `budgetFor(duration)` | ✓ (review stage) |
| 8 | **`CHANGE_AUDITOR`** | vision | 2 frames | within the same budget | ✓ (review stage) |
| 9 | `QUALITY_REVIEWER` | text | the finished timeline | once | only if steps exist |
| 10 | **`POINTER_IDENTITY`** | vision | ≤ 3 boxed frames per rival pointer @1280px | once, only when two pointers both fit (§3.2.1) | ✓ (`STUDIO_POINTER_VISION`) |
| 11 | **`POINTER_RUNS`** | vision | 1 reference + ≤ 2 boxed frames per unproven run, ≤ 8 runs | once per analysis with an unproven run (§3.2.2) | ✓ (`STUDIO_POINTER_VISION`) |

Rate limiting is **process-wide** via `services/ai/provider.js` (`GEMINI_RPM`,
`GEMINI_CONCURRENCY`, Redis-coordinated), not per-pass. `vision.js` has **no
retry loop** — it makes a single call, because two stacked retry loops multiply
into attempts nobody asked for.

Cost accounting: `GEMINI_USD_PER_M_INPUT=1.50`, `GEMINI_USD_PER_M_OUTPUT=9.00`.
`spend` is mutated rather than returned, so a call that fails on its last attempt
still accounts for tokens burned by earlier attempts — *those were charged by
Google whether or not this product got an answer.*

---

## 13. Every threshold that affects zoom, in one place

```
── POINTER ────────────────────────────────────────────────────────────────
GLYPH_CSS            19      assumed cursor height in CSS px
UNIQUE               0.12    best − second, below which both are rejected
BROWSER_TRUST        0.6     agreement needed to narrow the design search
PLAYING_SHARE        1/3     animating share that marks a region as video
PLAYING_MAX_COVER    0.35    above this the whole veto is dropped
STUDIO_LOCATE_BUDGET_MS      duration × 15000, clamped [300k, 1800k]

── FLASH (the press acknowledgement) ──────────────────────────────────────
RING / RING_HOLE     2.6 / 1.35 × pointer height
STILL_RUN / STILL_PX 4 frames / 2.5 px
FLASH_MAX            8 frames
FLASH_FLOOR/SIGMA    3.5 grey levels / 4σ
FLASH_BACK/FWD       0.45 s / 0.35 s   window for matching a flash to a press

── WHOSE POINTER (2026-09-24) ─────────────────────────────────────────────
RIDE_BASE          0.25 s   the earlier frame the ride test compares with (and the one just before)
RIDE_OWN / SLACK   40 px / ≤40% of the move   a demo cursor's own drift while the page carries it
RIDE_EXPLAINED     0.35     most of the changed pixels one shift may leave unexplained
PROVEN_NEAR        150 px   a new run this near where the creator's pointer was last seen is theirs
PROVEN_SEEN        3        sightings before a proven run marks where the creator's pointer is
BLEND_TOL          3        grey levels of slack for sub-row scroll blends in readMedia
PICTURE_BEFORE     3 s      in-picture: how far back a playing picture at the press spot counts
RIVAL_FIT          0.78     a calibration candidate fitting this well, and the clear match once, is a pointer
SAME_POINTER       1.15     heights within this ratio (same design) are one pointer, not two
PICTURE_NEAR       1.5 s    a sighting with a moving picture this near, either side, is not "clean"
CLEAN_LEAD         2        clean sightings one rival needs over another to win without the model
RUN_GAP / RUN_MIN  0.5 s / 0.25 s   a run of sightings, and the shortest worth asking about
RUN_SURE           0.6      the model's confidence before our pointer stops following a run

── THE GATE ───────────────────────────────────────────────────────────────
W_CHANGED +0.25  W_FLASH +0.60  W_PRESSED +0.50  W_HAND +0.50
W_CONTROL +0.50  W_HELD  +0.30  W_AIMED   +0.30
W_ARROW   -0.20  W_CHROME -0.25 W_MOVING  -0.30  W_PASSING -0.30  W_SCROLLED -0.35
PRESS_BAR  0.50
HELD_CLICKABLE     0.2 s
REST_MS            200 ms
REST_FRESH/HOVER   2.5 s / 6 s
CONSEQUENCE        1.4 s, growth ≥3×, or ≥5% cover on the press frame

── THE VIEWPORT AND WHAT IS FIXED (sync.js) ───────────────────────────────
SCROLL_COLS/ROWS   4 / 16   the grid each region's travel is measured on
SCROLL_RANGE       0.25     furthest the page may travel between two frames
SCROLL_TEXTURE     8        below this a region is flat and does not vote
SCROLL_MOVED       3 rows   frame shift below which nothing really moved
SCROLL_STILL       1.5 rows ...and how close to zero counts as fixed
STICKY_VOTES       3        scrolls a region must sit out to be called fixed
STICKY_MARGIN      2x       ...and how decisively, against times it rode along
CHROME_MAX         0.15     widest band that may be browser furniture

── THE APPROACH (events.js) ───────────────────────────────────────────────
APPROACH           0.5 s    how far back the approach is read
APPROACH_FAST      0.35     frame widths/sec that count as really travelling
APPROACH_LANDED    0.3      share of the travel the last stretch must fall to

── THE CAMERA (camera.mjs) ────────────────────────────────────────────────
RAMP_IN            0.24 s   click zooms, was 0.55
PUNCH_BACK         0.9      ~3% overshoot past the mark, then settle
DEAD_ZONE          0.12     of the VISIBLE rect, not the frame
EDGE_SOFT          0.06     where the camera starts resisting the edge
TRAIL              0.2 s    the window the follow camera aims at
REACQUIRE          0.6 s    how long to ease back after losing the pointer
BLEND_DEPTH        3        how many moves back a blend may look
BLEND_HZ           30       sampling where two moves overlap

── ZOOM SHAPE ─────────────────────────────────────────────────────────────
SETTLE             0.30 s   fully zoomed before the press
HOLD               0.55 s   minimum, extended by settleAfter() to ≤2.6 s
RAMP_OUT           0.42 s
MERGE              1.6 s    (3.2 s within one detected step)
MERGE_MAX          0.62     widest a merged rect may get (~1.6×)
TARGET_SHARE       0.34     the thing should fill a third of the picture
LEVEL_MIN/MAX      1.4 / 2.8
MAX_UPSCALE        1.8      ceiling = 1.8 × sourceWidth / 1920
BOX_MARGIN         0.06
REST (to full)     0.35 s   beat at 1.0× required between zooms
MAX_ZOOMED         0.60     max share of the demo that may be zoomed
SCROLL_RATE        0.06     frame-heights/sec of travel that kills a zoom

── THE AUDIT ──────────────────────────────────────────────────────────────
changeCover        0.04     screen share that makes a moment noticeable
standOut           2.2×     ...above the local median baseline
baselineWindow     2.5 s
explainBefore/After 1.6 s / 0.45 s
zoomPad            0.5 s
maxChecks/maxLooks 24 / 120     budget = clamp(duration/3, 24, 120)
strip              [-0.5, -0.18, 0.12, 0.4, 0.9, 1.8]
stripWide          [-1.2, -0.3, 0.15, 1.0, 2.5, 4.5]
stripEdge          1024 px
accept / apply     0.60 / 0.80
LEAD/HOLD/RESULT_BEAT  0.45 s / 1.5 s / 0.9 s
```

---

## 14. Environment flags

```bash
STUDIO_VISION_ON_ANALYSE=on     # default "off" — see §11.6
STUDIO_POINTER_VISION=off       # default "on" — whose pointer, §3.2.1/§3.2.2 (a fraction of a cent, only when needed)
STUDIO_WITNESS=shadow           # default "shadow" — second witness, §7.2; "suggest" offers its missed clicks, "off" skips it
STUDIO_WITNESS_MODEL=gemini-2.5-pro   STUDIO_WITNESS_FPS=10
STUDIO_PRESS_JUDGE=off          # default "off" — per-press judge experiment (judge.js); "shadow" records verdicts
STUDIO_AUTO_PRESS_ZOOMS=1       # default 1 — auto-apply add_zoom at ≥0.8
STUDIO_FRAME_EVERY=2            # seconds between UI_ANALYZER frames
STUDIO_VISION_CONCURRENCY=4     # frames in flight (memory, not rate limit)
STUDIO_LOCATE_BUDGET_MS=600000  # wall-clock ceiling on the locator
GEMINI_RPM / GEMINI_CONCURRENCY # the real rate limits, process-wide
```

---

## 15. Regression tests (all synthetic — they build their own recordings)

```
backend/scripts/pointerTest/
  bench.mjs     accuracy across 7 page/pointer combinations
  coverage.mjs  renders a real export; counts visible real-pointer pixels (must be 0)
  clicks.mjs    which presses move the camera — runs on paths, no video, no Gemini
  parked.mjs    a still pointer while a spinner turns — the hardest frame in any demo
  content.mjs   a cursor inside a demo video playing on the page  ← the §3.3 bug
  glyph.mjs     what the BROWSER measures at full resolution      ← §2.2
  profile.mjs   what the SERVER does with that measurement, incl. the wrong-profile fallback
  camera.mjs    do the preview, the server and ffmpeg agree?      ← found 807px and 487px
  sticky.mjs    a fixed nav bar over a scrolling page             ← the 5-of-10 refusals
  scrolled.mjs  a page scrolled end to end, a demo's cursor riding along,
                a press on a see-through fixed bar               ← 2026-09-24 (old code: 0 of 62)
  witness.mjs   the second witness on every labelled recording: useful offers vs noise
  arbiter.mjs   what the review stage's arbiter WOULD add on one recording —
                run it before ever turning STUDIO_AUTO_PRESS_ZOOMS on
  strangers.mjs what the drawn path does with a stretch the model calls
                somebody else's — held at the creator's last place, not
                switched halfway; untouched without an answer   ← §3.2.2
  real.mjs      actual recordings dropped into fixtures/
  truth.mjs     real recordings SCORED against labelled presses ← run before every deploy
                (with VERTEX_PROJECT set = what production runs; with
                STUDIO_POINTER_VISION=off = the pixel-only fallback, own budgets)
  replay.mjs    one real recording through the whole analysis, printed
                (--cursor light:18 forces the design: "would the rest have worked?")
```

`clicks.mjs` deliberately needs no Gemini — *the rule has to hold on the day the
credits run out.*

---

## 16. What would most improve this next

Everything in §11.1 is done. What is left, ranked:

1. **Visual descriptors for object identity** — the only way to track a dialog
   that animates or a carousel that advances, neither of which scroll explains.
   This is the remaining two-thirds of "persistent object tracking".
2. **A mask-based template path** so `forbidden` (a ring) and the other
   non-polygon cursors can be drawn at all.
3. **A blinking-caret detector** for the I-beam — the one cursor that is
   mathematically unmatchable by correlation.
4. **A temporal detector for the wait cursor**, which changes every frame and so
   cannot have a static template. Would also let the camera hold through a load
   rather than pulling out into a spinner.
5. **Turn the vision pass on by default**, once its cost is understood — three
   of the strongest channels (`W_CONTROL`, `W_PRESSED`, the embedded-video veto)
   are inert without it.
6. **Turn the blur pass back on** before anyone outside the team records.

Open design question, unchanged: **is the two-stage split right at all?** The
gate runs on cheap pixel evidence and the arbiter re-litigates a handful of
moments expensively. The counter-argument in the code (§9.1) is that a press is
a tenth of a second of pointer behaviour, the frames are sampled every two
seconds, and the moment is literally between them.
