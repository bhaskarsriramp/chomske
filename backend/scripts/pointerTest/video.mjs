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
 * ── WHAT IS ASSERTED ─────────────────────────────────────────────────────────
 *   the video is measured        most of the screen animates, past the valve
 *   the decoy is not a candidate  the dark cursor inside the video never
 *                                 reaches the ranking at all
 *   the light cursor wins         which is the one actually drawn
 *   and it is found               often enough for a press to land on a control
 *
 * ── AND WHAT IT HONESTLY DOES NOT SHOW ───────────────────────────────────────
 * It does not reproduce the LOSS. The cursor drawn here is crisper than one
 * that has been through a display scale and a video encoder, so it scores 0.868
 * and the decoy 0.840 — the right answer wins on this clip either way. What the
 * fix changes, and what is asserted, is that the decoy is not in the running:
 *
 *   without the veto   light:23 0.868  |  dark:29 0.840  |  light:21 0.777
 *   with it            light:23 0.867  |  light:21 0.778  |  light:25 0.768
 *
 * In production the same two candidates came out the other way round — dark
 * 0.842 against light 0.798 — and there the second row is the whole recording.
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
  if (t < 4) {
    const k = (t - 1) / 3;
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
 * the thing playing on it is a screen recording, with a cursor in it. It moves,
 * it is unmistakably the best match wherever it sits, and it is DARK.
 */
function decoy(t) {
  const k = (t % 4) / 4;
  return { x: VID.x + 160 + k * 900, y: VID.y + 120 + Math.sin(t * 1.6) * 220 + 200 };
}

async function clip() {
  const out = path.join(S, "video_page.mp4");
  const arrow = await loadImage(path.join(S, "cur_light_arrow.png")).catch(() => null);
  const darkArrow = await loadImage(path.join(S, "cur_dark_arrow.png")).catch(() => null);
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
drawArrow("cur_dark_arrow.png", { dark: true, scale: 1.35 });
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
const r = await locatePointer(file, {
  sourceWidth: W, sourceHeight: H, duration: D, fps: FPS, screen, cursorPx: 22,
});
console.log = realLog;
const hit = r.frames ? r.found / r.frames : 0;

console.log("    calibrated to       " + r.design + " " + r.heightPx + "px");
console.log("    pointer found       " + (100 * hit).toFixed(0) + "%  (" + r.found + " of " + r.frames + " frames)");

/* Was it there for the press on the nav bar, which is the whole point. */
const onNav = r.track.filter((p) => p.t >= 6.0 && p.t <= 7.9);
const nearNav = onNav.filter((p) => p.y * H < 120).length;
console.log("    on the nav bar      " + nearNav + " of " + onNav.length + " sightings in the last two seconds\n");

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
  "including while it sits on the navigation bar",
  nearNav >= onNav.length * 0.5 && nearNav > 0,
  nearNav + " sightings up there"
);

console.log(pass ? "\nall passed\n" : "\nFAILED\n");
process.exit(pass ? 0 : 1);
