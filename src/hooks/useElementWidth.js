import { useState, useRef, useLayoutEffect } from "react";

/**
 * The rendered width of one element, kept current.
 *
 * For components whose layout depends on the space they were GIVEN rather than
 * on the window. The script card sits in a phone sheet, in a desktop side pane
 * that can be 500px or 1000px wide, and in My scripts, and the viewport says
 * nothing about which of those it is in.
 *
 * 0 until the first measure. Measured in a layout effect, so that first measure
 * lands before paint and a narrow pane never flashes its wide layout.
 */
export default function useElementWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}
