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
export const PROVIDER =
  String(process.env.GEMINI_PROVIDER || "vertex").trim().toLowerCase() === "aistudio"
    ? "aistudio"
    : "vertex";

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
const KEYS = () =>
  String(process.env.AISTUDIO_KEY || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

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
  if (!keys.length) throw new Error("AISTUDIO_KEY is not set");
  const key = keys[_cursor++ % keys.length];
  const id = "aistudio:" + key.slice(-6);
  if (!_clients.has(id)) _clients.set(id, new GoogleGenAI({ apiKey: key }));
  return { client: _clients.get(id), bucket: id, where: id };
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
const RPM = Math.max(1, num(process.env.GEMINI_RPM, 60));
/** Burst allowed above the steady rate, in requests. */
const BURST = clamp(num(process.env.GEMINI_BURST, Math.min(RPM, 10)), 1, Math.max(1, RPM));
/** Simultaneous in-flight requests, across every caller in this process. */
const CONCURRENCY = Math.max(1, int(process.env.GEMINI_CONCURRENCY, 4));
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
 * @param {Function} [o.onWait]           (ms, why) — so a pass can say it is waiting
 */
export function generate({
  model,
  parts,
  maxOutputTokens = 16384,
  temperature = 0.1,
  thinkingBudget = 0,
  json = true,
  onWait = null,
} = {}) {
  return request({
    model,
    contents: [{ role: "user", parts }],
    config: {
      temperature,
      ...(json ? { responseMimeType: "application/json" } : {}),
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
 * One request for JSON, parsed. What almost everything in this product wants.
 *
 * @returns {Promise<{ json, usd, input, output }>}
 */
export async function generateJson(opts) {
  const { res, usd, input, output } = await generate({ ...opts, json: true });
  return { json: JSON.parse(res?.text || "{}"), usd, input, output };
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
