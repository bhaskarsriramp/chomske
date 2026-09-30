/**
 * shims/vision.js: backend/services/studio/vision.js, for the first analysis
 * in the browser.
 *
 * Everything the first analysis asks of the model needs the recording's
 * frames and the model, so the server answers it from its own copy
 * (browserAnalysis.js answerWith), exactly as its own analysis would:
 *
 *   identifyPointer, judgeRuns   which pointer is the creator's
 *   readFrames                   every sampled still, read (STUDIO_VISION_ON_ANALYSE)
 *   pointerTargets               what the pointer rested on (vig.js)
 *   detectSteps, writeNarration  the steps and the narration
 *
 * Each question is built from exactly the values the server's own call would
 * be given, in the order browserAnalysis.js replayAsks builds it, so the
 * re-check can find the answer again. The rest belong to passes that do not
 * run in a browser analysis; reaching one breaks the run instead of doing
 * something the server would not.
 */
import { ask } from "./rpc.js";
import { broken } from "./globals.js";

export const newSpend = () => ({ usd: 0, calls: 0, failed: 0 });

/** Which pointer is the creator's (locate.js chooseIdentity). */
export const identifyPointer = ({ rivals }) => ask("identify", rivals);

/** Whether a stretch of the drawn path is somebody else's pointer (locate.js withoutStrangers). */
export const judgeRuns = ({ reference, runs, heightPx }) => ask("judgeRuns", { reference, runs, heightPx });

/**
 * Every sampled still, read. The server cuts the stills itself — the same
 * extractFrames call its analysis makes — and checks they are the ones
 * counted here; the question is only where they fall. Minutes long, so the
 * server's progress through it comes back as this pass's progress.
 */
export const readFrames = (frames, { onProgress = () => {} } = {}) =>
  ask("readFrames", { t: frames.map((f) => f.t) }, { onProgress });

/** What each rest was on, from a close crop of the recording (vig.js). */
export const pointerTargets = ({ targets, W, H }) => ask("pointerTargets", { targets, W, H });

/** The demo's chapters and dead air, from the readings and the presses. */
export const detectSteps = ({ shots, events, duration }) => ask("detectSteps", { shots, events, duration });

/** The narration, from the steps. */
export const writeNarration = ({ steps, summary, product, duration }) => ask("writeNarration", { steps, summary, product, duration });

const serverOnly = (name) => async () => { throw broken("vision." + name + " is not part of the first analysis in the browser"); };
export const findSensitive = serverOnly("findSensitive");
export const writeCaptions = serverOnly("writeCaptions");
export const arbitratePress = serverOnly("arbitratePress");
export const auditChange = serverOnly("auditChange");
