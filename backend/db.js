/**
 * db.js: one Mongo connection for the process.
 *
 * Clipo shares the Atlas account/cluster with betaFounderProduction, so this is
 * deliberately plain: username and host sit in code, only the password comes
 * from the environment.
 *
 * The one thing worth keeping is the `/hinglish` in the path. A URI that ends
 * `…mongodb.net/?appName=…` — the shape betaFounderProduction uses — connects to
 * the cluster's default `test` database instead, which is where data goes to
 * quietly get lost. Same cluster, different database: that path segment is the
 * only thing separating Clipo's collections from betaFounder's.
 *
 * Unlike the reference project (which fires connect() and never awaits it), this
 * AWAITS and rethrows: a server that boots against a dead database answers every
 * request with a confusing 500 instead of failing loudly at startup.
 *
 * ── THE CLUSTER DROPS OUT, BRIEFLY, AND THAT IS NORMAL ───────────────────────
 * Cluster0 is a shared-tier Atlas cluster (hosts ac-…-shard-00-0N, a 500
 * connection cap), which sits behind proxies Atlas restarts and moves. Every so
 * often a connection is cut mid-handshake — "connection <monitor> to
 * 159.41.170.53:27017 closed", labels HandshakeError and ResetPool — and for a
 * few seconds, sometimes longer, there is no primary to write to. Before this,
 * a query that could not find one within 15 s failed; the route answered 500;
 * and a rejection nothing caught took the whole process down with it.
 *
 * None of that can be prevented from here (a dedicated M10 cluster is the only
 * real cure). What is done here is to ride it out:
 *   - queries wait SELECT_MS for a primary instead of 15 s, and the driver's
 *     one automatic retry of a read or a write stays on;
 *   - the outage and its end are logged as one line each, with how long it
 *     lasted, instead of a page of topology per failed query;
 *   - dbUnreachable() tells "the database dropped out" apart from "the query
 *     was wrong", so callers can wait and try again (retryDb) or answer 503
 *     (server.js) rather than 500;
 *   - a rejection that is only a dropout is logged, not fatal
 *     (keepRunningThroughDbDropouts).
 */
import mongoose from "mongoose";

/**
 * How long a query waits for a primary before giving up. Under the browser's
 * 30 s request timeout (src/api.js), with room for the rest of the request;
 * MONGO_SELECT_MS to change it.
 */
const SELECT_MS = parseInt(process.env.MONGO_SELECT_MS, 10) > 0 ? parseInt(process.env.MONGO_SELECT_MS, 10) : 20000;
const OPTIONS = { serverSelectionTimeoutMS: SELECT_MS, retryReads: true, retryWrites: true };
// A query issued while Mongoose itself counts as disconnected waits in its
// buffer; give it the same patience as one waiting inside the driver.
mongoose.set("bufferTimeoutMS", SELECT_MS);

/* ── WHAT COUNTS AS "THE DATABASE DROPPED OUT" ─────────────────────────────── */
const DROPOUT_CODES = new Set([
  6, 7, 89, 91, 189, 9001, 10107, 11600, 11602, 13435, 13436, // host unreachable … not primary
]);
// The socket's own errors. At the instant a connection is cut the driver can
// hand one up raw — Error "This socket has been ended by the other party",
// code EPIPE — rather than wrapped as a MongoNetworkError; measured, 2026-09-26.
const SOCKET_CODES = new Set(["EPIPE", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "ECONNABORTED", "ERR_SOCKET_CLOSED"]);
const DROPOUT_LABELS = ["RetryableWriteError", "ResetPool", "HandshakeError", "TransientTransactionError"];
const DROPOUT_MESSAGE =
  /buffering timed out|Server selection timed out|connection .* closed|not (?:writable )?primary|PrimarySteppedDown|InterruptedDueToReplStateChange|socket has been ended|socket hang up|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE/i;

/** True when an error means the database was unreachable, not that the request was wrong. */
export function dbUnreachable(err, depth = 0) {
  if (!err || depth > 4) return false;
  if (/^Mongo(?:ose)?(?:Network|NetworkTimeout|ServerSelection|PoolCleared)Error$/.test(String(err.name || ""))) return true;
  if (DROPOUT_CODES.has(err.code) || SOCKET_CODES.has(err.code)) return true;
  if (typeof err.hasErrorLabel === "function" && DROPOUT_LABELS.some((l) => err.hasErrorLabel(l))) return true;
  if (DROPOUT_MESSAGE.test(String(err.message || ""))) return true;
  return dbUnreachable(err.cause || err.reason, depth + 1);
}

/* ── IS IT DOWN RIGHT NOW, OR WAS IT A MOMENT AGO ─────────────────────────── */
let lostAt = 0;      // when the primary went missing; 0 while there is one
let lastFault = 0;   // the last time anything reported a dropout
const RECENT_MS = 60_000;

/** Called by anything that caught a dropout, so dbTrouble() knows about it. */
export function noteDbFault(err) {
  if (!err || dbUnreachable(err)) lastFault = Date.now();
}

/** True while there is no primary, and for a minute after the last dropout. */
export function dbTrouble() {
  return lostAt > 0 || Date.now() - lastFault < RECENT_MS;
}

/** Can anything be written? A replica set needs its primary; any other shape needs a server that answered. */
const writable = (d) => {
  if (d?.type === "ReplicaSetWithPrimary") return true;
  if (!["Single", "Sharded", "LoadBalanced"].includes(d?.type)) return false;
  for (const s of d.servers?.values?.() || []) if (s?.type && s.type !== "Unknown") return true;
  return false;
};

function watchTopology() {
  const client = mongoose.connection.getClient?.();
  if (!client || client.__dropoutWatch) return;
  client.__dropoutWatch = true;
  client.on("topologyDescriptionChanged", (ev) => {
    const had = writable(ev.previousDescription);
    const has = writable(ev.newDescription);
    if (had && !has) {
      lostAt = Date.now();
      lastFault = lostAt;
      console.warn(`[mongo] no primary reachable (${ev.newDescription?.type}); queries will wait up to ${SELECT_MS / 1000}s for one`);
    } else if (!had && has && lostAt) {
      console.log(`[mongo] primary back after ${((Date.now() - lostAt) / 1000).toFixed(1)}s`);
      lostAt = 0;
      lastFault = Date.now();
    }
  });
}

const brief = (err) => `${err?.name || "Error"}: ${String(err?.message || err).split("\n")[0].slice(0, 160)}`;

/**
 * Run a database call, and if the database has dropped out, wait and run it
 * again — for up to `waitMs`. For the writes that must not be lost to a
 * dropout: the result of an analysis the creator has already paid the model
 * for, the state of a job. Anything else still fails as it did.
 *
 * A write is only repeated after the driver's own retry has also failed, and a
 * server-selection failure means nothing reached the server; so a doubled
 * write needs the connection to drop between the server applying it and the
 * answer arriving, twice in a row. Callers that $inc accept that.
 */
export async function retryDb(label, fn, { waitMs = 120_000 } = {}) {
  const deadline = Date.now() + waitMs;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!dbUnreachable(err) || Date.now() >= deadline) throw err;
      noteDbFault(err);
      const pause = Math.min(15_000, 1000 * 2 ** (attempt - 1), Math.max(0, deadline - Date.now()));
      console.warn(`[mongo] ${label}: database unreachable (${brief(err)}); trying again in ${(pause / 1000).toFixed(0)}s`);
      await new Promise((r) => setTimeout(r, pause));
    }
  }
}

/**
 * ── A DROPOUT MUST NOT KILL THE PROCESS ──────────────────────────────────────
 * Express 4 does not catch a rejected async route, and a timer's promise that
 * rejects has nobody to catch it either. Node's default for an unhandled
 * rejection is to crash, so one query that lost the database mid-flight took
 * the API down — every open socket, every upload in progress — until pm2
 * brought it back. A dropout is logged in one line and survived. Anything else
 * is rethrown, which is exactly the crash it always was.
 */
export function keepRunningThroughDbDropouts(tag) {
  process.on("unhandledRejection", (reason) => {
    if (dbUnreachable(reason)) {
      noteDbFault(reason);
      console.warn(`[${tag}] a database call failed during a dropout and nothing caught it; carrying on (${brief(reason)})`);
      return;
    }
    throw reason;
  });
}

const username = "myhandlein_db_user";
const password = process.env.MONGODB_PASSWORD;

const dbUrl =
  "mongodb+srv://" + username + ":" + password +
  "@cluster0.itfkrwb.mongodb.net/hinglish?retryWrites=true&w=majority&appName=Cluster0";

export default async function connectToMongo() {
  // Escape hatch, unset in production. Its reason for existing is the migration
  // scripts: running one with --apply against the live cluster having never run
  // it anywhere is not a thing anyone should have to do, and this is what makes
  // "restore a dump locally, point at it, watch what it does" possible.
  const override = String(process.env.MONGODB_URI || "").trim();
  if (override) {
    await mongoose.connect(override, OPTIONS);
    watchTopology();
    console.log(`[mongo] connected via MONGODB_URI → db "${mongoose.connection.name}"`);
    return;
  }

  if (!password) {
    throw new Error("MONGODB_PASSWORD is not set. Add it to backend/.env.");
  }

  mongoose.connection.on("error", (err) => { noteDbFault(err); console.error("[mongo] error:", err.message); });
  mongoose.connection.on("disconnected", () => { lastFault = Date.now(); console.warn("[mongo] disconnected"); });
  mongoose.connection.on("reconnected", () => console.log("[mongo] reconnected"));

  await mongoose.connect(dbUrl, OPTIONS);
  watchTopology();
  console.log(`[mongo] connected → db "${mongoose.connection.name}" (queries wait up to ${SELECT_MS / 1000}s for a primary)`);
}
