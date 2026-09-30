/**
 * shims/vision.js: backend/services/studio/vision.js, for the first analysis
 * in the browser.
 *
 * Two of its functions are reached by the first analysis, and both need the
 * recording's frames and the model: the server answers them from its own copy
 * (browserAnalysis.js answer), exactly as its own analysis would. The rest
 * belong to passes that do not run in the first analysis; reaching one breaks
 * the run instead of doing something the server would not.
 */
import { ask } from "./rpc.js";
import { broken } from "./globals.js";

export const newSpend = () => ({ usd: 0, calls: 0, failed: 0 });

/** Which pointer is the creator's (locate.js chooseIdentity). */
export const identifyPointer = ({ rivals }) => ask("identify", rivals);

/** Whether a stretch of the drawn path is somebody else's pointer (locate.js withoutStrangers). */
export const judgeRuns = ({ reference, runs, heightPx }) => ask("judgeRuns", { reference, runs, heightPx });

const serverOnly = (name) => async () => { throw broken("vision." + name + " is not part of the first analysis"); };
export const readFrames = serverOnly("readFrames");
export const detectSteps = serverOnly("detectSteps");
export const findSensitive = serverOnly("findSensitive");
export const writeCaptions = serverOnly("writeCaptions");
export const writeNarration = serverOnly("writeNarration");
export const pointerTargets = serverOnly("pointerTargets");
export const arbitratePress = serverOnly("arbitratePress");
export const auditChange = serverOnly("auditChange");
