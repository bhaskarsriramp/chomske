/**
 * worker.js: the first analysis of a recording, in the creator's browser.
 *
 * Runs backend/services/studio/analyse.js — the server's own file, bundled
 * with the analysis modules it imports — inside a Web Worker. Only the Node
 * parts are replaced (shims/), each one doing exactly what the server's does
 * or breaking the run.
 *
 * Messages in:
 *   { type: "start", session }  the payload POST /analyse returned (see
 *                               browserAnalysis.js sessionPayload), with its
 *                               links made absolute by the page
 *   { type: "answer", ... }     the server's answer to a question (rpc.js)
 *   { type: "asking", id, p }   how far the server has got with one
 * Messages out:
 *   { type: "progress", p, stage }
 *   { type: "ask", id, kind, q }
 *   { type: "result", result, ms, version, stats }   result is exactJson
 *   { type: "failed", reason }                        give the job back
 */
import { broken, whenBroken } from "./shims/globals.js";
import { exactStringify, exactParse } from "../backend/services/studio/exactJson.js";
import { stats } from "./shims/ffmpeg.js";
import { canvasStats } from "./shims/canvas.js";
import { answered, progressed } from "./shims/rpc.js";

/* global __VERSION__ */
const VERSION = __VERSION__;

let started = false;

self.onmessage = (e) => {
  const m = e.data || {};
  if (m.type === "start" && !started) {
    started = true;
    run(m.session);
  } else if (m.type === "answer") {
    answered(m);
  } else if (m.type === "asking") {
    progressed(m);
  }
};

async function run(s) {
  const post = (x) => self.postMessage(x);
  try {
    // Before any analysis module loads: several read their settings at import.
    Object.assign(process.env, s.env || {});
    self.__analysis.providerReady = !!s.provider_ready;
    self.__analysis.templates = new URL(s.templates, self.location.href).href;

    post({ type: "progress", p: 0.02, stage: "Reading the recording" });
    const got = await fetch(s.video);
    if (!got.ok) throw broken(`the recording could not be downloaded (${got.status})`);
    const video = await got.blob();
    let screen = null;
    if (s.screen) {
      const sr = await fetch(s.screen);
      if (!sr.ok) throw broken(`the screen reading could not be downloaded (${sr.status})`);
      screen = exactParse(await sr.text());
    }

    const { analyseRecording } = await import("../backend/services/studio/analyse.js");
    const t0 = performance.now();
    // A broken run is handed back at once rather than when the rest of it
    // (minutes of the model reading stills, with the vision pass on) is done.
    const result = await Promise.race([
      analyseRecording({
        video,
        audio: "",
        workDir: "/work",
        capture: s.capture,
        source: s.source,
        duration: s.duration,
        wantCaptions: false,
        screen,
        onProgress: (p, stage) => post({ type: "progress", p, stage }),
      }),
      whenBroken.then((reason) => { throw new Error(reason); }),
    ]);
    const ms = performance.now() - t0;
    if (self.__analysis.broken) throw new Error(self.__analysis.broken);
    post({ type: "result", result: exactStringify(result), ms: Math.round(ms), version: VERSION, stats: { ...stats, ...canvasStats } });
  } catch (err) {
    post({ type: "failed", reason: String(self.__analysis.broken || err?.message || err).slice(0, 300) });
  }
}
