/**
 * editSelfTest.js: prove this server can cut a video, before a creator finds out it cannot.
 *
 *   node scripts/editSelfTest.js          run, clean up on success
 *   node scripts/editSelfTest.js --keep   keep the output videos and frames to look at
 *
 * No database, no model, no bucket. It builds a recording whose "speech" is tone
 * bursts separated by silence, in the pattern a real take has: line 1, line 2,
 * an abandoned start, line 2 again, line 3, an ad-lib, line 4. Then it runs the
 * real pipeline over it: pause detection, the matching (with transcripts written
 * here in place of the model's), the first edit, and a full export with Telugu
 * captions, a B-roll image, a text overlay and music.
 *
 * A second export exercises what a creator does by hand: captions translated and
 * dragged off-centre, a split screen each way round, and a transparent graphic
 * laid over the picture.
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
import {
  buildInitialTimeline, buildFreeTimeline, mergeFreeTimeline, segmentsFromPieces, segmentsOf, layout,
  captionCues, sanitizeTimeline, cutAtSegments, buildSrt,
} from "../services/edit/timeline.js";
import { renderTimeline, FONTS_DIR } from "../services/edit/render.js";
import { cleanExportOptions } from "../services/edit/exportOptions.js";
import { hasEncoder } from "../services/media/ffmpeg.js";

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

const frame = (video, at, name) => ffmpeg(["-ss", String(at), "-i", video, "-frames:v", "1", "-vf", "scale=540:-2", path.join(dir, name)]);

async function main() {
  await fsp.mkdir(path.join(dir, "render"), { recursive: true });
  await fsp.mkdir(path.join(dir, "render2"), { recursive: true });
  await fsp.mkdir(path.join(dir, "render3"), { recursive: true });
  console.log(`ffmpeg: ${FFMPEG_PATH}`);
  console.log(`work:   ${dir}\n`);

  // ── The build ─────────────────────────────────────────────────────────────
  const { stdout: conf } = await runProcess(FFMPEG_PATH, ["-hide_banner", "-buildconf"], { keepStdout: 200000 }).catch(() => ({ stdout: "" }));
  check(/enable-libass/.test(conf), "ffmpeg has libass (captions)");
  check(/enable-libharfbuzz/.test(conf) || /enable-libass/.test(conf), "ffmpeg can shape Indic text (libass/HarfBuzz)");
  for (const f of ["NotoSans-Bold.ttf", "NotoSansTelugu-Bold.ttf", "NotoSansDevanagari-Bold.ttf"]) {
    check(await fsp.stat(path.join(FONTS_DIR, f)).then(() => true, () => false), `font ${f}`);
  }

  // ── A recording, an image, a transparent graphic, some music ──────────────
  const rec = path.join(dir, "recording.mp4");
  const gate = BURSTS.map((b) => `between(t,${b.start},${b.end})`).join("+");
  await ffmpeg([
    "-f", "lavfi", "-i", `testsrc2=size=540x960:rate=30:duration=${TOTAL}`,
    "-f", "lavfi", "-i", `aevalsrc='0.45*sin(2*PI*220*t)*(0.6+0.4*sin(2*PI*3*t))*(${gate})':s=48000:d=${TOTAL}`,
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", rec,
  ]);
  const img = path.join(dir, "broll.png");
  await ffmpeg(["-f", "lavfi", "-i", "testsrc=size=1280x720:rate=1", "-frames:v", "1", img]);
  const badge = path.join(dir, "badge.png");
  await ffmpeg([
    "-f", "lavfi", "-i", "color=c=black@0.0:s=600x300,format=rgba",
    "-vf", "drawbox=x=40:y=60:w=520:h=180:color=yellow@1:t=fill:replace=1,drawbox=x=0:y=0:w=600:h=20:color=red@1:t=fill:replace=1",
    "-frames:v", "1", badge,
  ]);
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
    pieces,
  });
  check(tl.broll.length === 1 && tl.broll[0].clip === tl.clips[2].id, "one B-roll slot, on line 3 (the on-camera shot needs none)");
  check(tl.segments.length === BURSTS.length, `every stretch of speech is a caption segment (${tl.segments.length})`);

  const derived = segmentsOf({ clips: tl.clips, unused: tl.unused });
  const derivedAgain = segmentsOf({ clips: tl.clips, unused: tl.unused });
  check(derived.length >= 5 && derived.every((s, i) => s.id === derivedAgain[i].id), `an older edit derives its caption segments with stable ids (${derived.length})`);

  const twoSentences = segmentsFromPieces([{ media: "rec1", start: 1, end: 5, text: "The sale starts on October 9. Bank offers come too.", roman: "The sale starts on October 9. Bank offers come too." }]);
  check(
    twoSentences.length === 2 && twoSentences[0].end === twoSentences[1].start && twoSentences[1].end === 5 && Math.abs(twoSentences[0].end - (1 + (4 * 29) / 50)) < 0.05 && twoSentences[1].text === "Bank offers come too.",
    `a stretch holding two sentences becomes two caption sections, timed by length (${twoSentences.map((s) => `${s.start}-${s.end}`).join(", ")})`
  );

  tl.broll[0].media = "img1";
  tl.captions.mode = "native";
  tl.texts.push({ id: "tx1", text: "Sale starts Oct 9", start: 0.3, duration: 2.2, position: "top", size: "m" });
  tl.audio.push({ id: "au1", media: "mus1", start: 0, in: 0, duration: 30, volume: 0.12, fade_in: 0.5, fade_out: 1 });

  const mediaById = new Map([
    ["rec1", { id: "rec1", type: "video", duration: info.duration, has_audio: true, width: 540, height: 960 }],
    ["img1", { id: "img1", type: "image", duration: 0, width: 1280, height: 720 }],
    ["badge", { id: "badge", type: "image", duration: 0, width: 600, height: 300 }],
    ["mus1", { id: "mus1", type: "audio", duration: 20, has_audio: true }],
  ]);
  const clean = sanitizeTimeline(tl, mediaById);
  const lay = layout(clean);
  check(clean.audio.length === 1 && clean.audio[0].duration <= 20, "sanitize clamps the music to the length of the file");
  check(clean.segments.length === BURSTS.length, "sanitize keeps the caption segments");

  const cues = captionCues(clean);
  const firstLine = lay.clips[0];
  check(cues.length > 8 && cues.every((c) => c.end > c.start) && cues[0].start >= firstLine.start - 0.001, `captions follow what was said (${cues.length} cues)`);

  const trimmed = JSON.parse(JSON.stringify(clean));
  trimmed.clips[0].in = Math.round((trimmed.clips[0].in + 0.9) * 1000) / 1000;
  const trimmedCues = captionCues(trimmed);
  check(!trimmedCues.some((c) => c.text.startsWith("Flipkart")) && trimmedCues.length < cues.length, "trimming the start of a line takes its first words' caption with it");

  // ── Export ────────────────────────────────────────────────────────────────
  const paths = { rec1: rec, img1: img, mus1: music, badge };
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

  const finalVideo = path.join(dir, "export.mp4");
  await fsp.copyFile(out.output, finalVideo);
  await frame(finalVideo, (lay.broll[0].start + lay.broll[0].end) / 2, "frame_broll.png");
  await frame(finalVideo, (lay.clips[0].start + lay.clips[0].end) / 2, "frame_caption.png");

  // ── By hand: translated captions dragged aside, splits, an overlay ────────
  const byHand = sanitizeTimeline({
    ...clean,
    captions: { ...clean.captions, mode: "tr", lang: "en", x: 0.3, y: 0.42, color: "#33E1FF" },
    segments: clean.segments.map((s, i) => ({ ...s, tr: { en: `EN ${s.roman}` }, ...(i === 0 ? { custom: { color: "#FFD400", size: "xl", style: "box", x: 0.5, y: 0.2 } } : {}) })),
    broll: [
      { id: "b1", clip: lay.clips[0].id, offset: 0, duration: 1.6, media: "img1", layout: "split", side: "top", fit: "cover", ratio: 0.5 },
      { id: "b2", clip: lay.clips[2].id, offset: 0.2, duration: 1.4, media: "badge", layout: "pip", x: 0.5, y: 0.72, w: 0.6 },
      { id: "b3", clip: lay.clips[3].id, offset: 0, duration: 1.2, media: "img1", layout: "split", side: "bottom", fit: "contain", ratio: 0.42 },
    ],
    texts: [{ id: "tx1", text: "Dragged", start: 0.2, duration: 8, position: "top", size: "m", x: 0.72, y: 0.08 }],
    audio: [],
  }, mediaById);
  check(byHand.captions.mode === "tr" && byHand.captions.lang === "en" && byHand.captions.x === 0.3, "sanitize keeps translated, dragged captions");
  check(byHand.broll.map((b) => b.layout).join() === "split,pip,split" && byHand.broll[1].w === 0.6, "sanitize keeps B-roll layouts");
  check(byHand.captions.color === "#33E1FF" && byHand.segments[0].custom?.size === "xl" && !byHand.segments[1].custom, "sanitize keeps the captions' colour and one section's own look");
  check(captionCues(byHand).every((c) => c.text.startsWith("EN") || !/^[A-Z]{2} /.test(c.text)) && captionCues(byHand)[0].text.startsWith("EN"), "translated captions show the translation");

  const layHand = layout(byHand);
  const out2 = await renderTimeline({ timeline: byHand, mediaById, pathOf: async (id) => paths[id], workDir: path.join(dir, "render2") });
  const out2Info = await probe(out2.output);
  check(Math.abs(out2Info.duration - layHand.duration) < 0.25, `hand-edited export runs ${out2Info.duration.toFixed(2)}s against ${layHand.duration.toFixed(2)}s`);

  // ── The export's own settings: 720p, 25 fps, a bitrate, H.265 where the build has it ──
  const hevc = await hasEncoder("libx265");
  const opts = cleanExportOptions({ resolution: 720, fps: 25, video_mbps: 3, audio_kbps: 128, codec: "hevc", loudness: true, srt: true }, { hevc });
  const out3 = await renderTimeline({ timeline: byHand, mediaById, pathOf: async (id) => paths[id], workDir: path.join(dir, "render3"), options: opts });
  const out3Info = await probe(out3.output);
  check(out3Info.width === 720 && out3Info.height === 1280 && Math.abs(out3Info.fps - 25) < 0.01 && out3Info.has_audio, `an export at 720p 25 fps${hevc ? " in H.265" : ""} is ${out3Info.width}x${out3Info.height} at ${out3Info.fps} fps`);
  check(out3.drew.captions > 0 && out3.drew.split === 2 && out3.drew.pip === 1 && out3.drew.texts === 1 && !!out3.srt, "and says what it drew, with an .srt beside it");
  const handVideo = path.join(dir, "export_by_hand.mp4");
  await fsp.copyFile(out2.output, handVideo);
  const mid = (b) => (b.start + b.end) / 2;
  await frame(handVideo, mid(layHand.broll[0]), "frame_split_top.png");
  await frame(handVideo, mid(layHand.broll[1]), "frame_overlay.png");
  await frame(handVideo, mid(layHand.broll[2]), "frame_split_bottom.png");

  // ── A video with no script ────────────────────────────────────────────────
  const free = buildFreeTimeline({ recordings: [{ id: "rec1", duration: info.duration }], segments: segmentsFromPieces(pieces), aspect: "9:16" });
  check(free.clips.length === 1 && Math.abs(layout(free).duration - info.duration) < 0.01, "a video on its own starts as one whole clip");
  check(captionCues(free).length > 12, `and is captioned from everything said in it (${captionCues(free).length} cues)`);
  const added = mergeFreeTimeline(free, { recordings: [{ id: "rec1", duration: info.duration }, { id: "rec2", duration: 5 }] });
  check(added.clips.length === 2 && added.clips[1].media === "rec2", "a second upload joins the end of the edit");
  const cutOut = mergeFreeTimeline({ ...added, clips: added.clips.slice(0, 1) }, { recordings: [{ id: "rec1", duration: info.duration }, { id: "rec2", duration: 5 }] });
  check(cutOut.clips.length === 1, "a video the creator cut out does not come back on the next merge");
  const parts = cutAtSegments(free).timeline;
  check(parts.clips.length > 1 && captionCues(parts).length === captionCues(free).length && Math.abs(layout(parts).duration - layout(free).duration) < 0.01, `cut at its captions it is ${parts.clips.length} parts, with no caption or time lost`);
  const tight = cutAtSegments(free, { pauses: true }).timeline;
  check(layout(tight).duration < layout(free).duration - 1 && captionCues(tight).length === captionCues(free).length, `without the pauses it runs ${layout(tight).duration.toFixed(1)}s of ${layout(free).duration.toFixed(1)}s, every caption kept`);
  check(buildSrt(free).trim().split(/\n\n/).length === segmentsOf(free).length, "its captions make an .srt, an entry per section");

  console.log(`\n  frames: ${dir}`);
  for (const f of ["frame_caption", "frame_broll", "frame_split_top", "frame_overlay", "frame_split_bottom"]) console.log(`          ${f}.png`);
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
