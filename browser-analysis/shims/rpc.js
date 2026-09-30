/**
 * shims/rpc.js: a question for the server, asked through the page.
 *
 * The worker cannot call the API itself (the page holds the login), so it
 * posts the question to the page, which asks the server and posts the answer
 * back. Questions and answers travel as exactJson, so the model's answer
 * arrives as the very value the server's own analysis would have received.
 * A long question's progress arrives on the way ({ type: "asking" }).
 *
 * An answer that is an error is thrown, as the server's function would have
 * thrown it. A question that could not be ASKED — the network, the page, a
 * server that refused it — breaks the run: the server would never have been
 * in that position.
 */
import { exactStringify, exactParse } from "../../backend/services/studio/exactJson.js";
import { broken } from "./globals.js";

let seq = 0;
const waiting = new Map();

export function answered(msg) {
  const w = waiting.get(msg.id);
  if (!w) return;
  waiting.delete(msg.id);
  w.resolve(msg);
}

/** How far the server has got with a question, 0..1. */
export function progressed(msg) {
  const w = waiting.get(msg.id);
  const p = Number(msg.p);
  if (w?.onProgress && Number.isFinite(p)) w.onProgress(Math.max(0, Math.min(1, p)));
}

export async function ask(kind, question, { onProgress = null } = {}) {
  const id = ++seq;
  const reply = await new Promise((resolve) => {
    waiting.set(id, { resolve, onProgress });
    self.postMessage({ type: "ask", id, kind, q: exactStringify(question) });
  });
  if (reply.transport) throw broken(`the ${kind} question could not be answered by the server: ${reply.transport}`);
  if (reply.error) throw new Error(reply.error);
  return exactParse(reply.a);
}
