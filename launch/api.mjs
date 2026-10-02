/**
 * api.mjs: the launch-video pipeline as calls, for the app's worker
 * (backend/services/launch/) and for generate.mjs in a terminal.
 *
 *   createVideo({ url, dir, out })        read the site, write, speak, score, render → v1
 *   refineVideo({ dir, request, out })    the latest draft + a request → the next version
 *   renderLatest({ dir, out })            the latest board again (after a renderer fix)
 *
 * Everything a refinement needs lives in `dir`: site.json, capture.json, the
 * screenshots, every draft and board, the voice takes and the music, and
 * state.json (version and the requests so far). The worker keeps a copy of
 * that folder in storage so any worker can pick the next request up.
 *
 * ── WHAT A CREATOR READS WHEN IT FAILS ───────────────────────────────────────
 * Each stage turns its failure into one sentence (err.userMessage); the cause
 * stays in the log. A voice that cannot be recorded today does not fail the
 * video: it is delivered with music only, and says so (result.voiced).
 */
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fetchSite } from "./pipeline/site.mjs";
import { captureSite, captureMore } from "./pipeline/capture.mjs";
import { directBoard, planChange, refineBoard, scenesOf } from "./pipeline/director.mjs";
import { speakAll } from "./pipeline/voice.mjs";
import { resolveBoard } from "./pipeline/board.mjs";
import { renderBoard } from "./pipeline/render.mjs";
import { makeMusic, estimateSeconds } from "./pipeline/music.mjs";
import { MIN_SECONDS } from "./src/library.js";
import { durationOf } from "./src/placement.js";

export { setKeys } from "./pipeline/env.mjs";

const readJson = async (f) => JSON.parse(await fsp.readFile(f, "utf8"));
const writeJson = (f, v) => fsp.writeFile(f, JSON.stringify(v, null, 2));
const userError = (msg, cause) => Object.assign(new Error(`${msg}${cause ? ` (${String(cause.message || cause).slice(0, 300)})` : ""}`), { userMessage: msg, cause });

/** Progress across stages: each stage reports 0..1 of its own share. */
function stages(onProgress, plan) {
  let at = 0;
  const bounds = {};
  for (const [name, share, label] of plan) {
    bounds[name] = { from: at, to: at + share, label };
    at += share;
  }
  return (name) => (f = 0) => {
    const b = bounds[name];
    onProgress(b.from + (b.to - b.from) * Math.max(0, Math.min(1, f)), b.label);
  };
}

const checkSignal = (signal) => {
  if (signal?.aborted) throw userError("This took too long and was stopped. Please try again.");
};

async function speakScoreRender({ dir, version, draft, capture, out, at, log, signal = null, voice = true, music = true }) {
  checkSignal(signal);
  await writeJson(path.join(dir, `draft-v${version}.json`), draft);
  const scenes = scenesOf(draft);
  if (!scenes.length) throw userError("We couldn't write a script for this page. Please try again.");
  at("speak")(0);
  // The score is composed while the lines are spoken, so its length is an
  // estimate with room to spare; the video fades it out at its own end.
  const [voices, track] = await Promise.all([
    voice
      ? speakAll(scenes, { dir, voice: draft.voiceName || "Kore", log, onProgress: at("speak") }).catch((err) => {
          log(`voice failed, delivering without it: ${String(err.message).slice(0, 200)}`);
          return null;
        })
      : {},
    music
      ? makeMusic({ dir, mood: draft.music, seconds: estimateSeconds(scenes, MIN_SECONDS) + 10, log }).catch((err) => {
          log(`music skipped: ${String(err.message).slice(0, 160)}`);
          return null;
        })
      : null,
  ]);
  checkSignal(signal);
  const board = resolveBoard(draft, capture, { voices: voices || {} });
  if (track) board.music = track.file;
  await writeJson(path.join(dir, `board-v${version}.json`), board);
  const seconds = durationOf(board) / 30;
  log(`board v${version}: ${board.scenes.map((s) => `${s.type}(${s.seconds}s)`).join(" → ")} = ${seconds.toFixed(1)}s`);
  try {
    await renderBoard({ board, dir, out, poster: path.join(dir, `poster-v${version}.jpg`), signal, log, onProgress: at("render") });
  } catch (err) {
    checkSignal(signal);
    throw userError("The video couldn't be rendered. Please try again.", err);
  }
  const poster = path.join(dir, `poster-v${version}.jpg`);
  return { version, board, seconds, scenes: board.scenes.length, voiced: voices !== null && voice, music: !!track, poster: fs.existsSync(poster) ? poster : null };
}

export async function createVideo({ url, dir, out, notes = "", local = false, signal = null, onProgress = () => {}, log = () => {} }) {
  await fsp.mkdir(dir, { recursive: true });
  const at = stages(onProgress, [
    ["look", 0.36, "Reading your website"],
    ["direct", 0.07, "Writing the script"],
    ["speak", 0.12, "Recording the voiceover"],
    ["render", 0.45, "Rendering the video"],
  ]);
  at("look")(0);
  let site;
  let capture;
  try {
    [site, capture] = await Promise.all([fetchSite(url), captureSite(url, dir, { local, log, onProgress: at("look") })]);
  } catch (err) {
    throw userError("We couldn't open that website. Check the address, and that the page is public (not behind a login).", err);
  }
  if (!capture.shots.length) throw userError("We couldn't take any pictures of that page. Check the address and try again.");
  if (String(site.text || "").trim().length < 120) throw userError("That page has too little text to write a demo from. Try your homepage or a product page.");
  await writeJson(path.join(dir, "site.json"), site);
  await writeJson(path.join(dir, "capture.json"), capture);

  checkSignal(signal);
  at("direct")(0);
  let draft;
  try {
    ({ draft } = await directBoard({ site, capture, dir, notes }));
  } catch (err) {
    throw userError("We couldn't write the script. Please try again in a minute.", err);
  }
  const result = await speakScoreRender({ dir, version: 1, draft, capture, out, at, log, signal });
  await writeJson(path.join(dir, "state.json"), { url, version: 1, history: [] });
  return { ...result, title: draft.brand?.name || capture.brand.siteName || "" };
}

/**
 * The next version, from a message in the chat. First what the creator means
 * (planChange), then whatever that needs from the site (a screenshot retaken,
 * a section photographed, another logo), then the storyboard rewritten with
 * all of that in hand. Returns the reply to show in the chat.
 */
export async function refineVideo({ dir, request, out, signal = null, onProgress = () => {}, log = () => {} }) {
  const at = stages(onProgress, [
    ["plan", 0.07, "Reading your request"],
    ["look", 0.15, "Taking new screenshots"],
    ["direct", 0.08, "Rewriting the script"],
    ["speak", 0.13, "Recording the changes"],
    ["render", 0.57, "Rendering the new version"],
  ]);
  const state = await readJson(path.join(dir, "state.json"));
  const site = await readJson(path.join(dir, "site.json"));
  const capture = await readJson(path.join(dir, "capture.json"));
  const prev = await readJson(path.join(dir, `draft-v${state.version}.json`));
  const prevBoard = await readJson(path.join(dir, `board-v${state.version}.json`));
  // Older job folders kept only the requests; the replies are kept from now on.
  const turns = state.turns || (state.history || []).map((r) => ({ request: r, reply: "" }));

  at("plan")(0);
  let plan;
  try {
    ({ plan } = await planChange({ site, capture, dir, draft: prev, board: prevBoard, request, turns }));
  } catch (err) {
    throw userError("We couldn't work that change out. Please try again, or say it another way.", err);
  }
  log(`plan: ${plan.understood} | retake ${plan.retake.map((r) => r.shot).join(",") || "-"} | capture ${plan.capture.map((c) => c.find).join(",") || "-"} | logo ${plan.logo}`);
  checkSignal(signal);

  const done = [];
  let extraNotes = [];
  const targets = [
    ...plan.retake.filter((r) => capture.shots.some((x) => x.id === r.shot)).map((r) => ({ retake: r.shot })),
    ...plan.capture.filter((c) => String(c.find || "").trim()).map((c) => ({ find: c.find, url: c.url || "" })),
  ];
  const logoUrl = plan.logo === "link" && /^https?:\/\//i.test(plan.logo_url || "") ? plan.logo_url : "";
  let newLogo = null;
  if (targets.length || logoUrl) {
    at("look")(0.1);
    try {
      const more = await captureMore(dir, capture, { targets, logoUrl, log });
      await writeJson(path.join(dir, "capture.json"), capture);
      for (const s of more.added) done.push(s.replaces ? `${s.replaces} was retaken as ${s.id} (${s.label || "same section"})` : `new screenshot ${s.id}: ${s.label || "the requested section"}`);
      extraNotes = more.notes;
      newLogo = more.logo;
      if (newLogo) done.push(`the creator's logo was added as ${newLogo.id}`);
    } catch (err) {
      extraNotes = ["the site couldn't be opened again just now"];
      log(`more shots failed: ${String(err.message).slice(0, 200)}`);
    }
    at("look")(1);
  }
  checkSignal(signal);

  at("direct")(0);
  let draft;
  try {
    ({ draft } = await refineBoard({ site, capture, dir, draft: prev, board: prevBoard, request, plan, done, turns }));
  } catch (err) {
    throw userError("We couldn't work that change out. Please try again, or say it another way.", err);
  }
  // The logo is the plan's decision (it looked at the candidates for this); the rewrite only carries it.
  if (newLogo) draft.logo = newLogo.id;
  else if (plan.logo && plan.logo !== "keep" && plan.logo !== "link" && (capture.brand.logos || []).some((l) => l.id === plan.logo)) draft.logo = plan.logo;
  else if (!draft.logo) draft.logo = prev.logo;

  const version = state.version + 1;
  const result = await speakScoreRender({ dir, version, draft, capture, out, at, log, signal });
  let reply = String(plan.reply || "").trim() || "Done.";
  // What was asked of the site but did not come back is said, not glossed over.
  if (extraNotes.length) reply += ` (One thing didn't work: ${extraNotes.join("; ")}.)`;
  await writeJson(path.join(dir, "state.json"), { ...state, version, history: [...(state.history || []), request], turns: [...turns, { request, reply }] });
  return { ...result, title: draft.brand?.name || "", reply };
}

export async function renderLatest({ dir, out, onProgress = () => {}, log = () => {} }) {
  const state = await readJson(path.join(dir, "state.json"));
  const board = await readJson(path.join(dir, `board-v${state.version}.json`));
  await renderBoard({ board, dir, out, log, onProgress });
  return { version: state.version, board, seconds: durationOf(board) / 30 };
}

/** Every file in a job folder, as paths relative to it (what the worker keeps in storage). */
export async function filesOf(dir) {
  const out = [];
  async function walk(rel) {
    for (const e of await fsp.readdir(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(r);
      else out.push(r);
    }
  }
  if (fs.existsSync(dir)) await walk("");
  return out;
}
