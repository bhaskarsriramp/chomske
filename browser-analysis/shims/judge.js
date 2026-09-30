/**
 * shims/judge.js: backend/services/studio/judge.js, for the browser.
 *
 * The press judge reads frames around each press and asks the model; with
 * STUDIO_PRESS_JUDGE off (the default) it returns the presses untouched, as
 * the real one does. Otherwise the server runs the real one on its own copy of
 * the recording and its stored screen reading.
 */
import { ask } from "./rpc.js";

export const PRESS_JUDGE_MODE = String(process.env.STUDIO_PRESS_JUDGE || "off").trim().toLowerCase();
export const VERDICTS = [];

export async function judgePresses(events, o = {}) {
  const mode = o.mode || PRESS_JUDGE_MODE;
  if (mode !== "shadow" && mode !== "decide") return events;
  return ask("judgePresses", { events, located: o.located, flashes: o.flashes, W: o.W, H: o.H, duration: o.duration });
}

export default { judgePresses, PRESS_JUDGE_MODE };
