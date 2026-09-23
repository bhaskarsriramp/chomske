/**
 * The cursor that was picked by the video playing beside it.
 *
 *     node scripts/pointerTest/video.mjs
 *
 * ── THE BUG THIS REPRODUCES ──────────────────────────────────────────────────
 * A creator recorded a landing page with an embedded YouTube player on it and
 * clicked two items in the navigation bar. Neither produced a camera move. The
 * production log, read end to end, is one causal chain:
 *
 *   456 of 840 screen cells look like moving pictures … the content-cursor
 *   check is skipped for this recording
 *   pointer calibration: dark:21 … mean 0.842  |  light:17 … mean 0.798
 *   pointer located by shape in 398 of 1040 frames (dark pointer, 22px)
 *
 * The creator is on Windows, whose arrow is light. Their other recordings on
 * the same machine calibrate to light 18px and find the pointer in 88% of
 * frames; this one chose DARK and found it in 38%.
 *
 * It chose dark because it was allowed to look inside the video. playingRegions
 * exists to stop that, and it stands down when more of the screen animates than
 * could plausibly be a video on a page — correctly, for its other job, which is
 * rejecting sightings. For calibration, standing down means the video picks the
 * cursor. See sync.js playingRegions `cap` and locate.js calibrate `moving`.
 *
 * And a wrong template is not a degraded one, it is a different recording: the
 * pointer went missing during the fast moves to the navigation bar, so both
 * presses were written down at the position where it was last seen — two
 * thirds of a screen away, with nothing under it.
 *
 * ── AND THE SAME FAULT, ONE STEP LATER ───────────────────────────────────────
 * Getting the template right is not the end of it. A screen recording of
 * Windows contains a Windows cursor, so the decoy inside the player is the SAME
 * drawing as the creator's and the one template fits both. While the creator's
 * pointer is off the surface, the loop falls through to the hints — which on
 * this page nearly all point into the player — and picks up the stranger's.
 *
 * The presses are still refused correctly, because mediaUnder() reads the
 * region from the model and vetoes a press inside somebody else's screen. But
 * the DRAWN pointer comes from this track, so the stylised cursor was painted
 * onto the video's own:
 *
 *   "our code has already identified … that is not the user's mouse movement or
 *    cursor, but somehow it is applying our own mouse … on that interaction of
 *    that video … of course zoom is not happening"
 *
 * Measured on this clip against the code before the fix: 31 track points of 159
 * sat on the decoy, and the run reported finding the pointer in 99% of frames —
 * a confident wrong answer, which is the worst kind.
 *
 * ── WHAT IS ASSERTED ─────────────────────────────────────────────────────────
 *   the video is measured         most of the screen animates, past the valve
 *   the decoy is not a candidate  no dark template reaches the ranking
 *   the light cursor wins         which is the one actually drawn
 *   it is found                   often enough for a press to land on a control
 *   every sighting is the creator's, not the one in the video
 *   and it is still followed straight ACROSS the player, because a route over a
 *   video is an ordinary route and erasing the pointer there would be worse
 *   than the bug
 *
 * ── AND WHAT THIS HONESTLY DOES NOT SHOW ─────────────────────────────────────
 * It does not reproduce the calibration LOSS. The cursor drawn here is crisper
 * than one that has been through a display scale and a video encoder, so light
 * scores 0.868 against the dark candidate's 0.840 and the right answer wins on
 * this clip either way. What is asserted there is narrower: that the dark
 * candidate is not in the running at all.
 *
 *   without the veto   light:23 0.868  |  dark:29 0.840  |  light:21 0.777
 *   with it            light:23 0.867  |  light:21 0.778  |  light:25 0.768
 *
 * In production those two came out the other way round — dark 0.842 against
 * light 0.798 — and there the second row is the whole recording.
 */
import path from "path";
import os from "os";
import fs from "fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { ffmpegFromFrames } from "../../services/media/ffmpeg.js";
import { locatePointer } from "../../services/studio/locate.js";
import { readScreen, playingRegions } from "../../services/studio/sync.js";

const S = path.join(os.tmpdir(), "lipi-pointer-test");
fs.mkdirSync(S, { recursive: true });

const W = 1920;
const H = 1020;
const FPS = 20;
const D = 8;

let pass = true;
const ok = (name, cond, detail = "") => {
  console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "  " + detail : ""));
  if (!cond) pass = false;
  return cond;
};

/**
 * The player: a large dark rectangle whose contents change every frame. Sized
 * like the real one — a bit over half the frame — so the valve in
 * playingRegions trips exactly as it did in production.
 */
const VID = { x: 300, y: 150, w: 1280, h: 700 };

/**
 * Where the creator's own pointer is. It stays on the page, then goes up to
 * the navigation bar — the move that went missing in production.
 */
function truth(t) {
  if (t < 1) return { x: 240, y: 960, shape: "default" };
  /**
   * ── AND THEN IT IS GONE ──────────────────────────────────────────────────
   * Off the edge of the shared surface for a second and a half. This is the
   * state the bug lives in and it is not an unusual one: on the recording this
   * test comes from the locator had no sighting in 62% of frames. While the
   * pointer is missing, step 1 of the tracking loop has nothing to follow, and
   * the loop falls through to the hints — which on this page nearly all point
   * into the player. That is where somebody else's cursor gets picked up.
   */
  if (t < 2.6) return null;
  if (t < 4) {
    const k = (t - 2.6) / 1.4;
    return { x: 240 + k * 120, y: 960 - k * 40, shape: "default" };
  }
  if (t < 5) return { x: 360, y: 920, shape: "default" };
  if (t < 6) {
    const k = t - 5;                             // the fast move up to the nav bar
    return { x: 360 + k * 440, y: 920 - k * 880, shape: "default" };
  }
  return { x: 800, y: 40, shape: "pointer" };    // on the nav item
}

/**
 * And the OTHER pointer: the one inside the video.
 *
 * This is the whole reason playingRegions exists — "a pointer found inside one
 * of those was recorded on somebody else's machine" — and it is not a contrived
 * case here. The page being recorded is a screen-recorder's landing page, and
 * the thing playing on it is a screen recording, with a cursor in it.
 *
 * ── AND IT IS THE SAME DESIGN AS THE CREATOR'S ──────────────────────────────
 * The first version of this drew the decoy dark, and nothing ever confused the
 * two: the template calibrates to light, a light template does not match a dark
 * arrow, and the test passed with every guard switched off. That was the test
 * being wrong, not the code being right.
 *
 * A screen recording of Windows contains a Windows cursor. It is the SAME
 * drawing as the creator's, a little larger because a full screen is being
 * shown inside a player — so the one template fits both, perfectly, and the
 * only thing that separates them is where they are.
 */
function decoy(t) {
  const k = (t % 4) / 4;
  return { x: VID.x + 160 + k * 900, y: VID.y + 120 + Math.sin(t * 1.6) * 220 + 200 };
}

async function clip() {
  const out = path.join(S, "video_page.mp4");
  const arrow = await loadImage(path.join(S, "cur_light_arrow.png")).catch(() => null);
  const darkArrow = await loadImage(path.join(S, "cur_decoy_arrow.png")).catch(() => null);
  const c = createCanvas(W, H);
  const g = c.getContext("2d");

  await ffmpegFromFrames(["-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", out], {
    width: W, height: H, fps: FPS, pixelFormat: "rgba",
    write: async (push) => {
      for (let i = 0; i < D * FPS; i++) {
        const t = i / FPS;

        /* A light page with text on it, which is what a landing page is. */
        g.fillStyle = "#ffffff";
        g.fillRect(0, 0, W, H);
        g.fillStyle = "#f3f4f6";
        g.fillRect(0, 0, W, 90);                 // the nav bar
        g.fillStyle = "#111827";
        g.font = "26px sans-serif";
        for (const [x, label] of [[520, "Features"], [700, "Pricing"], [880, "FAQ"], [1040, "Editor"]]) {
          g.fillText(label, x, 52);
        }
        g.fillStyle = "#374151";
        g.font = "20px sans-serif";
        for (let r = 0; r < 6; r++) g.fillText("Record beautiful screen recordings with automatic zoom", 300, 900 + r * 18 - 80);

        /**
         * The player. Dark, and different every frame — which is what makes a
         * cell "busy", and what a dark cursor template is drawn to match.
         */
        g.fillStyle = "#0b0b0d";
        g.fillRect(VID.x, VID.y, VID.w, VID.h);
        for (let k = 0; k < 220; k++) {
          const s = Math.sin(i * 0.7 + k * 2.3);
          const u = Math.cos(i * 0.5 + k * 1.7);
          g.fillStyle = "rgba(" + Math.round(120 + 100 * s) + "," + Math.round(110 + 90 * u) + "," + Math.round(130 + 80 * s * u) + ",0.95)";
          g.fillRect(
            VID.x + ((k * 137 + i * 23) % (VID.w - 60)),
            VID.y + ((k * 211 + i * 31) % (VID.h - 60)),
            40 + 20 * Math.abs(s), 30 + 20 * Math.abs(u)
          );
        }

        /* Somebody else's cursor, inside the recording that is playing. */
        const d = decoy(t);
        if (darkArrow) g.drawImage(darkArrow, d.x, d.y);

        const p = truth(t);
        if (p && arrow) g.drawImage(arrow, p.x - 2, p.y - 2);
        await push(Buffer.from(g.getImageData(0, 0, W, H).data.buffer));
      }
    },
  });
  return out;
}

/**
 * Two arrows: the creator's, which is a Windows one (light body, dark rim), and
 * the one inside the video, which is the opposite. `scale` matters — the decoy
 * in a full-screen recording shown in a player is drawn a little larger than
 * the real cursor over it, which is part of why it wins on score.
 */
function drawArrow(file, { dark = false, px = 32, scale = 1 } = {}) {
  const c = createCanvas(Math.ceil(px * scale), Math.ceil(px * scale));
  const g = c.getContext("2d");
  g.scale(scale, scale);
  const pts = [[0, 0], [0, 22], [5, 17], [9, 26], [13, 24], [9, 16], [16, 16]];
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
  g.closePath();
  g.fillStyle = dark ? "#0a0a0a" : "#ffffff";
  g.fill();
  g.lineWidth = 1.4;
  g.strokeStyle = dark ? "#ffffff" : "#000000";
  g.stroke();
  fs.writeFileSync(path.join(S, file), c.toBuffer("image/png"));
}

console.log("\n" + "=".repeat(84));
console.log("  A light Windows cursor on a page that is mostly a dark playing video");
console.log("=".repeat(84) + "\n");

drawArrow("cur_light_arrow.png", { dark: false, scale: 1 });
drawArrow("cur_decoy_arrow.png", { dark: false, scale: 1.35 });
const file = await clip();
const screen = await readScreen(file, { width: W, height: H, duration: D, fps: 12 });

/* What the measurement says, and whether the valve trips as it did in production. */
const capped = playingRegions(screen, { duration: D });
const uncapped = playingRegions(screen, { duration: D, cap: 1 });
const cells = (screen.grid?.w || 0) * (screen.grid?.h || 0);

console.log("    screen cells        " + cells);
console.log("    moving, uncapped    " + uncapped.size + "  (" + (100 * uncapped.size / Math.max(1, cells)).toFixed(0) + "% of the frame)");
console.log("    reported normally   " + capped.size + (capped.size ? "" : "   << the valve tripped, as in production"));

/**
 * The calibration ranking, off the log. It is there deliberately — "calibration
 * is the one decision in this file that everything else rests on … reading the
 * top few is how a recording that came out wrong gets diagnosed" — and it is
 * the only place the rejected candidates are visible.
 */
let ranking = "";
const realLog = console.log;
console.log = (...a) => {
  const line = a.join(" ");
  if (line.startsWith("[studio] pointer calibration:")) ranking = line;
  realLog(...a);
};
/**
 * What the browser's frame-difference tracker would have reported. This is the
 * part that matters: it sees the PLAYER changing on every frame, so most of
 * what it offers is a place inside the video. That is not a flaw in it — it is
 * a motion detector and the video is motion — but it is why a hint cannot be
 * trusted as evidence that the pointer is somewhere. See locate.js hintAt.
 */
const hints = [];
for (let i = 0; i < D * FPS; i++) {
  const t = i / FPS;
  const p = truth(t);
  const prev = truth(Math.max(0, t - 1 / FPS));
  const d = decoy(t);
  // The video repaints every frame, so the tracker always has something there.
  hints.push({ t, x: (d.x + 16) / W, y: (d.y + 16) / H });
  // And the creator's own pointer, but only while it exists and is moving.
  if (p && prev && Math.hypot(p.x - prev.x, p.y - prev.y) > 2) {
    hints.push({ t, x: (p.x + (Math.random() * 10 - 5)) / W, y: (p.y + (Math.random() * 10 - 5)) / H });
  }
}

const r = await locatePointer(file, {
  sourceWidth: W, sourceHeight: H, duration: D, fps: FPS, screen, cursorPx: 22, hints,
});
console.log = realLog;
const hit = r.frames ? r.found / r.frames : 0;

console.log("    calibrated to       " + r.design + " " + r.heightPx + "px");
console.log("    pointer found       " + (100 * hit).toFixed(0) + "%  (" + r.found + " of " + r.frames + " frames)");

/* Was it there for the press on the nav bar, which is the whole point. */
const onNav = r.track.filter((p) => p.t >= 6.0 && p.t <= 7.9);
const nearNav = onNav.filter((p) => p.y * H < 120).length;
console.log("    on the nav bar      " + nearNav + " of " + onNav.length + " sightings in the last two seconds");

/**
 * ── AND THE TRACK IS WHAT GETS DRAWN ─────────────────────────────────────────
 * Refusing to ZOOM inside somebody else's screen is only half of it. The
 * stylised cursor in the finished video is drawn from this track, so a sighting
 * that lands on the video's own cursor puts two pointers on screen — ours,
 * moving with a stranger's hand. Reported from a real export:
 *
 *   "our code has already identified … that is not the user's mouse movement
 *    or cursor, but somehow it is applying our own mouse … on that interaction
 *    of that video"
 *
 * ── AND "INSIDE THE PLAYER" IS THE WRONG QUESTION ────────────────────────────
 * The first version of this asserted that no track point lands inside the video
 * rectangle, and it failed on correct behaviour: the creator's route up to the
 * navigation bar crosses the player, and those sightings are real and SHOULD be
 * drawn. Refusing them would erase the pointer every time it passed over a
 * video, which is worse than the bug.
 *
 * The honest question is which cursor each sighting is ON. Both are known here,
 * so every point is measured against both.
 */
const wrongOne = r.track.filter((p) => {
  const x = p.x * W;
  const y = p.y * H;
  const mine = truth(p.t);
  const theirs = decoy(p.t);
  const toTheirs = Math.hypot(x - (theirs.x + 16), y - (theirs.y + 16));
  // While the creator's pointer is off the surface there is nothing of theirs
  // to be nearer to, so anything sitting on the decoy is the decoy.
  if (!mine) return toTheirs < 70;
  return toTheirs < Math.hypot(x - mine.x, y - mine.y);
});
const crossing = r.track.filter((p) => {
  const x = p.x * W;
  const y = p.y * H;
  return x >= VID.x && x <= VID.x + VID.w && y >= VID.y && y <= VID.y + VID.h;
});
console.log("    over the player     " + crossing.length + " of " + r.track.length + " track points (the route to the nav bar crosses it)");
console.log("    on THEIR cursor     " + wrongOne.length + " of " + r.track.length +
  (wrongOne.length ? "   << would be drawn on somebody else's cursor" : "") + "\n");

ok(
  "the page really is mostly moving picture",
  uncapped.size > cells * 0.35,
  uncapped.size + " of " + cells + " cells"
);
ok(
  "so the ordinary measurement stands down",
  capped.size === 0,
  "which is what left calibration unguarded"
);
/**
 * The one that would have failed before the fix. dark:29 is the decoy inside
 * the player, and with no veto it ranked SECOND on this clip at 0.840.
 */
ok(
  "the cursor inside the video is not even a candidate",
  !!ranking && !/dark:/.test(ranking),
  ranking.replace("[studio] pointer calibration: ", "").slice(0, 96)
);
ok(
  "the cursor actually drawn is the one chosen",
  r.design === "light",
  "chose " + r.design + " " + r.heightPx + "px"
);
ok(
  "and it is found often enough to put a press on a control",
  hit >= 0.6,
  (100 * hit).toFixed(0) + "% of frames"
);
ok(
  "every sighting is the creator's cursor, not the one in the video",
  wrongOne.length === 0,
  wrongOne.length + " of " + r.track.length + " track points sat on the decoy"
);
ok(
  "and it is still followed straight across the player",
  crossing.length > 0,
  crossing.length + " sightings over the video, which is the honest route"
);
ok(
  "including while it sits on the navigation bar",
  nearNav >= onNav.length * 0.5 && nearNav > 0,
  nearNav + " sightings up there"
);

console.log(pass ? "\nall passed\n" : "\nFAILED\n");
process.exit(pass ? 0 : 1);
