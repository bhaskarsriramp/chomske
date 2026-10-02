/**
 * browser.mjs: which headless Chrome this pipeline runs, decided in one place.
 *
 * ── WHY NOT LEAVE IT TO REMOTION ─────────────────────────────────────────────
 * Remotion keeps its downloaded browser in node_modules/.remotion beside the
 * package.json nearest the PROCESS'S working directory, not this folder's.
 * `npx remotion browser ensure`, run in launch/, puts it in
 * launch/node_modules/.remotion; the worker runs from backend/, so left alone
 * Remotion found nothing there and downloaded a second copy (92 MB) into
 * backend/node_modules, to be fetched yet again whenever that folder is
 * reinstalled. Pointing at launch's own copy makes the working directory
 * irrelevant. (Remotion downloads nothing when it is given a path that exists.)
 *
 * In order: REMOTION_BROWSER (an explicit path); a hand-downloaded shell in
 * launch/.browser (Windows, where Remotion's download kept failing); the one
 * `npx remotion browser ensure` put in launch/node_modules/.remotion. None of
 * those: null, and Remotion downloads its own as before.
 */
import fs from "fs";
import path from "path";
import { ROOT } from "./env.mjs";

const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};
const isFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/**
 * The shell inside a Remotion cache folder:
 *   <base>/<platform>/chrome-headless-shell-<platform>/chrome-headless-shell[.exe]
 * The folder also holds plain files (a VERSION file beside the platform
 * folders, seen on the VM). The first version of this listed every entry as
 * a folder, the VERSION file threw, the one try around the whole search gave
 * up, and Remotion downloaded its own copy again. Every entry is checked on
 * its own now.
 */
export function findShell(base) {
  if (!isDir(base)) return null;
  let platforms = [];
  try {
    platforms = fs.readdirSync(base).filter((p) => isDir(path.join(base, p)));
  } catch {
    return null;
  }
  for (const plat of platforms) {
    let subs = [];
    try {
      subs = fs.readdirSync(path.join(base, plat)).filter((s) => isDir(path.join(base, plat, s)));
    } catch {
      continue;
    }
    for (const sub of subs) {
      for (const exe of ["chrome-headless-shell", "chrome-headless-shell.exe"]) {
        const p = path.join(base, plat, sub, exe);
        if (isFile(p)) return p;
      }
    }
  }
  return null;
}

export function headlessShell() {
  const set = String(process.env.REMOTION_BROWSER || "").trim();
  if (set && isFile(set)) return set;
  const windows = path.join(ROOT, ".browser", "chrome-headless-shell-win64", "chrome-headless-shell.exe");
  if (isFile(windows)) return windows;
  return findShell(path.join(ROOT, "node_modules", ".remotion", "chrome-headless-shell"));
}
