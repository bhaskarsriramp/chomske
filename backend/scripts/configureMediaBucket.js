/**
 * configureMediaBucket.js: set up MEDIA_BUCKET for the video editor. Run once.
 *
 *   node scripts/configureMediaBucket.js           show what would change
 *   node scripts/configureMediaBucket.js --apply   change it
 *
 * Two settings the editor cannot work without:
 *
 *   CORS       browsers upload chunks straight to the bucket and play previews
 *              from it. Without a CORS rule naming our origins, every chunk PUT
 *              is blocked by the browser before it leaves. `Range` must be in
 *              the exposed headers: the resumable protocol answers each chunk
 *              with how much it has, and the client resumes from that.
 *   lifecycle  a backstop. The app deletes a project's files EDIT_RETENTION_DAYS
 *              after it was last touched; this rule deletes anything under
 *              <MEDIA_PREFIX>/edit/ a week after that, so a crashed sweeper
 *              cannot leave footage lying around indefinitely.
 *
 * ── THE BUCKET IS SHARED WITH betaFounderProduction ──────────────────────────
 * setCorsConfiguration REPLACES a bucket's whole CORS list, and the other
 * project's browser reads depend on the rules already there. So this merges:
 * every existing rule is kept, a previous copy of OUR rule (recognised by its
 * x-goog-resumable header and our origins) is swapped for the current one, and
 * the lifecycle rule is added only if an identical one is not already present.
 * The lifecycle rule is scoped to our prefix and cannot match the other
 * project's objects.
 */
import "dotenv/config";
import { Storage } from "@google-cloud/storage";

const apply = process.argv.includes("--apply");
const name = String(process.env.MEDIA_BUCKET || "").trim();
if (!name) {
  console.error("MEDIA_BUCKET is not set.");
  process.exit(1);
}
const root = String(process.env.MEDIA_PREFIX || "lipi").replace(/^\/+|\/+$/g, "") || "lipi";

const origins = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (!origins.length) {
  console.error("CORS_ORIGINS is empty. Set it to the app's origins (e.g. https://tryclipo.com) first.");
  process.exit(1);
}
const retention = parseInt(process.env.EDIT_RETENTION_DAYS || "7", 10);

const ours = {
  origin: origins,
  method: ["GET", "HEAD", "PUT", "OPTIONS"],
  responseHeader: ["Content-Type", "Content-Length", "Content-Range", "Range", "Accept-Ranges", "x-goog-resumable"],
  maxAgeSeconds: 3600,
};
const rule = { action: { type: "Delete" }, condition: { age: retention + 7, matchesPrefix: [`${root}/edit/`] } };

const bucket = new Storage().bucket(name);
const [meta] = await bucket.getMetadata();

const isOurs = (r) =>
  (r.responseHeader || []).includes("x-goog-resumable") &&
  (r.origin || []).some((o) => origins.includes(o));
const existingCors = meta.cors || [];
const mergedCors = [...existingCors.filter((r) => !isOurs(r)), ours];

const existingRules = meta.lifecycle?.rule || [];
const hasRule = existingRules.some(
  (r) =>
    r.action?.type === "Delete" &&
    Number(r.condition?.age) === rule.condition.age &&
    JSON.stringify(r.condition?.matchesPrefix || []) === JSON.stringify(rule.condition.matchesPrefix)
);

console.log(`Bucket:  ${name}`);
console.log(`Prefix:  ${root}/edit/`);
console.log(`\nCORS now (${existingCors.length} rule${existingCors.length === 1 ? "" : "s"}):`, JSON.stringify(existingCors, null, 2));
console.log(`\nCORS after (${mergedCors.length}):`, JSON.stringify(mergedCors, null, 2));
console.log(`\nLifecycle: ${hasRule ? "our rule is already there" : `add ${JSON.stringify(rule)}`}`);

if (!apply) {
  console.log("\nDry run. Re-run with --apply to make these changes.");
  process.exit(0);
}

await bucket.setCorsConfiguration(mergedCors);
if (!hasRule) await bucket.addLifecycleRule(rule);
console.log("\nDone.");
