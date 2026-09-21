/**
 * aiDoctor.js: why is the model not answering?
 *
 * Run on the VM, where the real env and the real credentials are:
 *   cd ~/lipi/backend && node scripts/aiDoctor.js
 *   cd ~/lipi/backend && node scripts/aiDoctor.js --regions=us-central1,europe-west4
 *
 * ── WHAT IT IS FOR ───────────────────────────────────────────────────────────
 * A model call that does not come back has six causes and they are almost
 * indistinguishable from the studio's own logs, which report them all as
 * "arbitratePress at 2.38s failed":
 *
 *   1. The process is on the wrong PROVIDER. An AI Studio billing error on a
 *      project that moved to Vertex weeks ago means GEMINI_PROVIDER never got
 *      set, and every other symptom below is a red herring.
 *   2. No CREDENTIALS. On Vertex that is ADC: the VM's service account, or
 *      GOOGLE_APPLICATION_CREDENTIALS locally. Arrives as a 401.
 *   3. No PERMISSION. The service account exists but lacks
 *      roles/aiplatform.user — or, far more often, the VM's access SCOPE does
 *      not include cloud-platform, which IAM cannot fix. Arrives as a 403.
 *   4. The API is not ENABLED on the project. Arrives as a 403 that names the
 *      service.
 *   5. The MODEL ID does not exist in that region, or the project has no access
 *      to it. Arrives as a 404 and is the one this script mostly exists for,
 *      because the fix is a name nobody can guess — the same model is not
 *      called the same thing on AI Studio and on Vertex, and availability
 *      differs per region.
 *   6. QUOTA. Arrives as a 429, and is the only one of the six that is not a
 *      configuration problem.
 *
 * So it reports the configuration, lists what the project can actually reach,
 * and then makes one real call per configured model and says what came back.
 *
 * ── IT SPENDS A FEW TOKENS, ON PURPOSE ───────────────────────────────────────
 * Unlike newsDoctor.js this is not read-only: the probe is a real generateContent
 * with a two-word prompt. Nothing else distinguishes "this model ID is valid" from
 * "this model ID is valid AND this project may call it", and the second is the
 * question. It is a fraction of a cent.
 */
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { isVertex, describeProvider, limits } from "../services/ai/provider.js";

const arg = (name, fallback = "") => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const PROJECT = String(
  process.env.VERTEX_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || ""
).trim();

const REGIONS = String(arg("regions", process.env.VERTEX_LOCATION || "us-central1"))
  .split(",").map((s) => s.trim()).filter(Boolean);

/**
 * The model each part of the product will ask for, resolved exactly as the code
 * resolves it. Reading the defaults out of the source rather than restating them
 * is the point: a doctor that tests a different name than the product uses is
 * worse than no doctor.
 */
function configured() {
  const vision = process.env.GEMINI_VISION_MODEL || process.env.GEMINI_TEXT_MODEL || "gemini-3.5-flash";
  const text = process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_AUDIO_MODEL || "gemini-3.5-flash";
  const audio = process.env.GEMINI_AUDIO_MODEL || vision;
  const video = process.env.GEMINI_VIDEO_MODEL || "gemini-3.5-flash";
  const byModel = new Map();
  const add = (id, who, envVar) => {
    if (!byModel.has(id)) byModel.set(id, { uses: [], envVars: new Set() });
    byModel.get(id).uses.push(who);
    byModel.get(id).envVars.add(envVar);
  };
  add(vision, "studio vision + the cross-check", "GEMINI_VISION_MODEL");
  add(text, "steps, narration, the reviewer, scripts, news", "GEMINI_TEXT_MODEL");
  add(audio, "captions, transcription", "GEMINI_AUDIO_MODEL");
  add(video, "YouTube transcription", "GEMINI_VIDEO_MODEL");
  return byModel;
}

function client(location) {
  return isVertex()
    ? new GoogleGenAI({ vertexai: true, ...(PROJECT ? { project: PROJECT } : {}), location })
    : new GoogleGenAI({ apiKey: String(process.env.AISTUDIO_KEY || "").split(",")[0].trim() });
}

const statusOf = (err) => err?.status ?? err?.code ?? err?.response?.status ?? 0;

/** The six causes above, told apart by what came back. */
function diagnose(err) {
  const s = statusOf(err);
  const m = String(err?.message || "").toLowerCase();
  if (s === 404 || /not_found|was not found/.test(m)) {
    return "NOT IN THIS REGION — the id is wrong, or the project has no access to it here";
  }
  if (s === 402 || /prepayment|credits are depleted|billing/.test(m)) {
    return "OUT OF CREDIT — this is billing, not rate limiting";
  }
  if (s === 429 || /resource_exhausted|quota/.test(m)) return "QUOTA — the id is fine, you are going too fast";
  if (/serviceusage|service_disabled|has not been used|is disabled/.test(m)) {
    return "API NOT ENABLED — gcloud services enable aiplatform.googleapis.com";
  }
  if (s === 403) return "NO PERMISSION — roles/aiplatform.user, and check the VM's cloud-platform scope";
  if (s === 401 || /could not load the default credentials|unauthenticated/.test(m)) {
    return "NO CREDENTIALS — ADC did not resolve (on a VM: is a service account attached?)";
  }
  if (s >= 500) return "the service is having a moment; try again";
  return "";
}

const short = (err) => String(err?.message || err).replace(/\s+/g, " ").slice(0, 200);

async function main() {
  console.log("");
  console.log("── Configuration ──────────────────────────────────────────────");
  console.log(`  provider     ${describeProvider()}`);
  const l = limits();
  console.log(`  budget       ${l.rpm} req/min per bucket, ${l.concurrency} in flight, ${l.attempts} attempts`);
  if (isVertex()) {
    console.log(`  project      ${PROJECT || "(unset — resolved from the environment or VM metadata)"}`);
    console.log(`  regions      ${REGIONS.join(", ")}`);
    console.log(`  credentials  ADC${process.env.GOOGLE_APPLICATION_CREDENTIALS ? ` from ${process.env.GOOGLE_APPLICATION_CREDENTIALS}` : " from the environment / VM metadata"}`);
    if (String(process.env.AISTUDIO_KEY || "").trim()) {
      console.log("  note         AISTUDIO_KEY is set and is NOT read on vertex. It is inert, not a fallback.");
    }
  } else {
    const n = String(process.env.AISTUDIO_KEY || "").split(",").filter((k) => k.trim()).length;
    console.log(`  keys         ${n}`);
    console.log("  note         GEMINI_PROVIDER is 'aistudio'. It defaults to 'vertex' — something is setting it.");
  }

  const wanted = configured();
  console.log("");
  console.log("  What the product will ask for:");
  for (const [id, { uses, envVars }] of wanted) {
    console.log(`    ${id}`);
    console.log(`        ${uses.join("; ")}`);
    console.log(`        set with: ${[...envVars].join(", ")}`);
  }

  /* ── What this project can actually reach ─────────────────────────────── */
  const available = new Map();
  for (const location of REGIONS) {
    console.log("");
    console.log(`── Models this project can reach in ${location} ───────────────`);
    let names = [];
    try {
      const pager = await client(location).models.list({ config: { queryBase: true, pageSize: 200 } });
      for await (const m of pager) {
        const name = String(m.name || "").split("/").pop();
        if (name) names.push(name);
      }
    } catch (err) {
      console.log(`  could not list them: ${short(err)}`);
      const why = diagnose(err);
      if (why) console.log(`  → ${why}`);
      console.log("");
      console.log("  Listing is not essential — the probes below still tell you what works.");
      continue;
    }

    names = [...new Set(names)].sort();
    available.set(location, new Set(names));
    const gemini = names.filter((n) => /^gemini/i.test(n));
    console.log(`  ${names.length} model(s), ${gemini.length} of them Gemini:`);
    for (const n of gemini) console.log(`    ${n}`);
    if (!gemini.length && names.length) {
      console.log("    (none — the Gemini families may need enabling in Model Garden for this project)");
    }
  }

  /* ── One real call each ───────────────────────────────────────────────── */
  console.log("");
  console.log("── Probing each configured model ──────────────────────────────");
  const working = new Map();
  let anyOk = false;

  for (const location of REGIONS) {
    const c = client(location);
    for (const [id] of wanted) {
      const label = isVertex() ? `${location}/${id}` : id;
      try {
        const res = await c.models.generateContent({
          model: id,
          contents: [{ role: "user", parts: [{ text: "Reply with the single word: ok" }] }],
          config: { temperature: 0, maxOutputTokens: 16, thinkingConfig: { thinkingBudget: 0 } },
        });
        const said = String(res?.text || "").trim().slice(0, 20) || "(empty)";
        const u = res?.usageMetadata || {};
        console.log(`  OK    ${label} → "${said}" (${u.promptTokenCount || 0}+${u.candidatesTokenCount || 0} tokens)`);
        anyOk = true;
        if (!working.has(id)) working.set(id, location);
      } catch (err) {
        console.log(`  FAIL  ${label} → ${statusOf(err) || "?"} ${short(err)}`);
        const why = diagnose(err);
        if (why) console.log(`        → ${why}`);
      }
    }
    if (!isVertex()) break; // one key, no regions to sweep
  }

  /* ── What to do about it ──────────────────────────────────────────────── */
  console.log("");
  console.log("── What to do ─────────────────────────────────────────────────");

  if (anyOk && working.size === wanted.size) {
    console.log("  Everything the product asks for answers. Nothing to change.");
    console.log("");
    return;
  }

  const broken = [...wanted.keys()].filter((id) => !working.has(id));
  if (broken.length) {
    console.log(`  ${broken.length} configured model id(s) did not answer: ${broken.join(", ")}`);

    // Suggest, from what the project CAN reach, the nearest thing to each.
    /**
     * ── BEING LISTED IS NOT THE SAME AS BEING CALLABLE ─────────────────────
     * The catalogue is what Google publishes in the region. Access is what this
     * project has been granted, and on a new project that is a much shorter
     * list — the newer families are all there in the listing and every one of
     * them answers generateContent with 404 "or your project does not have
     * access to it". Recommending from the listing alone therefore sends you to
     * a model that fails exactly the way the one you started with failed.
     *
     * So the candidates are PROBED, cheapest-looking first, and only ones that
     * actually answered are printed. It costs a handful of tokens per model and
     * it is the difference between advice and a guess.
     */
    const pool = [...new Set([...available.values()].flatMap((s) => [...s]))].filter((n) => /^gemini/i.test(n));
    // Anything specialised is not a general text/vision model, whatever it is
    // called: an image generator, a speech model, an embedder, a robotics head.
    const general = pool.filter((n) => !/image|tts|transcribe|live|embedding|robotics|omni|computer-use|preview-info/i.test(n));
    const flash = general.filter((n) => /flash/i.test(n)).sort();
    const pro = general.filter((n) => /pro/i.test(n)).sort();
    const candidates = [...flash, ...pro];

    if (candidates.length) {
      console.log("");
      console.log(`  Probing ${candidates.length} general-purpose model(s) to see which this project may actually call`);
      console.log("  (being in the catalogue above does not mean the project has access):");
      const usable = [];
      for (const id of candidates) {
        const location = [...available.keys()].find((loc) => available.get(loc).has(id)) || REGIONS[0];
        try {
          await client(location).models.generateContent({
            model: id,
            contents: [{ role: "user", parts: [{ text: "Reply with the single word: ok" }] }],
            config: { temperature: 0, maxOutputTokens: 16, thinkingConfig: { thinkingBudget: 0 } },
          });
          usable.push({ id, location });
          console.log(`    yes  ${location}/${id}`);
        } catch (err) {
          const s = statusOf(err);
          const m = String(err?.message || "");
          // A model that only refuses thinking_budget: 0 IS reachable — that is
          // a config quarrel, not an access one, and the provider settles it.
          if (/thinking_budget/i.test(m)) {
            usable.push({ id, location, needsThinking: true });
            console.log(`    yes  ${location}/${id}  (requires thinking; costs more)`);
          } else {
            console.log(`    no   ${location}/${id}  ${s || "?"}`);
          }
        }
      }

      const best = usable.find((u) => !u.needsThinking) || usable[0];
      if (best) {
        console.log("");
        console.log("  Set these in .env and restart:");
        console.log(`    GEMINI_TEXT_MODEL=${best.id}`);
        console.log(`    GEMINI_VISION_MODEL=${best.id}`);
        console.log(`    GEMINI_AUDIO_MODEL=${best.id}`);
        console.log(`    GEMINI_VIDEO_MODEL=${best.id}`);
        if (isVertex() && best.location !== REGIONS[0]) {
          console.log(`    VERTEX_LOCATION=${best.location}`);
        }
        console.log("");
        console.log("  Set all four explicitly rather than relying on the fallbacks — the");
        console.log("  defaults in the code are AI Studio names and do not exist on Vertex.");
        console.log("");
        console.log("  Also check GEMINI_USD_PER_M_INPUT / _OUTPUT against this model's real");
        console.log("  Vertex price: they feed the credit ledger, and the defaults are the");
        console.log("  rate for a different model entirely.");
      } else {
        console.log("");
        console.log("  None of them answered. The project is authenticated and can SEE the");
        console.log("  catalogue but has been granted access to nothing in it — which is a");
        console.log("  billing or model-access question, not a configuration one. Check that");
        console.log("  billing is attached: Vertex has no free tier.");
      }
    } else {
      console.log("");
      console.log("  Nothing could be listed either, so the problem is above the model id.");
      console.log("  Work through the diagnosis printed beside each failure, in this order:");
      console.log("    1. gcloud services enable aiplatform.googleapis.com --project=" + (PROJECT || "<project>"));
      console.log("    2. gcloud beta billing projects describe " + (PROJECT || "<project>") + "   (Vertex has no free tier)");
      console.log("    3. roles/aiplatform.user on the service account");
      console.log("    4. on the VM, confirm the access scope includes cloud-platform:");
      console.log("       curl -s -H 'Metadata-Flavor: Google' \\");
      console.log("         http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/scopes");
      console.log("       IAM alone will not fix a missing scope, and changing it needs the VM stopped.");
    }
  }

  if (isVertex() && REGIONS.length === 1) {
    console.log("");
    console.log("  A model missing from one region is often present in another, and each");
    console.log("  region carries its own quota. Try:");
    console.log("    node scripts/aiDoctor.js --regions=us-central1,us-east4,europe-west4,asia-south1");
  }
  console.log("");
}

main().catch((err) => {
  console.error("[ai-doctor] failed:", err);
  process.exit(1);
});
