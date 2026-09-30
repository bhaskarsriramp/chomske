/**
 * browserAnalysis.js: the first analysis, run in this tab.
 *
 * When the server offers it (GET /studio/config → browser_analysis) and this
 * browser can run it, POST /analyse is sent with the build's version, and the
 * server may answer with a session. This file runs that session: it starts
 * the analysis worker (built by browser-analysis/build.mjs into
 * /studio/analysis/), passes the worker's questions for the model to the
 * server, keeps the server's hold on the job alive with heartbeats, and hands
 * the result in.
 *
 * ── NOTHING HERE CAN LOSE AN EDIT ────────────────────────────────────────────
 * The server queued its own analysis before answering, held until the
 * heartbeats stop. So every way this can end badly — the tab closes, the
 * laptop sleeps, the worker fails, the result is refused — ends with the
 * server doing the job it always did. The editor shows the same progress
 * either way (it reads the demo, which the heartbeats update).
 *
 * One run per demo, owned by this module rather than a component, so moving
 * between the library and the editor does not stop it.
 */
import { analysisHeartbeat, analysisAsk, analysisResult, analysisFailed } from "./studioApi";

const runs = new Map();

/**
 * What to send as `browser` with POST /analyse, or null to leave the analysis
 * to the server. Only Chromium browsers (Chrome, Edge, Brave, Arc…): their
 * JavaScript engine is the server's, and the analysis was measured identical
 * in them; others have not been.
 */
export async function browserAnalysisOffer(config) {
  const ba = config?.browser_analysis;
  if (!ba || ba.mode === "off" || !ba.version || !ba.worker) return null;
  try {
    const brands = navigator.userAgentData?.brands || [];
    if (!brands.some((b) => /chromium/i.test(b.brand))) return null;
    // Through window: the build's lint does not know the WebCodecs globals.
    const { Worker: W, VideoDecoder: VD, OffscreenCanvas: OC } = window;
    if (typeof W !== "function" || typeof VD !== "function" || typeof OC !== "function") return null;
    const ok = await VD.isConfigSupported({ codec: "avc1.42E01E", codedWidth: 1920, codedHeight: 1088, hardwareAcceleration: "prefer-software" });
    if (!ok?.supported) return null;
    // The recording is held in memory while it is read.
    if (navigator.deviceMemory && navigator.deviceMemory < 4) return null;
  } catch {
    return null;
  }
  return { version: ba.version };
}

/** Whether a run for this demo is going on in this tab. */
export const browserAnalysisRunning = (key) => runs.has(key);

/**
 * Run the session POST /analyse returned. Resolves when this tab is done with
 * it, however that went; never throws.
 */
export function runBrowserAnalysis(key, session) {
  if (!session || runs.has(key)) return runs.get(key) || Promise.resolve();
  const done = run(key, session).finally(() => runs.delete(key));
  runs.set(key, done);
  return done;
}

/** Answers the server gives while it is up or restarting, worth asking again after. */
const PASSING = new Set([502, 503, 504]);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(key, s) {
  let worker = null;
  let beat = null;
  let latest = { progress: 0.02, stage: "Reading the recording" };
  let finished = false;

  const giveUp = async (reason) => {
    if (finished) return;
    finished = true;
    await analysisFailed(key, { session: s.session, reason: String(reason).slice(0, 300) }).catch(() => {});
  };

  /**
   * One question from the worker, asked until it is answered. The server
   * answers within ~20 seconds or says it is still working on it (reading
   * every still takes minutes), and is then asked after it by the worker's
   * number for it, without the question. What comes back — the answer, or why
   * there is none — goes to the worker, which breaks the run on the latter.
   */
  const askServer = async (m) => {
    let sent = false;
    let misses = 0;
    while (!finished) {
      try {
        const r = await analysisAsk(key, sent ? { session: s.session, id: m.id } : { session: s.session, id: m.id, kind: m.kind, q: m.q });
        if (!r?.pending) return { type: "answer", id: m.id, a: r?.a, error: r?.error };
        sent = true;
        misses = 0;
        worker?.postMessage({ type: "asking", id: m.id, p: r.progress });
      } catch (err) {
        const status = err?.response?.status;
        // The server said no — the run is over, or the question was refused or lost.
        if (status && !PASSING.has(status)) return { type: "answer", id: m.id, transport: err.response.data?.message || err.message };
        // Not answered at all: asked again (with the question, if it may never
        // have arrived — the server keeps one per number).
        if (++misses > 4) return { type: "answer", id: m.id, transport: err?.message || "no answer" };
        await pause(2000 * misses);
      }
    }
    return { type: "answer", id: m.id, transport: "the run was stopped" };
  };

  try {
    await new Promise((resolve) => {
      const stop = () => {
        if (beat) clearInterval(beat);
        if (worker) worker.terminate();
        resolve();
      };

      worker = new Worker(s.worker, { type: "module", name: "clipo-analysis" });
      worker.onerror = (e) => { giveUp("the analysis worker could not run: " + (e?.message || "error")).then(stop); };

      // The hold on the server's job lasts while these arrive. When the server
      // says stop (it took over, or this took too long), this tab stops.
      beat = setInterval(async () => {
        try {
          const r = await analysisHeartbeat(key, { session: s.session, progress: latest.progress, stage: latest.stage });
          if (r && r.go === false) {
            finished = true;
            stop();
          }
        } catch {
          // A missed heartbeat is not a failure; enough of them and the hold lapses.
        }
      }, Math.max(3, s.heartbeat_s || 10) * 1000);

      worker.onmessage = async (e) => {
        const m = e.data || {};
        if (m.type === "progress") {
          latest = { progress: Math.max(0.02, Math.min(0.98, Number(m.p) || 0)), stage: String(m.stage || latest.stage) };
        } else if (m.type === "ask") {
          const reply = await askServer(m);
          if (!finished) worker.postMessage(reply);
        } else if (m.type === "result") {
          try {
            const r = await analysisResult(key, { session: s.session, version: m.version, ms: m.ms, result: m.result });
            finished = true;
            if (!r?.accepted) console.info("[studio] the browser's analysis was not used:", r?.reason);
          } catch (err) {
            await giveUp("the result could not be handed in: " + (err?.message || "error"));
          }
          stop();
        } else if (m.type === "failed") {
          await giveUp(m.reason);
          stop();
        }
      };

      worker.postMessage({ type: "start", session: s });
    });
  } catch (err) {
    await giveUp(err?.message || err);
  }
}
