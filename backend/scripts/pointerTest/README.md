# Pointer locator tests

Proves that `services/studio/locate.js` finds the operating system's pointer in
a recording, and that the pointer drawn over it covers it in the finished
export — on any page, not just the one demo these were written against.

    node scripts/pointerTest/bench.mjs        # accuracy, across pages and pointers
    node scripts/pointerTest/coverage.mjs     # is the real pointer ever visible?
    node scripts/pointerTest/clicks.mjs       # which presses move the camera
    node scripts/pointerTest/parked.mjs       # a still pointer on a page that is not
    node scripts/pointerTest/content.mjs      # a cursor inside a video on the page
    node scripts/pointerTest/glyph.mjs        # what the BROWSER measures, at full size
    node scripts/pointerTest/profile.mjs      # ...and what the server does with it
    node scripts/pointerTest/camera.mjs       # do the preview and the export agree?
    node scripts/pointerTest/sticky.mjs       # a fixed nav bar, and a page that scrolls under it
    node scripts/pointerTest/scrolled.mjs     # a page scrolled end to end, a demo's cursor riding along
    node scripts/pointerTest/real.mjs         # actual recordings, in fixtures/
    node scripts/pointerTest/truth.mjs        # actual recordings, SCORED against what really happened
    node scripts/pointerTest/replay.mjs <file.mp4>   # one recording through the whole analysis, printed

**Before any change to `locate.js`, `sync.js` or `events.js` ships, run all of
them — and `truth.mjs` above all.** On 2026-09-23 a fix made one recording of
cursorful.com come out right and every synthetic test here passed; the next
morning a recording of the same page, scrolled a little more, lost both of its
presses and had our pointer drawn on a stranger's cursor. Every synthetic test
still passed. Only a real recording with its answer written down catches that.

They build their own test recordings, so they need no fixtures: a page is drawn
(deliberately hostile — hundreds of text-like strokes, boxes, circles and sixty
arrow-shaped glyphs), the system's own pointer images are composited onto it
along a known path, and the clip is encoded as a real recording would be.

`bench.mjs` reports, per page and pointer style: how often the pointer was
found, how far from where it really was, whether the shape was right, and
whether anything was reported while the pointer was OFF screen.

`coverage.mjs` goes further and renders an actual export, then counts pixels of
the real pointer (tinted, so it can be told from ours) still visible around it
in every output frame. The number that matters is zero.

`clicks.mjs` is about what the pointer's shape is FOR. The camera only moves on
a press that landed on something clickable, and the shape the operating system
drew is how that is known: a hand over a link or a menu row, a plain arrow over
a heading, a margin, or the empty half of a panel still loading. It runs on
pointer paths rather than video, so it takes a fraction of a second and needs
no Gemini — which is the point, since the rule has to hold on the day the
credits run out.

`parked.mjs` is the hardest frame in any demo: the pointer sitting still on
a menu row while a spinner goes round and the page waits. Nothing moves where
the pointer is, so the difference tracker cannot see it and its hints point at
the spinner instead; the page is otherwise static, so frame after frame is
identical. On a real recording that lost the pointer for six and a half
seconds and took the click on "API Keys" with it.

`content.mjs` is the competitor's home page: a product demo PLAYING on the page
being recorded, with somebody else's cursor inside it, moving, looking exactly
like a cursor because it is one. Nothing about how it LOOKS separates it from
the creator's — what separates them is that it lives inside a rectangle that
repaints itself for the whole recording and can never leave it.

`glyph.mjs` is the odd one out: it tests the BROWSER rather than the server.
Before the locator can find a pointer it has to know which one to look for —
light body or dark, and how tall — and it decides that by searching the
uploaded video, where H.264 has smeared the one-pixel rim the answer lives in.
The browser can simply measure it instead, out of a small patch cut from the
original frame while the recording is being made
(`src/components/Studio/tracker.worker.js`, `readGlyph`). This composites real
cursors at known sizes over backgrounds chosen to be awkward — including the
two that defeat a naive reading, a white cursor on a white page and a black one
on a black page, where half the glyph does not change at all — and checks the
answer against the truth. It prints the height error rather than only passing,
because a bias of a pixel or two is the kind of thing that comes back.

`profile.mjs` is the other half of that: a firm measurement from the browser
NARROWS the server's search to the design it names, which is the improvement
and also the new way to lose. A confidently wrong measurement would send the
search looking for a pointer that is not there. locate.js reopens the search
when a narrowed one comes back empty, and this is the test that takes that
path — a fallback nobody has ever exercised is not a fallback.

`camera.mjs` is the odd one out twice over: it tests no pointer at all, and it
is the only test here guarding something a creator cannot work around. The same
camera move is computed in three places — the editor's preview, the server, and
ffmpeg's expression strings. Two of them now import one module
(`src/components/Studio/camera.mjs`); the third evaluates strings and cannot, so
it is checked numerically instead. It translates the ffmpeg easing expressions
back into JavaScript and compares them against the functions they mirror, then
samples a built timeline every frame and requires both routes to agree within
two pixels of 1920.

It has already earned it. On its first run it found the renderer starting every
camera move from the full frame while the preview blended from wherever the
camera was — 807 pixels apart, in the export only — and then a dense sample
quietly overwriting the curve name on the key before it, worth another 487.
Neither would have shown up in any other test here.

`sticky.mjs` is the production bug, reproduced. A creator pressed "Pricing" in
a navigation bar, the page scrolled to the pricing section — which is what an
anchor link does — and the camera did not move. Five of ten presses in that
recording were refused for "the page was scrolling", and events.js said in a
comment that the two cases could not be told apart: an anchor click and a wheel
scroll with the pointer resting on a nav item are the same evidence.

They are not the same GEOMETRY. The bar is fixed; it does not move when the page
scrolls under it, so "the page scrolled" is a fact about a different part of the
screen. sync.js now measures each region's travel separately, and this builds a
page with a real fixed bar, scrolls it hard, prints the map of what was found to
be fixed, and then judges the same press twice — with and without that knowledge
— to show the refusal flipping. It also checks the other half: that a control
read on one frame and pressed two seconds later, after the page has moved most
of a frame height, is still found.

`scrolled.mjs` is the 2026-09-24 production bug. The creator scrolled a whole
landing page with the keyboard — Windows hides the pointer while they do — past
embedded product demos with somebody else's cursor in them, then put the
pointer on "Pricing" in a see-through fixed bar and pressed, and the anchor
link jumped the page under it. The re-acquisition veto had been built from how
often each place on the SCREEN changed over the whole recording, and a scrolled
page changes everywhere: the bar was "video", the pointer could never be found
again where it was pressed, and a demo that scrolls up the screen was in no
place long enough to be "video", so the stranger's cursor inside it was taken
instead. On the code before the fix this clip finds the pointer on Pricing in
0 of 62 frames. What replaced the veto asks about the moment and the place —
was a picture PLAYING there with the scroll taken out (`sync.js readMedia`),
and did this match just move WITH the page (`locate.js ridesWithPage`), which
the real pointer, drawn in screen coordinates, never does.

`truth.mjs` scores real recordings against a written answer: the presses the
creator really made, and where the cursors that are not theirs are on screen.
Every labelled press must move the camera, no other zoom may appear, and our
pointer may sit on a stranger's for no longer than the file's budget. The
answers live in `truth/` and are committed — timestamps and coordinates only.
The footage lives in `fixtures/` and is not; each truth file says where to
fetch it. When a creator reports a recording, label it and add it here: that is
the only kind of test that has ever caught the bug nobody thought of.

Run it both ways before a deploy. **With the model** —
`VERTEX_PROJECT=<project> node scripts/pointerTest/truth.mjs` — is what
production runs: which of two real pointers is the creator's, and whether a
stretch of the drawn path was somebody else's, are asked of it
(`locate.js chooseIdentity`, `withoutStrangers`). **Without it** —
`STUDIO_POINTER_VISION=off` — is the fallback for a day the model does not
answer, and a file may hold it to its own `stranger_budget_pixel_s`. Without
`VERTEX_PROJECT` locally the model is not reachable and the first run is quietly
the second, so say which one you ran.

`cursorful-now-2026-09-24` is the recording that needed all of it: the demo's
black arrow fitted as well as the creator's white one, the creator's pointer was
not drawn for 21 seconds (a tab capture hides an idle pointer), and production
calibrated to the demo's — no zoom on either click.

`replay.mjs` is how a recording is labelled and diagnosed. It runs the whole
first analysis on one file — with the browser's tracker replayed over the video
by the real `tracker.worker.js`, because that report lives in the database and
not in the file — and prints every press with the gate's reason. The replay is
close to production, not identical: the browser saw the screen before the
encoder did, and on one recording it reports a scroll the real tracker did not.
`--cursor light:18` stands in for a firm browser reading of the pointer, which
answers "would everything after calibration have worked with the right design?"
in one run.

`real.mjs` is the one that catches what nobody thought of. The drawn pages
above can only contain the difficulties we imagined; every real failure so far
was something else — a recording whose pointer is a HAND nearly throughout
because the demo is of a sidebar, a window capture at 1904x1092, Windows
hiding the pointer while the creator types. Drop any screen recording into
`fixtures/` and it becomes a permanent test. When a creator reports a cursor
problem, that recording is the most valuable fixture there is.

It also runs each one **scaled down to 1280 wide**, because whoever is
recording decides how big the pointer is in the picture and decides it without
knowing — a smaller display, a scaled window, a capture the browser downsized.
One recording that read perfectly at 1920 calibrated to a design it does not
have at 1280 and found the pointer in none of its frames. Nobody would have
found that by looking at the original.

The recordings do not belong in the repo — they are somebody's screen, and they
are tens of megabytes — so empty `fixtures/` before a deploy.

Windows only: the pointer images come from `C:/Windows/Cursors`. They are read
at run time and never copied into the product. `clicks.mjs` and `real.mjs` need
none of them and run anywhere.
