/**
 * provider.js: the one place this product talks to Gemini.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * There used to be three clients. services/geminiClient.js read YouTube videos,
 * services/edit/gemini.js asked for JSON, and two more services built a client
 * of their own from the first key in the list. Each had its own copy of the key
 * rotation, its own cost arithmetic and its own idea of what a retry is — and
 * none of them knew what the others were doing, which is exactly the knowledge
 * a rate limit is about.
 *
 * ── AND WHY IT EXISTS NOW ────────────────────────────────────────────────────
 * Because the account moved to Vertex AI, and a key pool has no meaning there.
 * AI Studio bills a KEY and limits a KEY, so N keys is N times the ceiling and
 * round-robin is a real strategy. Vertex bills a PROJECT and limits that
 * project's quota in a REGION, so there is exactly one identity no matter how
 * many credentials are held, and the only two levers left are how fast we ask
 * and which region we ask in. Both have to be coordinated across every caller
 * in the process — and, with more than one process, across the fleet — which is
 * impossible while each file owns its own client.
 *
 * ── THE THREE THINGS IT DOES ─────────────────────────────────────────────────
 *   1. builds the right client            an AI Studio key, or a Vertex project
 *   2. spends a request budget            a token bucket, shared through Redis
 *   3. waits properly when told to wait   the server's own retry delay, honoured
 *
 * ── WAITING IS THE POINT, NOT RETRYING ───────────────────────────────────────
 * A 429 from Google is not a failure, it is an instruction, and it usually
 * arrives with the length of the wait attached. The loop this replaces ignored
 * that and backed off 400ms, then 1600ms, then gave up — which against a
 * per-minute quota means three requests fired into a closed window and a pass
 * reported as "the model failed" when nothing failed at all. Here the server's
 * own retryDelay is read and honoured, the wait may run to minutes, and the
 * whole process is told to slow down rather than each worker discovering the
 * limit separately.
 *
 * A testing project may have a quota as low as one request a minute. That is a
 * supported configuration: set GEMINI_RPM=1 and a three hundred frame pass will
 * take five hours and finish, rather than failing in four seconds.
 */
import { GoogleGenAI } from "@google/genai";
import redis from "../../redis.js";

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

/* ────────────────────────────────────────────────────────────────────────────
   Which Google this is
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * "vertex" or "aistudio". Vertex unless something says otherwise.
 *
 * ── THE DEFAULT IS THE ONE WE ACTUALLY USE ───────────────────────────────────
 * This defaulted to aistudio at first, on the reasoning that a new switch
 * should not change how anything already behaves. That reasoning was wrong
 * here, because it made the intended configuration the one you had to opt into
 * — and an environment that had simply not been updated carried on spending AI
 * Studio credits that do not exist. It failed the way a missing env var always
 * does: silently, until a 402 from a billing page nobody meant to be on.
 *
 * AI Studio is the FUTURE state of this project, not the current one, so it is
 * the one that needs saying out loud. GEMINI_PROVIDER=aistudio moves back when
 * there are credits there.
 */
/**
 * ── AND NOW AI STUDIO, BECAUSE THERE ARE CREDITS THERE (2026-09-25) ─────────
 * The move back the paragraph above waited for. A key in the environment now
 * means AI Studio, without GEMINI_PROVIDER having to say so as well — the key
 * IS the statement. GEMINI_PROVIDER still wins when it is set: "vertex" forces
 * the Cloud project whatever keys are lying around, "aistudio" insists on a key.
 */
export const PROVIDER = (() => {
  const said = String(process.env.GEMINI_PROVIDER || "").trim().toLowerCase();
  if (said === "vertex" || said === "aistudio") return said;
  return aistudioKeys().length ? "aistudio" : "vertex";
})();

export const isVertex = () => PROVIDER === "vertex";

/**
 * The Vertex regions to spread requests across.
 *
 * ── THIS IS THE KEY POOL'S REPLACEMENT ──────────────────────────────────────
 * Quota on Vertex is granted per project PER REGION, so the same model in
 * us-central1 and europe-west4 draws on two separate allowances. Rotating
 * regions is therefore the one thing that raises the ceiling without asking
 * Google for more quota, and it is the exact analogue of what rotating keys did
 * on AI Studio. One region listed is perfectly normal and means no rotation.
 *
 * Each region gets its own bucket below, so a region that starts refusing does
 * not drag the others down with it.
 */
const REGIONS = String(process.env.VERTEX_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || "us-central1")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const PROJECT = String(
  process.env.VERTEX_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || ""
).trim();

/**
 * The AI Studio keys, when that is the provider.
 *
 * Unchanged in spirit from the three copies this replaces: a comma separated
 * list, used round-robin, because on AI Studio each key carries its own
 * per-minute limit.
 */
/**
 * AISTUDIO_KEY is this project's name for it; GEMINI_API_KEY and
 * GOOGLE_API_KEY are the names Google's own documentation and SDK use, and
 * a key set under either of those is the same key.
 */
export function aistudioKeys() {
  return String(process.env.AISTUDIO_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}
const KEYS = aistudioKeys;

let _cursor = 0;
const _clients = new Map();

/**
 * A client, and the name of the budget its requests come out of.
 *
 * The bucket name matters as much as the client: two requests that share a
 * quota must share a bucket, and two that do not must not. On AI Studio that is
 * the key; on Vertex it is the region.
 */
function pick() {
  if (isVertex()) {
    if (!REGIONS.length) throw new Error("VERTEX_LOCATION is empty");
    const location = REGIONS[_cursor++ % REGIONS.length];
    const id = "vertex:" + location;
    if (!_clients.has(id)) {
      /**
       * ── NO API KEY, AND THAT IS NOT AN OMISSION ───────────────────────────
       * Vertex authenticates with Application Default Credentials: the service
       * account attached to the VM, or GOOGLE_APPLICATION_CREDENTIALS pointing
       * at a key file locally. The SDK resolves them itself, which is why there
       * is nothing to pass here, and why a missing credential shows up as a 401
       * on the first call rather than as a startup error.
       */
      _clients.set(
        id,
        new GoogleGenAI({
          vertexai: true,
          ...(PROJECT ? { project: PROJECT } : {}),
          location,
        })
      );
    }
    return { client: _clients.get(id), bucket: id, where: location };
  }

  const keys = KEYS();
  if (!keys.length) throw new Error("No AI Studio key: set AISTUDIO_KEY (or GEMINI_API_KEY)");
  const key = keys[_cursor++ % keys.length];
  const id = "aistudio:" + key.slice(-6);
  if (!_clients.has(id)) _clients.set(id, new GoogleGenAI({ apiKey: key }));
  return { client: _clients.get(id), bucket: id, where: id };
}

/* ────────────────────────────────────────────────────────────────────────────
   Which model
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * What to ask for when nothing in the environment says.
 *
 * ── A DEFAULT THAT IGNORES THE PROVIDER IS A DEFAULT THAT IS WRONG ───────────
 * Eleven files used to carry their own `|| "gemini-3.5-flash"`, and every one of
 * them was an AI STUDIO name. On Vertex that model exists in the catalogue and
 * 404s on every call — Google's message says "was not found OR your project does
 * not have access to it", and it was the second half. So the move to Vertex hit
 * eleven separate 404s that could each only be fixed by setting an environment
 * variable nobody knew was needed, in a process that had to be restarted with
 * the new environment actually loaded.
 *
 * The two APIs do not serve the same catalogue. A default that does not know
 * which one it is talking to cannot be right on both, so it is chosen here,
 * once, next to the thing that knows.
 *
 * Neither of these is a claim about which model is BEST — only about which one
 * answers. Set GEMINI_TEXT_MODEL and friends to choose deliberately; the doctor
 * (scripts/aiDoctor.js) prints what this project can actually call.
 */
const FALLBACK = {
  // Verified callable on this project: the 3.x families are listed in
  // us-central1 and every one of them refuses with 404.
  vertex: "gemini-2.5-flash",
  /**
   * The same model on AI Studio, on purpose. Every prompt the studio pipeline
   * sends — the frame reader, the pointer checks, the crop question — was
   * tuned and validated against gemini-2.5-flash, and changing the provider
   * must not quietly change the model under them as well. A newer model is a
   * deliberate GEMINI_MODEL change, measured on the labelled recordings first.
   */
  aistudio: "gemini-2.5-flash",
};

const first = (...vals) => vals.map((v) => String(v || "").trim()).find(Boolean) || "";

/**
 * The model each kind of call uses.
 *
 * `GEMINI_MODEL` sets all four at once, which is what you want when a project
 * can only reach one. The specific variables win over it.
 */
export const MODEL = (() => {
  const all = first(process.env.GEMINI_MODEL);
  const base = all || FALLBACK[PROVIDER];
  return {
    text: first(process.env.GEMINI_TEXT_MODEL, process.env.GEMINI_AUDIO_MODEL, process.env.GEMINI_VIDEO_MODEL, base),
    vision: first(process.env.GEMINI_VISION_MODEL, process.env.GEMINI_TEXT_MODEL, base),
    audio: first(process.env.GEMINI_AUDIO_MODEL, process.env.GEMINI_TEXT_MODEL, process.env.GEMINI_VIDEO_MODEL, base),
    video: first(process.env.GEMINI_VIDEO_MODEL, process.env.GEMINI_TEXT_MODEL, base),
  };
})();

/** One line for the boot log: which model every kind of call will ask for. */
export function describeModels() {
  const uniq = [...new Set(Object.values(MODEL))];
  if (uniq.length === 1) return uniq[0];
  return Object.entries(MODEL).map(([k, v]) => `${k}=${v}`).join(" ");
}

/** For the startup log and the health endpoint: what this process will do. */
export function describeProvider() {
  if (isVertex()) return "vertex (project " + (PROJECT || "from environment") + ", " + REGIONS.join(", ") + ")";
  const n = KEYS().length;
  return "aistudio (" + n + " key" + (n === 1 ? "" : "s") + ")";
}

/** Whether the process is configured well enough to make a call at all. */
export function providerReady() {
  return isVertex() ? true : KEYS().length > 0;
}

/* ────────────────────────────────────────────────────────────────────────────
   The request budget
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Requests a minute this process may make against ONE bucket.
 *
 * Deliberately a budget we set rather than a limit we discover. Discovering it
 * means sending requests until Google refuses, and every refusal costs the
 * round trip, the retry, and — while four workers discover it at once — a burst
 * that puts the next minute's window in debt too.
 *
 * Set it below the quota actually granted. The Quotas page under Vertex AI says
 * what that is; a new project is often far lower than the documented default
 * until quota is requested.
 */
/**
 * ── THE DEFAULTS FOLLOW THE PROVIDER ─────────────────────────────────────────
 * 60 a minute and 4 in flight was sized for a Vertex testing project with a
 * small quota. AI Studio on a paid tier grants far more (gemini-2.5-flash: 1,000
 * a minute on tier 1), and a studio analysis is a few dozen requests — frames,
 * pointer checks, the crop question, the audit — that were queueing behind a
 * budget nobody had. 600 a minute leaves room under the tier for everything
 * else on the same key (the server shares it: buckets live in Redis). Each is
 * still overridden by its environment variable.
 */
const DEFAULTS = PROVIDER === "aistudio" ? { rpm: 600, burst: 60, concurrency: 16 } : { rpm: 60, burst: 10, concurrency: 4 };
const RPM = Math.max(1, num(process.env.GEMINI_RPM, DEFAULTS.rpm));
/** Burst allowed above the steady rate, in requests. */
const BURST = clamp(num(process.env.GEMINI_BURST, Math.min(RPM, DEFAULTS.burst)), 1, Math.max(1, RPM));
/** Simultaneous in-flight requests, across every caller in this process. */
const CONCURRENCY = Math.max(1, int(process.env.GEMINI_CONCURRENCY, DEFAULTS.concurrency));
/** Attempts per request, including the first. */
const ATTEMPTS = Math.max(1, int(process.env.GEMINI_ATTEMPTS, 5));
/**
 * The longest one request may spend waiting, across every wait it does.
 *
 * Twenty minutes by default, which sounds absurd until the quota is one request
 * a minute and four frames are queued in front of this one. The alternative is
 * failing a pass that would have succeeded, and a frame that comes back late is
 * worth considerably more than one that does not come back at all.
 */
const MAX_WAIT_MS = Math.max(1000, int(process.env.GEMINI_MAX_WAIT_MS, 20 * 60 * 1000));
/** How long a 429 puts the whole bucket to sleep when the server named no delay. */
const DEFAULT_COOLDOWN_MS = Math.max(1000, int(process.env.GEMINI_COOLDOWN_MS, 30000));

const RKEY = (bucket) => "hg:ai:bucket:" + bucket;
const CKEY = (bucket) => "hg:ai:cool:" + bucket;

/**
 * A token bucket, in Lua so the read, the refill and the take are one step.
 *
 * Returns the milliseconds to wait: 0 when a token was taken. Two processes
 * running this against the same Redis share one budget, which is the only way a
 * per-project quota can be respected by more than one worker.
 */
const TAKE = [
  "local key, cap, perMs, now = KEYS[1], tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])",
  "local h = redis.call('HMGET', key, 'tokens', 'ts')",
  "local tokens, ts = tonumber(h[1]), tonumber(h[2])",
  "if tokens == nil or ts == nil then tokens = cap; ts = now end",
  "if now > ts then tokens = math.min(cap, tokens + (now - ts) * perMs) end",
  "local wait = 0",
  "if tokens >= 1 then",
  "  tokens = tokens - 1",
  "else",
  "  wait = math.ceil((1 - tokens) / perMs)",
  "end",
  "redis.call('HMSET', key, 'tokens', tokens, 'ts', now)",
  "redis.call('PEXPIRE', key, 300000)",
  "return wait",
].join("\n");

/** The same arithmetic for a process with no Redis. Same shape, one process. */
const _local = new Map();
function takeLocal(bucket, cap, perMs, now) {
  const b = _local.get(bucket) || { tokens: cap, ts: now };
  if (now > b.ts) b.tokens = Math.min(cap, b.tokens + (now - b.ts) * perMs);
  b.ts = now;
  let wait = 0;
  if (b.tokens >= 1) b.tokens -= 1;
  else wait = Math.ceil((1 - b.tokens) / perMs);
  _local.set(bucket, b);
  return wait;
}

const _cool = new Map();

/** Milliseconds left on this bucket's cooldown, or 0. */
async function coolingFor(bucket) {
  const until = _cool.get(bucket) || 0;
  const local = Math.max(0, until - Date.now());
  if (!redis) return local;
  try {
    const ttl = await redis.pttl(CKEY(bucket));
    return Math.max(local, ttl > 0 ? ttl : 0);
  } catch {
    return local;
  }
}

/**
 * Put a bucket to sleep.
 *
 * ── ONE WORKER'S 429 IS EVERY WORKER'S 429 ──────────────────────────────────
 * The quota belongs to the project, not to the request that happened to hit it.
 * Without this, four concurrent workers each discover the closed window
 * separately, each burns its own attempts, and the retries land together and
 * close it again. Marking the bucket means the other three wait before they
 * ask, and through Redis it means the other processes do too.
 */
async function cool(bucket, ms) {
  const until = Date.now() + ms;
  _cool.set(bucket, Math.max(_cool.get(bucket) || 0, until));
  if (!redis) return;
  try {
    await redis.set(CKEY(bucket), "1", "PX", Math.ceil(ms), "NX");
  } catch {
    /* Redis being unavailable must never stop a request; the local map holds. */
  }
}

/** Wait until this bucket has a request to give, or the deadline passes. */
async function budget(bucket, deadline, onWait) {
  const perMs = RPM / 60000;
  for (;;) {
    const cooling = await coolingFor(bucket);
    if (cooling > 0) {
      const left = deadline - Date.now();
      if (left <= 0) throw rateError("still cooling down for " + Math.round(cooling / 1000) + "s");
      onWait?.(Math.min(cooling, left), "cooling down");
      await sleep(Math.min(cooling, left, 5000));
      continue;
    }

    let wait = 0;
    const now = Date.now();
    if (redis) {
      try {
        wait = num(await redis.eval(TAKE, 1, RKEY(bucket), BURST, perMs, now));
      } catch {
        wait = takeLocal(bucket, BURST, perMs, now);
      }
    } else {
      wait = takeLocal(bucket, BURST, perMs, now);
    }
    if (wait <= 0) return;

    const left = deadline - Date.now();
    if (left <= 0) throw rateError("the budget is " + RPM + "/min and the wait ran past the deadline");
    onWait?.(Math.min(wait, left), "waiting for the request budget");
    await sleep(Math.min(wait, left, 5000));
  }
}

function rateError(why) {
  const err = new Error("rate limited locally: " + why);
  err.status = 429;
  err.local = true;
  return err;
}

/* ────────────────────────────────────────────────────────────────────────────
   In flight
   ──────────────────────────────────────────────────────────────────────────── */

let _inFlight = 0;
const _waiting = [];

async function enter() {
  if (_inFlight < CONCURRENCY) {
    _inFlight++;
    return;
  }
  await new Promise((resolve) => _waiting.push(resolve));
  _inFlight++;
}

function leave() {
  _inFlight = Math.max(0, _inFlight - 1);
  const next = _waiting.shift();
  if (next) next();
}

/* ────────────────────────────────────────────────────────────────────────────
   What the server said when it refused
   ──────────────────────────────────────────────────────────────────────────── */

const statusOf = (err) => num(err?.status ?? err?.code ?? err?.response?.status, 0);

/**
 * Whether asking again could possibly work.
 *
 * Unchanged in spirit from the version in services/edit/gemini.js, with the
 * additions Vertex needs: RESOURCE_EXHAUSTED and UNAVAILABLE answered by name,
 * and a socket that died without a status treated as retryable, because a
 * dropped connection says nothing about the request.
 */
/**
 * Out of money, as opposed to going too fast.
 *
 * ── THESE LOOK IDENTICAL AND COULD NOT BE MORE DIFFERENT ─────────────────────
 * Both arrive as RESOURCE_EXHAUSTED. One means "ask again in thirty seconds"
 * and the other means "there is no money in this account". Waiting helps the
 * first and is pure waste on the second, and the test below was matching the
 * status name rather than reading the message:
 *
 *   {"error":{"code":402,"message":"Your prepayment credits are depleted...",
 *             "status":"RESOURCE_EXHAUSTED"}}
 *
 * That was retried four times, thirty seconds apart, and it put the whole
 * bucket to sleep for each of them — two minutes of a pass stalled on an answer
 * that was never going to change. A 402 is a permanent refusal wearing a
 * temporary one's status code.
 */
function outOfCredit(err) {
  if (statusOf(err) === 402) return true;
  const msg = String(err?.message || "").toLowerCase();
  return /prepayment|credits are depleted|billing|payment required|free tier|quota_exceeded.*billing/.test(msg);
}

export function retryable(err) {
  // Checked before anything else: it arrives as a 429-shaped error and must not
  // be treated as one.
  if (outOfCredit(err)) return false;
  const status = statusOf(err);
  if (status === 429 || status >= 500) return true;
  if (status === 401 || status === 403 || status === 400 || status === 404) return false;
  const msg = String(err?.message || "").toLowerCase();
  return /unavailable|overloaded|resource_exhausted|deadline|econnreset|etimedout|socket hang up|fetch failed|unexpected end|json/.test(
    msg
  );
}

/**
 * How long the server asked us to wait, in milliseconds, or 0 when it did not.
 *
 * ── THE NUMBER IS IN THE ERROR AND IT WAS BEING THROWN AWAY ─────────────────
 * Both APIs attach a google.rpc.RetryInfo to a 429 — "retryDelay": "41s" — and
 * an HTTP Retry-After header often comes with it. That is the server telling us
 * exactly when the window reopens. Guessing instead, with a few hundred
 * milliseconds of exponential backoff, is guessing against an answer we were
 * already given.
 */
export function retryAfterMs(err) {
  const header =
    err?.response?.headers?.get?.("retry-after") ??
    err?.headers?.["retry-after"] ??
    err?.headers?.get?.("retry-after");
  if (header) {
    const secs = Number(header);
    if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
    const when = Date.parse(header);
    if (Number.isFinite(when)) return Math.max(0, when - Date.now());
  }

  // The SDK stringifies the error body into the message, so the RetryInfo is
  // usually only reachable by reading it back out of the text.
  let extra = "";
  try {
    extra = JSON.stringify(err?.response ?? err?.error ?? "");
  } catch {
    extra = "";
  }
  const m = (String(err?.message || "") + " " + extra).match(/"?retryDelay"?\s*[:=]\s*"?(\d+(?:\.\d+)?)s/i);
  return m ? Math.round(parseFloat(m[1]) * 1000) : 0;
}

/** Exponential, with jitter, because four workers backing off in step is a burst. */
function backoffMs(attempt) {
  const base = Math.min(60000, 1000 * 2 ** (attempt - 1));
  return Math.round(base * (0.5 + Math.random()));
}

/* ────────────────────────────────────────────────────────────────────────────
   The call
   ──────────────────────────────────────────────────────────────────────────── */

const inRate = () => num(process.env.GEMINI_USD_PER_M_INPUT, 1.5);
const outRate = () => num(process.env.GEMINI_USD_PER_M_OUTPUT, 9.0);

/**
 * One request, exactly as the SDK would take it, waited for and retried.
 *
 * ── THE LOWEST LEVEL, AND WHY IT IS EXPOSED ──────────────────────────────────
 * `config` is passed through untouched. Six services in this codebase each grew
 * their own client with their own config — a thinking budget the script writer
 * sets from the environment, a temperature the voice profiler varies by mode —
 * and moving them onto one client must not quietly normalise any of that. So
 * this takes the request they already build and adds the two things they were
 * all missing: a shared budget, and waiting properly when told to wait.
 *
 * @returns {Promise<{ res, usd, input, output }>}
 */
/**
 * Models that refuse to have their thinking turned off.
 *
 * ── EVERY PROMPT HERE ASKS FOR thinkingBudget: 0, AND SOME MODELS REFUSE ─────
 * Turning thinking off is measured and deliberate — it bills at the output rate
 * and changes nothing on a mechanical reading task, which is all this product
 * asks for. But the pro tier will not accept it:
 *
 *   400 "Unable to submit request because The model does not support setting
 *        thinking_budget to 0."
 *
 * That is a quarrel about configuration, not a missing model or a missing
 * permission, and failing a whole pass over it would be absurd. So the refusal
 * is caught once per model, remembered, and the request goes again without the
 * thinking config — after which that model simply costs more, which is the
 * honest consequence of choosing it.
 */
const _noZeroThinking = new Set();
const refusesZeroThinking = (err) =>
  /thinking_budget/i.test(String(err?.message || "")) && statusOf(err) === 400;

export async function request({ model, contents, config = {}, onWait = null } = {}) {
  const deadline = Date.now() + MAX_WAIT_MS;
  let lastErr = null;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const { client, bucket, where } = pick();
    await budget(bucket, deadline, onWait);
    await enter();
    let failed = null;
    try {
      const use =
        _noZeroThinking.has(model) && config.thinkingConfig?.thinkingBudget === 0
          ? (({ thinkingConfig, ...rest }) => rest)(config)
          : config;
      const res = await client.models.generateContent({ model, contents, config: use });
      const u = res?.usageMetadata || {};
      const input = num(u.promptTokenCount);
      const output = num(u.candidatesTokenCount) + num(u.thoughtsTokenCount);
      return { res, usd: (input / 1e6) * inRate() + (output / 1e6) * outRate(), input, output };
    } catch (err) {
      failed = err;
      lastErr = err;
    } finally {
      leave();
    }

    /**
     * Learned, then immediately acted on: this attempt is not counted against
     * the budget of attempts, because nothing was wrong with the request except
     * a field this model does not take, and the next line removes it.
     */
    if (refusesZeroThinking(failed) && !_noZeroThinking.has(model)) {
      _noZeroThinking.add(model);
      console.warn(`[ai] ${model} will not accept thinkingBudget: 0; sending without it (it will cost more)`);
      attempt--;
      continue;
    }

    if (!retryable(failed) || attempt === ATTEMPTS) break;

    /**
     * ── A 429 IS A SCHEDULE, NOT AN ERROR ───────────────────────────────────
     * The server's own delay wins over anything computed here, and the whole
     * bucket sleeps for it rather than this one request. An overload (5xx) is
     * different: nothing is exhausted, so only this request backs off.
     */
    const told = retryAfterMs(failed);
    const status = statusOf(failed);
    const exhausted = status === 429 || /resource_exhausted/i.test(String(failed?.message || ""));
    const nap = exhausted ? told || DEFAULT_COOLDOWN_MS : Math.max(told, backoffMs(attempt));
    if (exhausted) await cool(bucket, nap);

    const left = deadline - Date.now();
    if (left <= 0) break;
    if (exhausted) {
      console.warn(
        "[ai] " + where + " is rate limited; waiting " + Math.round(Math.min(nap, left) / 1000) +
          "s (attempt " + attempt + "/" + ATTEMPTS + ")"
      );
    }
    onWait?.(Math.min(nap, left), exhausted ? "rate limited" : "retrying");
    await sleep(Math.min(nap, left));
  }

  /**
   * ── SAY WHICH GOOGLE REFUSED, AND WHY ─────────────────────────────────────
   * A billing refusal is the one failure where the message matters more than
   * the stack: it names an account somebody has to go and top up, and the
   * caller's own log line ("arbitratePress at 2.38s failed: {…}") buries it in
   * a JSON blob. Named here, once, with the provider attached — because the
   * most likely reason to see an AI Studio billing error at all is that this
   * process is not on the provider its operator thinks it is.
   */
  if (outOfCredit(lastErr)) {
    console.error(
      `[ai] ${PROVIDER} refused: out of credit, not rate limited. ` +
        (PROVIDER === "aistudio"
          ? "Set GEMINI_PROVIDER=vertex to use the Cloud project instead."
          : "Check billing on the Vertex project.")
    );
  }
  throw lastErr || new Error("the model call failed for no stated reason");
}

/**
 * One request, from parts. The response, not the parse.
 *
 * ── WHY THE RAW RESPONSE IS REACHABLE AT ALL ─────────────────────────────────
 * Almost every caller wants generateJson() below. transcribeYouTube() does not:
 * a long transcript can come back as valid JSON that simply stops, and it
 * salvages the text with a string match rather than throwing away an expensive
 * read over a missing brace. That salvage needs the raw text, and it should not
 * have to build its own client — and therefore go unbudgeted and unretried —
 * to get it.
 *
 * @param {object}   o
 * @param {string}   o.model
 * @param {Array}    o.parts              the request's content parts
 * @param {number}   [o.maxOutputTokens]
 * @param {number}   [o.temperature]
 * @param {number}   [o.thinkingBudget]   0 everywhere in this product; see below
 * @param {boolean}  [o.json]             ask for application/json
 * @param {object}   [o.schema]           a response schema the model is held to — the
 *                                        shape, and limits like an array's maxItems,
 *                                        enforced while it writes rather than hoped for
 * @param {Function} [o.onWait]           (ms, why) — so a pass can say it is waiting
 */
export function generate({
  model,
  parts,
  maxOutputTokens = 16384,
  temperature = 0.1,
  thinkingBudget = 0,
  json = true,
  schema = null,
  onWait = null,
} = {}) {
  return request({
    model,
    contents: [{ role: "user", parts }],
    config: {
      temperature,
      ...(json ? { responseMimeType: "application/json" } : {}),
      ...(json && schema ? { responseSchema: schema } : {}),
      maxOutputTokens,
      // Measured in services/geminiClient.js and again in the editor: thinking
      // bills at the output rate and changes nothing on a mechanical reading
      // task. Every prompt that reaches this helper is one.
      thinkingConfig: { thinkingBudget },
    },
    onWait,
  });
}

/**
 * A reply that stops in the middle, closed off so the part that arrived can be read.
 *
 * ── A MISSING BRACE THREW AWAY THE WHOLE FRAME ───────────────────────────────
 * Seen in production:
 *
 *   [studio] readFrames batch 8 failed: Expected ',' or ']' after array
 *            element in JSON at position 3316
 *   [studio] vision batch 8 answered 0 of 1 frames; asking again one at a time
 *
 * That error is what JSON.parse says when a document stops immediately after a
 * complete element inside an array — a truncated reply, not a malformed one.
 * The model had already named most of the controls on that frame and every one
 * of them was discarded over the closing bracket, the call was billed, and the
 * frame was read again from scratch.
 *
 * This is the same salvage transcribeYouTube() has always done for transcripts,
 * and generate()'s own comment says why it exists: it "salvages the text with a
 * string match rather than throwing away an expensive read over a missing
 * brace". Every other caller in this product went through JSON.parse bare.
 *
 * The text is walked once, tracking strings and escapes so a brace inside a
 * label is not mistaken for structure, and cut back to the last point where a
 * container held nothing but complete elements — a comma, or a bracket that
 * closed. The containers open at that point are then closed. Nothing is
 * invented: what comes back is a prefix of what the model actually said.
 *
 * @returns {string|null} null when the text is not a truncated container
 */
export function closeTruncated(text) {
  const s = String(text || "");
  const stack = [];
  let inStr = false;
  let esc = false;
  let safe = -1;
  let safeStack = null;
  // Only inside a container, and only where an element has just finished.
  const mark = (i) => {
    if (stack.length) {
      safe = i;
      safeStack = stack.slice();
    }
  };

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "{" || c === "[") { stack.push(c === "{" ? "}" : "]"); continue; }
    if (c === "}" || c === "]") { stack.pop(); mark(i + 1); continue; }
    // Cut BEFORE the comma: everything up to it is complete, what follows it
    // is the element that never finished arriving.
    if (c === ",") { mark(i); continue; }
  }

  // Balanced already, or nothing complete ever closed: not something to repair.
  if (!stack.length || safe < 0 || !safeStack) return null;

  let out = s.slice(0, safe).replace(/,\s*$/, "");
  for (let i = safeStack.length - 1; i >= 0; i--) out += safeStack[i];
  return out;
}

/**
 * A reply that dropped a comma, put back.
 *
 * ── THE OTHER WAY A MODEL BREAKS JSON, AND THE COMMONER ONE ──────────────────
 * closeTruncated() mends a document that STOPS. This one mends a document that
 * is complete and wrong in the middle, which is what production actually keeps
 * producing:
 *
 *   [studio] readFrames batch 5 failed: Expected ',' or ']' after array element
 *            in JSON at position 4389 — 7618 characters … unrepairable
 *
 * 4389 of 7618: three thousand characters of valid reply AFTER the fault, so
 * nothing was cut off. "Expected ',' or ']' after array element" in mid-
 * document has one overwhelming cause in this product's prompts, and it is the
 * four-number box every element carries — the model writes
 *
 *     "bbox": [0.039 0.240 0.106 0.050]
 *
 * and leaves the commas out. JSON.parse says exactly that sentence for exactly
 * that input, and the whole frame is then thrown away over three characters.
 *
 * The text is walked once, tracking strings and escapes so a space inside a
 * label is untouched, and a comma is inserted wherever one value ends and
 * another begins inside a container with nothing between them. Nothing is
 * reordered and nothing is invented: the only edit is a separator where the
 * grammar already required one.
 *
 * @returns {string|null} null when there was nothing to put back
 */
export function mendCommas(text) {
  const s = String(text || "");
  let out = "";
  let inStr = false;
  let esc = false;
  // The last thing that mattered was a complete value, so the next one needs a
  // separator before it.
  let afterValue = false;
  let depth = 0;
  let mended = 0;

  const startsValue = (c) =>
    c === '"' || c === "{" || c === "[" || c === "-" || (c >= "0" && c <= "9") ||
    c === "t" || c === "f" || c === "n";
  const inToken = (c) => c !== undefined && /[0-9a-zA-Z.+-]/.test(c);

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') { inStr = false; afterValue = true; }
      continue;
    }
    if (c === " " || c === "\n" || c === "\r" || c === "\t") { out += c; continue; }

    // Only ever INSIDE something. Two values at the top level are a different
    // kind of broken and guessing at it would be inventing structure.
    if (afterValue && depth > 0 && startsValue(c)) { out += ","; mended++; }

    if (c === '"') { inStr = true; out += c; afterValue = false; continue; }
    if (c === "{" || c === "[") { depth++; out += c; afterValue = false; continue; }
    if (c === "}" || c === "]") { depth = Math.max(0, depth - 1); out += c; afterValue = true; continue; }
    // A separator of either kind: what follows is not a value that needs one.
    if (c === "," || c === ":") { out += c; afterValue = false; continue; }

    // A bare token — a number, or true/false/null. It is complete once the next
    // character cannot belong to it.
    out += c;
    afterValue = !inToken(s[i + 1]);
  }

  return mended > 0 ? out : null;
}

/**
 * A bracket closed with the wrong character, put right.
 *
 * ── THE THIRD SHAPE, FOUND BY ELIMINATION ────────────────────────────────────
 * Three malformed replies in a row gave the same parser complaint mid-document
 * — "Expected ',' or ']' after array element" at 1555 of 5969, at 3827 of 8950,
 * at 4389 of 7618 — and mendCommas() repaired none of them. Enumerating what
 * else produces exactly that sentence leaves a short list, and only one item on
 * it is something a model writing this product's prompts does constantly:
 *
 *     "bbox": [0.039, 0.240, 0.106, 0.050}
 *
 * A four-number box is the only array in the reply that appears hundreds of
 * times, and closing it with the wrong bracket is an ordinary slip. The parser
 * is then inside an array looking for `,` or `]` and finds `}`.
 *
 * The repair is local and total: walk with a stack, and where a closer does not
 * match the bracket it is closing, emit the one that does. Nothing is moved and
 * no structure is invented — the nesting the model actually wrote is what
 * decides the answer, and a reply whose brackets all match is left alone.
 *
 * ── AND IF THIS IS THE WRONG GUESS, THE LOG SAYS SO ──────────────────────────
 * This is a hypothesis reached by elimination, not a fault anybody has read off
 * a real reply. So the failure path now prints the structure around the break
 * (see `shape` below). If these carry on, that window names the real shape and
 * the guessing stops.
 *
 * @returns {string|null} null when every bracket already matched
 */
export function mendClosers(text) {
  const s = String(text || "");
  let out = "";
  let inStr = false;
  let esc = false;
  const stack = [];
  let fixed = 0;

  for (const c of s) {
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === "{" || c === "[") { stack.push(c); out += c; continue; }
    if (c === "}" || c === "]") {
      const open = stack.pop();
      // Nothing open: a stray closer is a different kind of broken and guessing
      // at it would be inventing structure. Left exactly as it came.
      if (!open) { out += c; continue; }
      const right = open === "[" ? "]" : "}";
      if (right !== c) fixed++;
      out += right;
      continue;
    }
    out += c;
  }

  return fixed > 0 ? out : null;
}

/** Why the model stopped, when it says. MAX_TOKENS, SAFETY, RECITATION, STOP. */
const stoppedBecause = (res) => String(res?.candidates?.[0]?.finishReason || "");

/**
 * What the output budget was actually spent on.
 *
 * ── THINKING COMES OUT OF THE SAME ALLOWANCE AS THE ANSWER ───────────────────
 * Worth naming in the log, because it is the one cause of a short reply that
 * looks like nothing at all from the outside. maxOutputTokens covers thoughts
 * AND text, so a model that thinks for most of it has little left to answer
 * with and stops mid-sentence — with plenty of nominal budget on paper. Every
 * prompt here asks for thinkingBudget 0 for exactly that reason, and a model
 * that refuses the field (see _noZeroThinking) silently goes back to thinking.
 */
const spentOn = (res) => {
  const u = res?.usageMetadata || {};
  const thoughts = num(u.thoughtsTokenCount);
  const said = num(u.candidatesTokenCount);
  return thoughts > 0
    ? `${said} tokens of answer after ${thoughts} of thinking`
    : `${said} tokens of answer`;
};

/**
 * One request for JSON, parsed. What almost everything in this product wants.
 *
 * ── AND WHEN THE PARSE FAILS, IT SAYS WHY ────────────────────────────────────
 * The bare JSON.parse that used to be here reported the parser's complaint and
 * nothing else, which is the one thing that does not tell you what to do about
 * it. "Expected ',' after array element" reads as a bad model when it usually
 * means the reply was cut off, and whether it was cut off for length, for a
 * safety filter, or not at all is the difference between raising a token cap,
 * fixing a prompt, and looking somewhere else entirely. The model says which;
 * nothing was reading it.
 *
 * @returns {Promise<{ json, usd, input, output }>}
 */
export async function generateJson(opts) {
  const { res, usd, input, output } = await generate({ ...opts, json: true });
  const text = res?.text || "{}";

  try {
    return { json: JSON.parse(text), usd, input, output };
  } catch (err) {
    const why = stoppedBecause(res);
    /**
     * ── THE TWO WAYS A REPLY BREAKS, AND BOTH AT ONCE ────────────────────────
     * A missing separator is repaired first because it is the commoner fault
     * and it can sit anywhere in the document; closing a truncated reply is
     * second; and a long reply can easily be both — a dropped comma early on
     * and the end cut off — so the combination is tried last rather than
     * failing a document each half could have saved.
     *
     * Each repair returns null when it has nothing to do, so an ordinary
     * malformed reply costs two walks of a string and no guesses.
     */
    const both = (...fns) => (t) => {
      let v = t;
      let any = false;
      for (const fn of fns) {
        const next = fn(v);
        if (next) { v = next; any = true; }
      }
      return any ? v : null;
    };
    const repairs = [
      ["a separator was put back", mendCommas],
      ["a bracket was closed properly", mendClosers],
      ["it was closed off", closeTruncated],
      ["a separator and a bracket were put right", both(mendCommas, mendClosers)],
      ["it was put right and closed off", both(mendCommas, mendClosers, closeTruncated)],
    ];
    for (const [what, repair] of repairs) {
      const fixed = repair(text);
      if (!fixed) continue;
      try {
        const json = JSON.parse(fixed);
        // Named, because "a reply" from somewhere in the product is a warning
        // nobody can act on: which prompt ran away is the whole diagnosis.
        console.warn(
          `[ai] ${opts.label ? opts.label + ": " : ""}a reply would not parse (${why || "no reason given"}, ${spentOn(res)}) and ${what}: ` +
            `${fixed.length} characters from ${text.length}`
        );
        return { json, usd, input, output };
      } catch {
        /* This repair did not parse either. Try the next, then report honestly. */
      }
    }
    /**
     * The call was made and billed whatever the reply looked like, so the cost
     * travels with the failure — ask() in vision.js reads it off the error to
     * keep the spend counter honest through a pass that fails.
     */
    /**
     * Where the parser gave up, against how much there was. At the very end it
     * is a truncation; well before it, the reply arrived whole and malformed,
     * and those want opposite fixes. The first version of this message printed
     * only the length, and a mid-document fault was read as a cut-off reply for
     * a day because of it.
     */
    /**
     * ── AND WHAT THE BREAK ACTUALLY LOOKS LIKE ───────────────────────────────
     * Twice now a malformed reply has been diagnosed by reasoning about which
     * fault it PROBABLY was, and the second guess was wrong: the message said
     * "mid-reply: arrived whole and malformed", the missing-comma repair ran,
     * and it still would not parse. Guessing again is not a plan.
     *
     * So the window around the break is logged — with every string's CONTENTS
     * replaced by an ellipsis. That is not only a privacy measure, though it is
     * one: the model's reply describes whatever was on the creator's screen and
     * this goes to a server log. It is also the better diagnostic. The fault is
     * structural every time, and a window of pure structure shows it at a
     * glance where sixty characters of interface text would bury it.
     */
    const at = Number(/position (\d+)/.exec(err.message)?.[1]);
    const shape = (s) => {
      let out = "";
      let inStr = false;
      let esc = false;
      for (const c of s) {
        if (inStr) {
          if (esc) esc = false;
          else if (c === "\\") esc = true;
          else if (c === '"') { inStr = false; out += '…"'; }
          continue;
        }
        if (c === '"') { inStr = true; out += '"'; continue; }
        out += c === "\n" ? "⏎" : c;
      }
      // An unterminated string at the edge of the window closes itself.
      return inStr ? out + '…"' : out;
    };
    const window = Number.isFinite(at)
      ? " ── around the break: " +
        JSON.stringify(shape(text.slice(Math.max(0, at - 70), at)) + "  ⟪HERE⟫  " + shape(text.slice(at, at + 70)))
      : "";

    const where = Number.isFinite(at)
      ? ` — broke at ${at} of ${text.length} characters (${at > text.length - 16 ? "the end: cut off" : "mid-reply: arrived whole and malformed"})`
      : ` — ${text.length} characters`;

    throw Object.assign(
      new Error(
        err.message +
          (why && why !== "STOP" ? ` (the model stopped early: ${why})` : "") +
          where + `, ${spentOn(res)}, unrepairable` + window
      ),
      { usd, input, output, cause: err }
    );
  }
}

/**
 * The SDK's shape, backed by everything above.
 *
 * ── A SHIM, ON PURPOSE, AND NOT A PERMANENT ONE ──────────────────────────────
 * Five services build a request object by hand and call
 * `client().models.generateContent(...)` on it. Rewriting each of those call
 * sites to a new signature is five chances to change a temperature or drop a
 * thinking budget in a file nobody is testing this week, and the change that
 * actually matters — that they go through one budget and one provider — needs
 * none of it.
 *
 * So they keep their request objects and swap their client for this. What they
 * gain is Vertex, the shared rate limit, and waiting properly on a 429. What
 * they do not gain is the cost accounting, because they never asked for it;
 * `generateJson()` is where that lives and where a rewritten call site should
 * end up.
 */
export function legacyClient() {
  return {
    models: {
      generateContent: async (req) => (await request(req)).res,
    },
  };
}

/**
 * Runs `fn` over items, `size` at a time.
 *
 * Kept here so callers stop importing it from the editor's client. The size
 * they pass is their own fan-out; the real ceiling is CONCURRENCY and the
 * request budget above, both of which apply across every caller at once.
 */
export async function pool(items, size, fn) {
  const queue = items.map((item, i) => [item, i]);
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, size), queue.length) }, async () => {
      while (queue.length) {
        const [item, i] = queue.shift();
        await fn(item, i);
      }
    })
  );
}

/**
 * The budget, reachable for tests. Same pattern as locate.js `_debug`.
 *
 * A rate limiter is the one thing here that cannot be checked by looking at it:
 * whether it waits the right length of time is a statement about a clock, and
 * the only way to know is to run it against one.
 */
export const _test = { budget, cool, coolingFor };

/** For logs and diagnostics. Not a promise anyone should make to a caller. */
export const limits = () => ({
  provider: PROVIDER,
  rpm: RPM,
  burst: BURST,
  concurrency: CONCURRENCY,
  attempts: ATTEMPTS,
});

export default {
  PROVIDER,
  isVertex,
  describeProvider,
  providerReady,
  request,
  generate,
  generateJson,
  legacyClient,
  retryable,
  retryAfterMs,
  pool,
  limits,
};
