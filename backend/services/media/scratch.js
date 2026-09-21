/**
 * scratch.js: where a job does its work on disk.
 *
 * ── WHY THIS IS NOT JUST os.tmpdir() ─────────────────────────────────────────
 * Every heavy job materialises the recording, writes frames, and writes an
 * export — gigabytes of sequential reads and writes, and the one thing ffmpeg
 * is most easily starved by. Where that lands matters, and `os.tmpdir()` gives
 * whatever the machine's default is, which is the wrong answer in both
 * directions:
 *
 *   on a VM          it is the boot disk, usually pd-balanced, and a 4K export
 *                    reading and writing there is disk-bound long before it is
 *                    CPU-bound. A Local SSD is several times faster and costs
 *                    very little, but nothing could point at it.
 *   in a container   /tmp is RAM. Cloud Run has no disk at all, so a 4 GB
 *                    recording is 4 GB of memory before any work starts, and
 *                    the job dies with an out-of-memory that names nothing.
 *
 * One variable, read in one place, so the answer can differ per deployment
 * without another code change:
 *
 *   STUDIO_TMPDIR=/mnt/localssd/lipi
 *
 * Unset, it behaves exactly as before.
 */
import os from "os";
import path from "path";
import fsp from "fs/promises";

/** The root every job's working directory is made under. */
export function scratchRoot() {
  const set = String(process.env.STUDIO_TMPDIR || "").trim();
  return set || os.tmpdir();
}

/**
 * A working directory for one job, created.
 *
 * @param {string} kind  "lipi-studio", "lipi-edit" — kept in the path so a
 *                       half-cleaned scratch disk can be read by a person
 * @param {string} id    the job id
 */
export async function jobDir(kind, id) {
  const dir = path.join(scratchRoot(), kind, String(id));
  await fsp.mkdir(dir, { recursive: true }).catch(() => {});
  return dir;
}

/**
 * How much room the scratch disk has, in bytes, or null when it cannot be read.
 *
 * Worth knowing at boot rather than at the moment a 4K export runs out of it:
 * ffmpeg's error when a write fails mid-encode is "Conversion failed!", which
 * names nothing and sends whoever reads it looking at the filter graph.
 */
export async function scratchFree() {
  try {
    const s = await fsp.statfs(scratchRoot());
    return { free: s.bavail * s.bsize, total: s.blocks * s.bsize };
  } catch {
    return null;
  }
}

export default { scratchRoot, jobDir, scratchFree };
