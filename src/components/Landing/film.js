/**
 * film.js: the landing page's demonstrations, and the one clock that runs them.
 *
 * ── A SCRIPT, NOT A VIDEO FILE ───────────────────────────────────────────────
 * The hero, the before/after slider and the editor all play the same recording:
 * a pointer crossing a pricing page, three presses, and the camera Clipo would
 * build from them. It is drawn from markup rather than shipped as an mp4, for
 * three reasons that each matter on a landing page:
 *   - it is a few kilobytes, not a few megabytes, on the first paint;
 *   - it is sharp at every width, because it is text and boxes, not pixels;
 *   - the three places cannot disagree: the timeline lanes in the editor and
 *     the zoom marks under the hero are read from the same SCRIPT the camera is.
 *
 * ── THE CAMERA MOVES THE WAY THE PRODUCT'S DOES ──────────────────────────────
 * RAMP_IN, RAMP_OUT and the curve are copied from Studio/camera.mjs (EASE.smooth,
 * 0.45s in, 0.5s out) rather than imported, because that module is 33KB the
 * landing page has no other use for. The rectangle is interpolated the way
 * camera.mjs's lerpRect does it — the visible width, not the scale — so a zoom
 * here reads like a zoom in an export. If those numbers change there, change
 * them here.
 *
 * ── NOTHING RUNS THAT NOBODY IS LOOKING AT ───────────────────────────────────
 * Each film ticks only while it is on screen and the tab is visible. Under
 * prefers-reduced-motion nothing ticks at all: each film draws one poster frame
 * (zoomed in on a press) and stops.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export const RAMP_IN = 0.45;
export const RAMP_OUT = 0.5;
/** EASE.smooth in camera.mjs: cubic in-out. */
export const smooth = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, k) => a + (b - a) * k;

export const reducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * The recording. Times are seconds; a point is either {x, y} as a fraction of
 * the screen or {to: "name"}, the centre of the element marked data-target="name"
 * — measured from the page, so the pointer lands on the control at any width.
 */
export const SCRIPT = {
  duration: 9.6,
  /** The frame shown when motion is reduced: zoomed in, just after the second press. */
  poster: 3.78,
  path: [
    { t: 0, x: 0.6, y: 0.66 },
    { t: 0.4, x: 0.6, y: 0.66 },
    { t: 1.3, to: "nav-pricing" },
    { t: 2.35, to: "nav-pricing" },
    { t: 3.35, to: "plan-lifetime" },
    { t: 4.2, to: "plan-lifetime" },
    { t: 5.35, to: "buy-pro" },
    { t: 6.3, to: "buy-pro" },
    { t: 7.4, x: 0.76, y: 0.9 },
    { t: 9.6, x: 0.76, y: 0.9 },
  ],
  presses: [
    { t: 1.5, to: "nav-pricing", label: "Pricing" },
    { t: 3.6, to: "plan-lifetime", label: "Lifetime" },
    { t: 5.55, to: "buy-pro", label: "Get lifetime" },
  ],
  /** What the page does, and when. Each becomes a data- attribute on the screen. */
  events: [
    { t: 1.6, page: "pricing" },
    { t: 3.66, plan: "lifetime" },
    { t: 5.62, bought: "yes" },
  ],
  initial: { page: "home", plan: "monthly", bought: "no" },
  /** The camera Clipo builds: arrive before the press, leave once the result is up. */
  shots: [
    { in: 0.95, out: 2.0, s: 2.2, label: "2.2×", name: "Pricing", focus: [{ t: 0, to: "nav-pricing" }] },
    {
      in: 3.05,
      out: 6.05,
      s: 1.9,
      label: "1.9×",
      name: "Lifetime, following the cursor",
      follow: true,
      focus: [
        { t: 3.05, to: "plan-lifetime" },
        { t: 4.25, to: "plan-lifetime" },
        { t: 5.3, to: "buy-pro" },
      ],
    },
  ],
  /** Words spoken over it, for the captions lane and the burned-in line. */
  captions: [
    { t0: 0.5, t1: 2.5, text: "Here's our pricing page" },
    { t0: 3.0, t1: 4.9, text: "switch billing to lifetime" },
    { t0: 5.1, t1: 7.0, text: "and you're in. Done." },
  ],
};

/** A shot's span on the timeline, ramps included. */
export const shotSpan = (s) => [s.in, s.out + RAMP_OUT];

export const clock = (t) => {
  const s = Math.max(0, Math.floor(t));
  return `0:${String(s).padStart(2, "0")}`;
};

/* ────────────────────────────────────────────────────────────────────────────
   The clock
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Calls frame(t) every animation frame while `ref` is on screen, looping over
 * `duration`. Returns { playing, toggle } for a play button.
 */
export function useFilm(ref, duration, frame, { poster = 0 } = {}) {
  const [playing, setPlaying] = useState(true);
  const state = useRef({ t: 0, last: 0, raf: 0, visible: false, playing: true, start: null });
  const frameRef = useRef(frame);
  frameRef.current = frame;

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const s = state.current;

    if (reducedMotion()) {
      s.playing = false;
      setPlaying(false);
      frameRef.current(poster);
      return undefined;
    }

    const tick = (now) => {
      s.raf = 0;
      if (!s.visible || !s.playing || document.hidden) {
        s.last = 0;
        return;
      }
      // A frame late after a background tab is not a reason to jump ahead.
      if (s.last) s.t = (s.t + Math.min(0.1, (now - s.last) / 1000)) % duration;
      s.last = now;
      frameRef.current(s.t);
      s.raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!s.raf && s.visible && s.playing && !document.hidden) {
        s.last = 0;
        s.raf = requestAnimationFrame(tick);
      }
    };
    s.start = start;

    const io = new IntersectionObserver(
      ([entry]) => {
        s.visible = entry.isIntersecting;
        start();
      },
      { rootMargin: "80px" }
    );
    io.observe(el);
    document.addEventListener("visibilitychange", start);
    frameRef.current(s.t);

    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", start);
      if (s.raf) cancelAnimationFrame(s.raf);
      s.raf = 0;
    };
  }, [ref, duration, poster]);

  const toggle = useCallback(() => {
    const s = state.current;
    s.playing = !s.playing;
    setPlaying(s.playing);
    if (s.playing) s.start?.();
  }, []);

  return { playing, toggle };
}

/**
 * True once `ref` has come on screen, false again when it leaves. Drives the
 * CSS-only demonstrations, which pause themselves while this is false.
 */
export function useInView(ref, { once = false } = {}) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        setOn(entry.isIntersecting);
        if (once && entry.isIntersecting) io.disconnect();
      },
      { rootMargin: "0px 0px -10% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once]);
  return on;
}

/* ────────────────────────────────────────────────────────────────────────────
   One screen of the recording, played at a time t
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Binds a rendered <DemoScreen> to the script. Returns { apply(t), destroy() }.
 * `variant` "raw" is the recording as a browser hands it over: no camera, a
 * small cursor with the tremor of a real hand, no ripples. "clipo" is the edit.
 */
export function mountScene(root, variant = "clipo") {
  const cam = root.querySelector("[data-cam]");
  const view = root.querySelector("[data-view]");
  const cursor = root.querySelector("[data-cursor]");
  const screen = root.querySelector("[data-screen]");
  const caption = root.querySelector("[data-caption]");
  const ripples = SCRIPT.presses.map((_, i) => root.querySelector(`[data-ripple="${i}"]`));
  const hoverables = [...root.querySelectorAll("[data-hoverable]")];
  const clipo = variant !== "raw";
  const H = 62.5; // the screen is 16:10, so its height is 62.5% of its width (cqw)

  let targets = {};
  let lastT = 0;
  let lastCaption = null;

  const measure = () => {
    if (!cam) return;
    const prev = cam.style.transform;
    cam.style.transform = "none";
    const box = cam.getBoundingClientRect();
    if (box.width > 0) {
      const next = {};
      cam.querySelectorAll("[data-target]").forEach((el) => {
        const r = el.getBoundingClientRect();
        next[el.dataset.target] = {
          x: (r.left + r.width / 2 - box.left) / box.width,
          y: (r.top + r.height / 2 - box.top) / box.height,
          w: r.width / box.width,
          h: r.height / box.height,
        };
      });
      targets = next;
    }
    cam.style.transform = prev;
  };

  const pt = (w) => (w.to ? targets[w.to] || { x: 0.5, y: 0.5 } : w);

  /** Between two points a hand moves in a shallow arc, not a ruler line. */
  const along = (list, t, eased) => {
    if (t <= list[0].t) return pt(list[0]);
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      if (t < b.t) {
        const A = pt(a);
        const B = pt(b);
        if (A.x === B.x && A.y === B.y) return A;
        const k = eased ? smooth((t - a.t) / (b.t - a.t)) : (t - a.t) / (b.t - a.t);
        const bow = Math.sin(Math.PI * k) * 0.1;
        return { x: lerp(A.x, B.x, k) - (B.y - A.y) * bow, y: lerp(A.y, B.y, k) + (B.x - A.x) * bow };
      }
    }
    return pt(list[list.length - 1]);
  };

  const pointerAt = (t) => {
    const p = along(SCRIPT.path, t, clipo);
    if (clipo) return p;
    // The raw recording: a real hand's tremor, which the edit smooths away.
    return {
      x: p.x + (Math.sin(t * 41) + Math.sin(t * 17.3 + 1)) * 0.0022,
      y: p.y + (Math.sin(t * 37 + 2) + Math.sin(t * 13.1)) * 0.0026,
    };
  };

  const cameraAt = (t) => {
    let w = 1;
    let cx = 0.5;
    let cy = 0.5;
    if (clipo) {
      for (const shot of SCRIPT.shots) {
        const k = smooth(clamp01((t - shot.in) / RAMP_IN)) * (1 - smooth(clamp01((t - shot.out) / RAMP_OUT)));
        if (k <= 0) continue;
        const f = along(shot.focus, t, true);
        w = lerp(1, 1 / shot.s, k);
        cx = lerp(0.5, f.x, k);
        cy = lerp(0.5, f.y, k);
      }
    }
    const half = w / 2;
    cx = Math.min(1 - half, Math.max(half, cx));
    cy = Math.min(1 - half, Math.max(half, cy));
    return { s: 1 / w, cx, cy };
  };

  const stateAt = (t) => {
    const st = { ...SCRIPT.initial };
    for (const e of SCRIPT.events) if (t >= e.t) Object.assign(st, e, { t: undefined });
    delete st.t;
    return st;
  };

  const apply = (t) => {
    lastT = t;
    const D = SCRIPT.duration;
    const { s, cx, cy } = cameraAt(t);
    if (cam) cam.style.transform = `translate(${(0.5 - s * cx) * 100}%, ${(0.5 - s * cy) * 100}%) scale(${s})`;

    const p = pointerAt(t);
    const X = s * (p.x - cx) + 0.5;
    const Y = s * (p.y - cy) + 0.5;

    let pressing = 0;
    SCRIPT.presses.forEach((press, i) => {
      const u = (t - press.t) / 0.6;
      if (u >= 0 && u < 0.18) pressing = 1 - u / 0.18;
      const el = ripples[i];
      if (!el) return;
      if (u < 0 || u >= 1) {
        if (el.style.opacity !== "0") el.style.opacity = "0";
        return;
      }
      const q = pt(press);
      const rx = s * (q.x - cx) + 0.5;
      const ry = s * (q.y - cy) + 0.5;
      el.style.opacity = String(1 - u);
      el.style.transform = `translate(${rx * 100}cqw, ${ry * H}cqw) translate(-50%, -50%) scale(${(0.35 + 1.25 * smooth(u)) * (1 + 0.25 * (s - 1))})`;
    });

    if (cursor) {
      const size = (clipo ? 1 + 0.3 * (s - 1) : 1) * (1 - 0.14 * pressing);
      cursor.style.transform = `translate(${X * 100}cqw, ${Y * H}cqw) scale(${size})`;
    }

    if (screen) {
      const st = stateAt(t);
      for (const [k, v] of Object.entries(st)) if (screen.dataset[k] !== v) screen.dataset[k] = v;
    }

    for (const el of hoverables) {
      const r = targets[el.dataset.target];
      const over = r && Math.abs(p.x - r.x) < r.w / 2 + 0.004 && Math.abs(p.y - r.y) < r.h / 2 + 0.006;
      const v = over ? "true" : "false";
      if (el.dataset.hover !== v) el.dataset.hover = v;
    }

    if (caption) {
      const line = SCRIPT.captions.find((c) => t >= c.t0 && t < c.t1);
      const text = line ? line.text : "";
      if (text !== lastCaption) {
        lastCaption = text;
        caption.textContent = text;
        caption.dataset.on = text ? "true" : "false";
      }
    }

    // The loop is a cut back to the start, softened: out over the last third
    // of a second, in over the first quarter.
    if (view) view.style.opacity = String(t < 0.25 ? t / 0.25 : t > D - 0.35 ? Math.max(0, (D - t) / 0.35) : 1);
  };

  measure();
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { measure(); apply(lastT); }) : null;
  ro?.observe(root);
  // Webfonts change the width of every word, and so where every target sits.
  document.fonts?.ready?.then(() => { measure(); apply(lastT); }).catch(() => {});

  return { apply, destroy: () => ro?.disconnect() };
}
