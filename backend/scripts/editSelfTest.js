/**
 * editSelfTest.js: prove this server can cut a video, before a creator finds out it cannot.
 *
 *   node scripts/editSelfTest.js          run, clean up on success
 *   node scripts/editSelfTest.js --keep   keep the output video and frames to look at
 *
 * No database, no model, no bucket. It builds a recording whose "speech" is tone
 * bursts separated by silence, in the pattern a real take has: line 1, line 2,
 * an abandoned start, line 2 again, line 3, an ad-lib, line 4. Then it runs the
 * real pipeline over it: pause detection, the matching (with transcripts written
 * here in place of the model's), the first edit, and a full export with Telugu
 * captions, a B-roll image, a text overlay and music.
 *
 * What it catches, in the order it has gone wrong elsewhere: an ffmpeg build
 * without libass or HarfBuzz, missing caption fonts, a silence threshold that
 * finds one island or fifty, a retake picked over the keeper, and an export
 * whose length drifts from the edit's.
 */
import os from "os";
import path from "path";
import fsp from "fs/promises";
import { ffmpeg, probe, detectSpeech, extractSpeechAudio, FFMPEG_PATH, runProcess } from "../services/media/ffmpeg.js";
import { alignRecording } from "../services/edit/align.js";
import { buildInitialTimeline, layout, sanitizeTimeline } from "../services/edit/timeline.js";
import { renderTimeline, FONTS_DIR } from "../services/edit/render.js";

const keep = process.argv.includes("--keep");
const dir = path.join(os.tmpdir(), `lipi-edit-selftest-${Date.now()}`);
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${label}`);
  if (!ok) failures++;
};

const TOTAL = 17.6;
const BURSTS = [
  { start: 0.6, end: 2.4, roman: "Flipkart Big Billion Days Sale 2026 dates leak aipoyaayi", text: "Flipkart Big Billion Days Sale 2026 డేట్స్ లీక్ అయిపోయాయి" },
  { start: 3.2, end: 5.0, roman: "Prathi samvatsaram vache biggest sale October 9 nunchi start", text: "ప్రతి సంవత్సరం వచ్చే biggest sale October 9 నుంచి start" },
  { start: 5.7, end: 6.3, roman: "Prathi samvat", text: "ప్రతి సంవత్" },
  { start: 7.2, end: 9.1, roman: "Prathi samvathsaram vacche biggest sale October 9 nunchi start", text: "ప్రతి సంవత్సరం వచ్చే biggest sale October 9 నుంచి start" },
  { start: 9.9, end: 12.0, roman: "Axis Bank and ICICI Bank cards meeda 10 percent instant discount", text: "Axis Bank and ICICI Bank cards మీద 10 percent instant discount" },
  { start: 12.8, end: 13.8, roman: "sorry one second", text: "sorry one second" },
  { start: 14.6, end: 16.8, roman: "Marinni videos kosam subscribe chesukondi", text: "మరిన్ని videos కోసం subscribe చేసుకోండి" },
];
const LINES = [
  { n: 1, text: "Flipkart Big Billion Days Sale 2026 డేట్స్ లీక్ అయిపోయాయి.", roman: "Flipkart Big Billion Days Sale 2026 dates leak aipoyaayi." },
  { n: 2, text: "ప్రతి సంవత్సరం వచ్చే biggest sale October 9 నుంచి start.", roman: "Prathi samvathsaram vacche biggest sale October 9 nunchi start." },
  { n: 3, text: "Axis Bank and ICICI Bank cards మీద 10% instant discount.", roman: "Axis Bank and ICICI Bank cards meedha 10% instant discount." },
  { n: 4, text: "మరిన్ని videos కోసం subscribe చేసుకోండి.", roman: "Marinnee videos kosam subscribe chesukondi." },
];

async function main() {
  await fsp.mkdir(path.join(dir, "render"), { recursive: true });
  console.log(`ffmpeg: ${FFMPEG_PATH}`);
  console.log(`work:   ${dir}\n`);

  // ── The build ─────────────────────────────────────────────────────────────
  const { stdout: conf } = await runProcess(FFMPEG_PATH, ["-hide_banner", "-buildconf"], { keepStdout: 200000 }).catch(() => ({ stdout: "" }));
  check(/enable-libass/.test(conf), "ffmpeg has libass (captions)");
  check(/enable-libharfbuzz/.test(conf) || /enable-libass/.test(conf), "ffmpeg can shape Indic text (libass/HarfBuzz)");
  for (const f of ["NotoSans-Bold.ttf", "NotoSansTelugu-Bold.ttf", "NotoSansDevanagari-Bold.ttf"]) {
    check(await fsp.stat(path.join(FONTS_DIR, f)).then(() => true, () => false), `font ${f}`);
  }

  // ── A recording, an image, some music ─────────────────────────────────────
  const rec = path.join(dir, "recording.mp4");
  const gate = BURSTS.map((b) => `between(t,${b.start},${b.end})`).join("+");
  await ffmpeg([
    "-f", "lavfi", "-i", `testsrc2=size=540x960:rate=30:duration=${TOTAL}`,
    "-f", "lavfi", "-i", `aevalsrc='0.45*sin(2*PI*220*t)*(0.6+0.4*sin(2*PI*3*t))*(${gate})':s=48000:d=${TOTAL}`,
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", rec,
  ]);
  const img = path.join(dir, "broll.png");
  await ffmpeg(["-f", "lavfi", "-i", "testsrc=size=1280x720:rate=1", "-frames:v", "1", img]);
  const music = path.join(dir, "music.mp3");
  await ffmpeg(["-f", "lavfi", "-i", "sine=frequency=330:duration=20", "-c:a", "libmp3lame", "-b:a", "96k", music]);

  const info = await probe(rec);
  check(Math.abs(info.duration - TOTAL) < 0.2 && info.has_audio && info.width === 540 && info.height === 960, `probe: ${info.width}x${info.height}, ${info.duration.toFixed(2)}s, audio ${info.has_audio}`);

  // ── Where the speech is ───────────────────────────────────────────────────
  const speech = path.join(dir, "speech.mp3");
  await extractSpeechAudio(rec, speech, { duration: info.duration });
  const { islands, noise } = await detectSpeech(speech, { duration: info.duration });
  check(islands.length === BURSTS.length, `pause detection found ${islands.length} stretches of speech (expected ${BURSTS.length}, threshold ${noise.toFixed(1)} dB)`);
  const edgesOk = islands.length === BURSTS.length && islands.every((isl, i) => Math.abs(isl.start - BURSTS[i].start) < 0.15 && Math.abs(isl.end - BURSTS[i].end) < 0.15);
  check(edgesOk, "every stretch starts and ends within 0.15 s of the real speech");
  if (islands.length !== BURSTS.length) throw new Error("cannot continue without the expected stretches");

  // ── Which line is which ───────────────────────────────────────────────────
  const pieces = islands.map((isl, i) => ({ media: "rec1", media_duration: info.duration, ...isl, text: BURSTS[i].text, roman: BURSTS[i].roman }));
  const alignment = alignRecording({ lines: LINES, pieces });
  check(alignment.stats.matched === 4, `matched ${alignment.stats.matched} of 4 lines`);
  const line2 = alignment.clips[1];
  const chosen2 = line2.takes[line2.chosen];
  check(line2.takes.length >= 2 && chosen2 && chosen2.in > 6.5, `line 2 uses the retake at ${chosen2?.in}s, with ${line2.takes.length} takes kept`);
  check(alignment.unused.some((u) => /sorry/.test(u.said_roman)), "the ad-lib is set aside, not forced into a line");
  check(alignment.clips.every((c, i) => i === 0 || c.takes[c.chosen].in >= alignment.clips[i - 1].takes[alignment.clips[i - 1].chosen].out - 0.001), "clips run forwards through the recording without overlapping");

  // ── The first edit, then a creator's changes ──────────────────────────────
  const tl = buildInitialTimeline({
    alignment,
    shots: [
      { n: 1, line: 1, what: "Creator on camera introducing the sale", source: "A-roll camera feed" },
      { n: 2, line: 3, what: "Leaked bank offer screenshot", source: "Tech news site" },
    ],
    aspect: "9:16",
    hasRoman: true,
  });
  check(tl.broll.length === 1 && tl.broll[0].clip === tl.clips[2].id, "one B-roll slot, on line 3 (the on-camera shot needs none)");

  tl.broll[0].media = "img1";
  tl.captions.mode = "native";
  tl.texts.push({ id: "tx1", text: "Sale starts Oct 9", start: 0.3, duration: 2.2, position: "top", size: "m" });
  tl.audio.push({ id: "au1", media: "mus1", start: 0, in: 0, duration: 30, volume: 0.12, fade_in: 0.5, fade_out: 1 });

  const mediaById = new Map([
    ["rec1", { id: "rec1", type: "video", duration: info.duration, has_audio: true, width: 540, height: 960 }],
    ["img1", { id: "img1", type: "image", duration: 0 }],
    ["mus1", { id: "mus1", type: "audio", duration: 20, has_audio: true }],
  ]);
  const clean = sanitizeTimeline(tl, mediaById);
  const lay = layout(clean);
  check(clean.audio.length === 1 && clean.audio[0].duration <= 20, "sanitize clamps the music to the length of the file");

  // ── Export ────────────────────────────────────────────────────────────────
  const paths = { rec1: rec, img1: img, mus1: music };
  const started = Date.now();
  let lastStage = "";
  const out = await renderTimeline({
    timeline: clean,
    mediaById,
    pathOf: async (id) => paths[id],
    workDir: path.join(dir, "render"),
    onProgress: (p, stage) => {
      if (stage !== lastStage) {
        lastStage = stage;
        console.log(`        ${Math.round(p * 100)}% ${stage}`);
      }
    },
  });
  const outInfo = await probe(out.output);
  check(outInfo.width === 1080 && outInfo.height === 1920, `export is ${outInfo.width}x${outInfo.height}`);
  check(Math.abs(outInfo.duration - lay.duration) < 0.25, `export runs ${outInfo.duration.toFixed(2)}s against an edit of ${lay.duration.toFixed(2)}s`);
  check(outInfo.has_audio, "export has sound");
  console.log(`        rendered in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  const brollAt = (lay.broll[0].start + lay.broll[0].end) / 2;
  const captionAt = (lay.clips[0].start + lay.clips[0].end) / 2;
  const finalVideo = path.join(dir, "export.mp4");
  await fsp.copyFile(out.output, finalVideo);
  await ffmpeg(["-ss", String(brollAt), "-i", finalVideo, "-frames:v", "1", "-vf", "scale=540:-2", path.join(dir, "frame_broll.png")]);
  await ffmpeg(["-ss", String(captionAt), "-i", finalVideo, "-frames:v", "1", "-vf", "scale=540:-2", path.join(dir, "frame_caption.png")]);
  console.log(`\n  frames: ${path.join(dir, "frame_caption.png")}`);
  console.log(`          ${path.join(dir, "frame_broll.png")}`);
}

main()
  .catch((err) => {
    failures++;
    console.error("\n  FAIL ", err.message);
  })
  .finally(async () => {
    console.log(failures ? `\n${failures} check(s) failed. Files kept in ${dir}` : "\nAll checks passed.");
    if (!failures && !keep) await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
    process.exit(failures ? 1 : 0);
  });
