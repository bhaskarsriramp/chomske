# Pointer locator tests

Proves that `services/studio/locate.js` finds the operating system's pointer in
a recording, and that the pointer drawn over it covers it in the finished
export — on any page, not just the one demo these were written against.

    node scripts/pointerTest/bench.mjs        # accuracy, across pages and pointers
    node scripts/pointerTest/coverage.mjs     # is the real pointer ever visible?
    node scripts/pointerTest/clicks.mjs       # which presses move the camera

Both build their own test recordings, so they need no fixtures: a page is drawn
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

Windows only: the pointer images come from `C:/Windows/Cursors`. They are read
at run time and never copied into the product. `clicks.mjs` needs none of them
and runs anywhere.
