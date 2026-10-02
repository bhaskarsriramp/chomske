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
 * irrelevant.
 *
 * In order: REMOTION_BROWSER (an explicit path); a hand-downloaded shell in
 * launch/.browser (Windows, where Remotion's download kept failing); the one
 * `npx remotion browser ensure` put in launch/node_modules/.remotion. None of
 * those: null, and Remotion downloads its own as before.
 */
import fs from "fs";
import path from "path";
import { ROOT } from "./env.mjs";

function ensured() {
  const base = path.join(ROOT, "node_modules", ".remotion", "chrome-headless-shell");
  try {
    for (const plat of fs.readdirSync(base)) {
      for (const sub of fs.readdirSync(path.join(base, plat))) {
        for (const exe of ["chrome-headless-shell", "chrome-headless-shell.exe"]) {
          const p = path.join(base, plat, sub, exe);
          if (fs.existsSync(p)) return p;
        }
      }
    }
  } catch {
    /* not downloaded */
  }
  return null;
}

export function headlessShell() {
  const set = String(process.env.REMOTION_BROWSER || "").trim();
  if (set && fs.existsSync(set)) return set;
  const windows = path.join(ROOT, ".browser", "chrome-headless-shell-win64", "chrome-headless-shell.exe");
  if (fs.existsSync(windows)) return windows;
  return ensured();
}
