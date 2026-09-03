/**
 * categories.js — the single source of truth for what a creator can cover.
 *
 * One entry here drives FOUR things, so a new category is a config change and
 * never a code change:
 *   1. which sources get fetched, and with what queries
 *   2. how the ranker judges "does this deserve a video today" in that domain
 *   3. the cards shown during onboarding
 *   4. which feed a user sees
 *
 * ── WHY GOOGLE NEWS IS THE BACKBONE ──────────────────────────────────────────
 * It takes an arbitrary query, needs no key, supports a real freshness window
 * (`when:1d`) and covers every topic on earth. That is what makes this catalog
 * extensible at all: HN only knows tech, arXiv only knows papers, but Google News
 * works for cricket and film awards equally well. Curated RSS feeds are added on
 * top where a domain has obvious authorities worth reading first.
 *
 * Every RSS URL below was live-probed and returned items. Feeds still die, and
 * that is survivable — fetchRssFeed returns [] rather than throwing, and the
 * collector isolates each source.
 *
 * `locale` matters more than it looks. An Indian creator covering markets wants
 * Indian coverage, so those categories query the IN edition; AI news is global
 * and reads better from the US edition.
 */

const IN = { hl: "en-IN", gl: "IN", ceid: "IN:en" };
const US = { hl: "en-US", gl: "US", ceid: "US:en" };

export const CATEGORIES = [
  {
    id: "ai_tech",
    label: "AI & technology",
    blurb: "Model launches, big tech moves, research that actually ships",
    locale: US,
    googleNews: ["artificial intelligence", "OpenAI", "Anthropic Claude", "Google Gemini AI", "AI model release"],
    hn: ["AI", "LLM", "OpenAI", "Anthropic", "machine learning", "GPU"],
    arxiv: true,
    github: true,
    rss: [
      { source: "openai", kind: "primary", url: "https://openai.com/news/rss.xml" },
      { source: "deepmind", kind: "primary", url: "https://deepmind.google/blog/rss.xml" },
      { source: "huggingface", kind: "primary", url: "https://huggingface.co/blog/feed.xml" },
      { source: "techcrunch-ai", kind: "outlet", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
      { source: "venturebeat-ai", kind: "outlet", url: "https://venturebeat.com/category/ai/feed/" },
      { source: "arstechnica", kind: "outlet", url: "https://feeds.arstechnica.com/arstechnica/index", filter: true },
      { source: "theverge", kind: "outlet", url: "https://www.theverge.com/rss/index.xml", filter: true },
    ],
    // Terms used to filter general-tech feeds down to the ones that are on-topic.
    filterTerms: /\b(ai|a\.i\.|artificial intelligence|llm|gpt|claude|gemini|openai|anthropic|deepmind|machine learning|neural|model|chatbot|nvidia|gpu|agent|transformer|copilot|hugging ?face|inference|diffusion)\b/i,
    editor: "AI and technology news, for a general curious audience rather than researchers",
    top: "A frontier model launch, a major acquisition, a serious outage or breach, a landmark lawsuit ruling.",
    mid: "A notable release, a real benchmark result, a credible leak, a surprising study.",
    low: "Routine papers, listicles, opinion pieces, press releases with no news.",
  },

  {
    id: "finance",
    label: "Stock market & finance",
    blurb: "Markets, results season, IPOs, RBI, the rupee",
    locale: IN,
    googleNews: ["stock market India", "Nifty Sensex", "RBI policy", "IPO India", "quarterly results India"],
    rss: [
      { source: "et-markets", kind: "outlet", url: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms" },
      { source: "moneycontrol", kind: "outlet", url: "https://www.moneycontrol.com/rss/latestnews.xml" },
      { source: "livemint-markets", kind: "outlet", url: "https://www.livemint.com/rss/markets" },
      { source: "business-standard", kind: "outlet", url: "https://www.business-standard.com/rss/markets-106.rss" },
    ],
    editor: "Indian stock market and personal finance news, for retail investors who are not professionals",
    top: "An RBI rate decision, a major index move with a clear cause, a large IPO opening, a big company's results surprising the street, a regulatory action.",
    mid: "A notable company result, a sector-wide move, a credible analyst call, a policy consultation that will affect investors.",
    low: "Routine daily market wraps with no cause, paid promotions, generic 'top 5 stocks' listicles, advice pieces with no news event.",
    // Money is the one domain where a made-up number is not just wrong but
    // dangerous, and creators here carry real regulatory exposure.
    caution:
      "NEVER invent a price, percentage, target or date. Report only what the sources state, and attribute any prediction to whoever made it. This is news, never investment advice.",
  },

  {
    id: "business",
    label: "Business & startups",
    blurb: "Funding rounds, founder moves, company shake-ups",
    locale: IN,
    googleNews: ["startup funding India", "acquisition India business", "unicorn startup", "layoffs company"],
    hn: ["startup", "funding", "acquisition"],
    rss: [
      { source: "inc42", kind: "outlet", url: "https://inc42.com/feed/" },
      { source: "yourstory", kind: "outlet", url: "https://yourstory.com/feed" },
      { source: "techcrunch-startups", kind: "outlet", url: "https://techcrunch.com/category/startups/feed/" },
    ],
    editor: "startup and business news, for founders and people who follow the startup scene",
    top: "A large funding round, an acquisition, a well-known company shutting down or laying off at scale, a founder scandal.",
    mid: "A notable seed or Series A, a significant product pivot, a credible report on a company's numbers.",
    low: "Award announcements, generic 'how to build' advice, PR fluff, listicles of companies.",
  },

  {
    id: "crypto",
    label: "Crypto & Web3",
    blurb: "Prices with a cause, regulation, hacks, launches",
    locale: US,
    googleNews: ["bitcoin price", "ethereum", "crypto regulation", "crypto exchange hack"],
    hn: ["bitcoin", "ethereum", "crypto"],
    rss: [
      { source: "coindesk", kind: "outlet", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
      { source: "cointelegraph", kind: "outlet", url: "https://cointelegraph.com/rss" },
    ],
    editor: "crypto and Web3 news, for people who hold or follow crypto but are not traders",
    top: "A major exchange hack, a regulatory ruling, an ETF decision, a large protocol failure, a move with a clear identifiable cause.",
    mid: "A notable protocol upgrade, an enforcement action, a significant institutional move.",
    low: "Daily price commentary with no cause, shill posts, price predictions, sponsored coverage.",
    caution:
      "NEVER invent a price or a percentage move. Report only figures stated in the sources, and never imply anything is a good buy.",
  },

  {
    id: "entertainment",
    label: "Film & entertainment",
    blurb: "Releases, box office, casting, streaming",
    locale: IN,
    googleNews: ["Bollywood film news", "box office collection", "OTT release", "movie casting announcement"],
    rss: [
      { source: "bollywoodhungama", kind: "outlet", url: "https://www.bollywoodhungama.com/rss/news.xml" },
      { source: "variety", kind: "outlet", url: "https://variety.com/feed/" },
      { source: "deadline", kind: "outlet", url: "https://deadline.com/feed/" },
    ],
    editor: "film and entertainment news, for an audience that follows movies and streaming closely",
    top: "A major release date or trailer drop, a big casting confirmation, a record box office number, a studio or streamer shake-up.",
    mid: "A notable casting rumour from a credible outlet, a solid box office update, a festival result.",
    low: "Paparazzi content, relationship gossip with no source, 'fans react' pieces, unsourced rumours.",
  },

  {
    id: "sports",
    label: "Sports & cricket",
    blurb: "Results, squads, transfers, injuries",
    locale: IN,
    googleNews: ["cricket India match", "IPL news", "football transfer", "sports injury update"],
    rss: [
      { source: "espncricinfo", kind: "outlet", url: "https://www.espncricinfo.com/rss/content/story/feeds/0.xml" },
      { source: "ndtv-sports", kind: "outlet", url: "https://feeds.feedburner.com/ndtvsports-latest" },
    ],
    editor: "sports news with a strong cricket focus, for fans who follow the game closely",
    top: "A match result that changes a series or tournament, a squad announcement, a major injury, a retirement, a transfer confirmed.",
    mid: "A notable individual performance, a credible selection report, a fixture change.",
    low: "Speculation with no source, 'top 10 moments' lists, opinion columns with no news.",
  },

  {
    id: "science_health",
    label: "Science & health",
    blurb: "Studies that hold up, health guidance, space",
    locale: US,
    googleNews: ["scientific study finds", "health research", "space mission launch", "medical breakthrough"],
    rss: [
      { source: "sciencedaily", kind: "outlet", url: "https://www.sciencedaily.com/rss/all.xml" },
      { source: "arstechnica-science", kind: "outlet", url: "https://feeds.arstechnica.com/arstechnica/science" },
    ],
    editor: "science and health news, for a curious general audience",
    top: "A major published finding, an approved treatment, a launch or landing, a public health decision.",
    mid: "A solid peer-reviewed study with a clear result, a notable trial outcome.",
    low: "Single small studies dressed as breakthroughs, supplement marketing, anything correlational reported as causal.",
    caution:
      "Do NOT overstate a finding. A study on mice is not a cure, and a correlation is not a cause. Say plainly what was and was not shown.",
  },

  {
    id: "jobs_exams",
    label: "Govt jobs & exams",
    blurb: "Notifications, admit cards, results, dates",
    locale: IN,
    googleNews: ["government job notification", "SSC recruitment", "UPSC exam date", "railway recruitment", "exam result declared"],
    editor: "Indian government job and competitive exam updates, for aspirants preparing for them",
    top: "A new recruitment notification opening, a result declaration, an exam date announcement, an admit card release.",
    mid: "A pattern or syllabus change, a deadline extension, a vacancy count update.",
    low: "Coaching advertisements, motivational content, unofficial rumours about upcoming vacancies.",
    caution:
      "Dates, vacancy counts and deadlines change people's plans. Use only what the sources state, and never guess a date.",
  },
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export const DEFAULT_CATEGORY = "ai_tech";
export const MAX_CATEGORIES = parseInt(process.env.MAX_USER_CATEGORIES || "3", 10);

export function getCategory(id) {
  return BY_ID.get(String(id || "")) || null;
}

export function isValidCategory(id) {
  return BY_ID.has(String(id || ""));
}

/** Only what the UI needs — the fetch config is server-side detail. */
export function publicCategories() {
  return CATEGORIES.map((c) => ({ id: c.id, label: c.label, blurb: c.blurb }));
}

/**
 * Clean a user's selection: valid ids only, deduped, capped, order preserved.
 * Returns [] for nothing usable so callers can tell "not chosen yet" from "chose
 * something invalid" — the onboarding gate depends on that difference.
 */
export function sanitizeSelection(ids) {
  if (!Array.isArray(ids)) return [];
  const out = [];
  for (const raw of ids) {
    const id = String(raw || "").trim();
    if (isValidCategory(id) && !out.includes(id)) out.push(id);
    if (out.length >= MAX_CATEGORIES) break;
  }
  return out;
}

export default { CATEGORIES, getCategory, isValidCategory, publicCategories, sanitizeSelection, MAX_CATEGORIES, DEFAULT_CATEGORY };
