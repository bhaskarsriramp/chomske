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
    node scripts/pointerTest/real.mjs         # actual recordings, in fixtures/

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
