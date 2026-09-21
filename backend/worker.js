/**
 * worker.js: the heavy work, in a process of its own.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * The queues used to run inside the API. That is fine while the heavy work is
 * ffmpeg — a child process, so Node is only waiting on a pipe — and it stopped
 * being fine when the pointer locator arrived. locate.js is plain synchronous
 * JavaScript that scores thousands of candidate positions per frame, and it is
 * measured at ninety-eight per cent of an analysis: a hundred and forty seconds
 * of it for a seventy-eight second recording.
 *
 * Every one of those frames blocks the event loop while it is scored. So one
 * creator analysing a demo made the API stutter for EVERYONE — requests queued
 * behind the search, socket heartbeats arrived late, and the editor felt frozen
 * to people who were not analysing anything. That is not a capacity problem and
 * no amount of extra machine fixes it; it is one process asked to do two jobs
 * with one thread.
 *
 * So: the API serves requests, this serves the queues, and they share nothing
 * but MongoDB and Redis. Progress still reaches the browser unchanged —
 * publishProgress() writes to Redis and the API's socket server relays it, which
 * is what it already did when both halves were in one process.
 *
 * ── RUNNING IT ───────────────────────────────────────────────────────────────
 *   pm2 start server.js --name api
 *   pm2 start worker.js --name worker
 *
 * The API no longer starts the queues unless RUN_WORKERS=true, so nothing runs
 * twice. One machine or several: a worker needs no inbound port, so it can move
 * to its own VM, or a container, without touching the API.
 *
 * ── MORE THAN ONE IS FINE ────────────────────────────────────────────────────
 * Jobs are claimed with an atomic findOneAndUpdate and held on a lease
 * (studioRunner.js), so two workers never take the same job and a worker that
 * dies has its jobs picked up when the lease lapses. Run as many as the machine
 * has cores for.
 */
import "dotenv/config";
import os from "os";
import connectToMongo from "./db.js";
import { startEditRunner } from "./services/edit/editRunner.js";
import { startStudioRunner } from "./services/studio/studioRunner.js";
import { describeProvider, describeModels, providerReady, limits } from "./services/ai/provider.js";
import redis, { isRedisEnabled } from "./redis.js";
import { scratchRoot, scratchFree, isTmpfs } from "./services/media/scratch.js";

const WHO = `${os.hostname()}:${process.pid}`;

/**
 * ── A WORKER THAT CANNOT REACH REDIS IS A WORKER NOBODY CAN SEE ──────────────
 * redis.js degrades quietly on purpose: the API must keep serving when
 * Memorystore is unreachable, and a rate limiter falling back to in-process is
 * the right answer there. For a worker it is the wrong answer twice over —
 * every progress update is published through Redis, so the editor would show a
 * demo stuck at "Starting" for the whole job and then jump to done; and the
 * model request budget would be counted per process rather than shared, so two
 * workers would spend twice the quota they were given.
 *
 * Neither failure is visible in a log anyone is reading. So a worker says so at
 * boot, loudly, once — and carries on, because a demo analysed without live
 * progress is still an analysed demo and refusing to start would be worse.
 */
async function checkRedis() {
  if (!isRedisEnabled()) {
    console.warn(
      "[worker] REDIS IS DISABLED. Progress will not reach the browser and the " +
        "model request budget is per-process. Fine for local work, wrong on a server."
    );
    return;
  }
  try {
    await redis.ping();
    console.log("[worker] redis reachable — progress and the request budget are shared");
  } catch (err) {
    console.error(
      "[worker] REDIS UNREACHABLE (" + err.message + "). The queues will still run, but the " +
        "editor will not show progress and each worker will spend the full request budget alone. " +
        "On Cloud Run this usually means VPC egress is not configured."
    );
  }
}

(async () => {
  try {
    await connectToMongo();
    await checkRedis();

    console.log(`[worker] ${WHO} — model provider: ${describeProvider()}`);
    console.log(`[worker] model: ${describeModels()}`);
    if (!providerReady()) {
      console.warn("[worker] the model provider is not configured; passes that need it will fail and refund");
    }
    const l = limits();
    console.log(`[worker] request budget ${l.rpm}/min per bucket, ${l.concurrency} in flight`);

    /**
     * ── WHERE THE GIGABYTES GO, SAID OUT LOUD ────────────────────────────────
     * STUDIO_TMPDIR is the one setting here whose default is actively wrong on
     * a modern Linux box: /tmp is tmpfs on Debian 13, so unset, every recording
     * a job downloads and every frame it writes goes into RAM. A 4K export then
     * competes with its own scratch for memory, and when the tmpfs fills the
     * write fails with ENOSPC — which ffmpeg reports as "Conversion failed!",
     * naming nothing and sending whoever reads it to look at the filter graph.
     *
     * It is also the only setting with no other symptom until that happens. So
     * it is printed, with how much room it has and whether it is memory.
     */
    const root = scratchRoot();
    const room = await scratchFree();
    const onRam = await isTmpfs(root);
    console.log(
      `[worker] scratch: ${root}` +
        (room ? ` — ${(room.free / 1e9).toFixed(0)} GB free of ${(room.total / 1e9).toFixed(0)} GB` : "") +
        (onRam ? "  ** THIS IS RAM (tmpfs). Set STUDIO_TMPDIR to a real disk. **" : "")
    );

    startEditRunner();
    startStudioRunner();
    console.log(`[worker] queues running (${os.cpus().length} cpu available)`);
  } catch (err) {
    console.error("[worker] failed to start:", err.message);
    process.exit(1);
  }
})();

/**
 * ── STOPPING ─────────────────────────────────────────────────────────────────
 * Nothing is force-killed. A job in flight keeps its lease while it finishes;
 * pm2 waits, and if it gives up first the lease simply lapses and another
 * worker claims the job. Exiting without this would leave a job "running" with
 * a live lease for ninety seconds before anyone could take it.
 */
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    console.log(`[worker] ${sig} — finishing what is in flight, then exiting`);
    setTimeout(() => process.exit(0), 100).unref();
  });
}
