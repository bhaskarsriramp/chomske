/**
 * site.mjs: what the site SAYS, as text. TinyFish Fetch renders the page and
 * returns its readable content as markdown, with its links and images.
 *
 * This is the script's raw material only. What the site LOOKS like comes from
 * real screenshots (capture.mjs): the markdown has no layout, no colour and
 * no way to tell the product's copy from sample data drawn inside a mockup.
 */
import { tinyfishKey } from "./env.mjs";

const ENDPOINT = "https://api.fetch.tinyfish.ai/";
const MAX_TEXT = 14000;

/** Repeated blocks (carousels, the same mockup drawn three times) said once. */
function dedupe(text) {
  const seen = new Set();
  return String(text || "")
    .split(/\n{2,}/)
    .filter((block) => {
      const k = block.trim().toLowerCase();
      if (!k) return false;
      if (k.length > 24 && seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .join("\n\n");
}

export async function fetchSite(url) {
  const key = tinyfishKey();
  if (!key) throw new Error("No TinyFish key (TINYFISH_API_KEY, or the app's key pool)");
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "X-API-Key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: [url],
          format: "markdown",
          links: true,
          image_links: true,
          ttl: 0,
          purpose: "Write a short product launch video about this product: what it is, who it is for, the problem it solves, its key features, real proof points and the call to action.",
        }),
        signal: AbortSignal.timeout(120_000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`fetch ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
      const r = (body.results || [])[0];
      if (!r) throw new Error(`fetch returned nothing: ${JSON.stringify(body.errors || body).slice(0, 300)}`);
      const text = dedupe(r.text);
      return {
        url: r.final_url || url,
        title: r.title || "",
        description: r.description || "",
        language: r.language || "en",
        text: text.slice(0, MAX_TEXT),
        truncated: text.length > MAX_TEXT,
        links: (r.links || []).slice(0, 80),
        images: (r.image_links || []).slice(0, 40),
      };
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw last;
}
