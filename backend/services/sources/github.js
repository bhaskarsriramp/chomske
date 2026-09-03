/**
 * github.js — releases from the repos that matter in AI tooling.
 *
 * A release tag is often the FIRST public evidence a thing shipped — hours
 * before a blog post, days before coverage. For a be-first product that makes
 * this one of the highest-value sources despite being the least glamorous.
 *
 * GITHUB_TOKEN is optional: without it GitHub allows 60 requests/hour
 * unauthenticated, which this stays under. With it, 5,000/hour. Nothing breaks
 * if it's absent — the fetcher just gets less headroom.
 */
import { cleanText, parseDate } from "../../utils/normalize.js";

// Deliberately short. A long list means mostly patch-release noise; these are
// repos where a release is genuinely newsworthy to an AI audience.
const REPOS = [
  "ollama/ollama",
  "ggml-org/llama.cpp",
  "vllm-project/vllm",
  "huggingface/transformers",
  "langchain-ai/langchain",
  "openai/openai-python",
  "anthropics/anthropic-sdk-python",
  "comfyanonymous/ComfyUI",
];

const PER_REPO = 3;

export async function fetchGitHubReleases() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "hinglish-news-collector",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const out = [];

  for (const repo of REPOS) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${repo}/releases?per_page=${PER_REPO}`,
        { headers, signal: AbortSignal.timeout(15000) }
      );
      // 403 here is almost always the unauthenticated rate limit. Stop the whole
      // loop rather than burning the remaining repos against a closed door.
      if (res.status === 403) break;
      if (!res.ok) continue;

      for (const r of await res.json()) {
        if (r.draft || r.prerelease) continue;  // not news until it's real
        const name = r.name || r.tag_name;
        if (!name) continue;

        out.push({
          source: "github",
          source_kind: "primary",
          title: cleanText(`${repo.split("/")[1]} ${name}`, 300),
          url: r.html_url,
          summary: cleanText(r.body || "", 500),
          published_at: parseDate(r.published_at || r.created_at),
          meta: { repo, tag: r.tag_name },
        });
      }
    } catch {
      continue;
    }
  }

  return out;
}

export default { fetchGitHubReleases };
