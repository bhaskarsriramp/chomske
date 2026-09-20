# Pointer locator tests

Proves that `services/studio/locate.js` finds the operating system's pointer in
a recording, and that the pointer drawn over it covers it in the finished
export — on any page, not just the one demo these were written against.

    node scripts/pointerTest/bench.mjs        # accuracy, across pages and pointers
    node scripts/pointerTest/coverage.mjs     # is the real pointer ever visible?

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

Windows only: the pointer images come from `C:/Windows/Cursors`. They are read
at run time and never copied into the product.
