/**
 * categories.js: the single source of truth for what a creator can cover.
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
 * that is survivable, fetchRssFeed returns [] rather than throwing, and the
 * collector isolates each source.
 *
 * `locale` matters more than it looks. An Indian creator covering markets wants
 * Indian coverage, so those categories query the IN edition; AI news is global
 * and reads better from the US edition.
 */

const IN = { hl: "en-IN", gl: "IN", ceid: "IN:en" };
const US = { hl: "en-US", gl: "US", ceid: "US:en" };

/**
 * ── THE RULE EVERY QUERY LIST BELOW NOW FOLLOWS ──────────────────────────────
 * A query must ask for the kind of EVENT this category's editorial bar rewards,
 * and must never name a single company.
 *
 * Both halves were being broken, and the ai_tech feed is what it looked like
 * from the outside: page after page of OpenAI. Measured on a live pass of the
 * old list, "OpenAI" returned 100 items, 92 of them with OpenAI in the headline.
 * Naming a company in a query does not ask for the category's news, it buys
 * that company's week, and one line out of five spent that way is enough to
 * make a category look like a fan page.
 *
 * The second half is subtler and was breaking every category. `top` and `low`
 * below tell the ranker what deserves a video, and the queries were fetching
 * something else entirely:
 *
 *   ai_tech    `top` rewards "a serious outage or breach, a landmark lawsuit
 *              ruling, a major acquisition". Not one query asked for an outage,
 *              a breach, a ruling or an acquisition. The catch-all that was
 *              meant to cover them, "artificial intelligence", returned 100
 *              items that were 4% OpenAI and mostly school-district notices and
 *              opinion columns, which is to say the broad query was not
 *              broadening the category, it was filling it with things the
 *              ranker then scored 0-2 and threw away.
 *
 *   crypto     `low` says "daily price commentary with no cause" is noise, and
 *              then "bitcoin price" and "ethereum" spent half the fetch on
 *              exactly that: 200 items of price charts and presale shilling,
 *              collected in order to be discarded.
 *
 * Fetching what you are about to bin is not just waste. The ranker reads a
 * fixed-size window of the newest rows, so noise does not sit harmlessly in the
 * database, it crowds real stories out of the window and they are never judged
 * at all. A category's queries decide what that category can possibly be about.
 *
 * So each list below is one line per FACET of the domain, sized to cover it:
 * launches, money, rulings, failures, the people. Companies still appear in the
 * feed, and the big ones appear often, because they are genuinely doing the
 * launching and the acquiring. They just no longer arrive by name.
 *
 * Diversity is enforced a second time at read time, in services/newsDiversity.js,
 * because a balanced fetch is not sufficient on its own: the feed orders by how
 * much coverage a story is drawing, and the largest companies always draw the
 * most, so without a spacing rule the biggest name reclaims the top of the list
 * whatever the queries do.
 */
export const CATEGORIES = [
  {
    id: "ai_tech",
    label: "AI & technology",
    blurb: "Model launches, big tech moves, research that actually ships",
    locale: US,
    // Was ["artificial intelligence", "OpenAI", "Anthropic Claude",
    // "Google Gemini AI", "AI model release"], which is three company names and
    // a catch-all. Live A/B on the same hour: that list was 32% OpenAI-titled,
    // this one is 19%, and the difference is made up of chips, breaches,
    // outages, rulings and hardware launches rather than of nothing.
    googleNews: [
      "AI model launch",
      "AI research breakthrough",
      "AI safety incident",
      "AI regulation lawsuit",
      "semiconductor chip launch",
      "AI chip data center",
      "data breach cyberattack",
      "cloud outage",
      "tech product launch",
      "big tech acquisition",
    ],
    // Paid-source terms, deliberately broader than the Google News ones above.
    // Those are tuned to a free feed that rewards a narrow phrase; this endpoint
    // is one paid request for thirty articles, so a term naming a single company
    // spends it on that company's week rather than on the category. See
    // sources/apidirectNews.js, which rotates through this whole list.
    apidirectNews: [
      "artificial intelligence news", "technology news", "AI model launch",
      "tech industry", "AI research breakthrough", "semiconductor chip industry",
      "AI startup funding", "big tech company news", "cybersecurity breach",
      "consumer technology gadgets",
    ],
    // Company names dropped here for the same reason as above: HN's own front
    // page surfaces the big labs constantly without being asked.
    hn: ["AI", "LLM", "machine learning", "GPU", "chip", "security breach", "open source"],
    arxiv: true,
    github: true,
    rss: [
      { source: "openai", kind: "primary", url: "https://openai.com/news/rss.xml" },
      { source: "deepmind", kind: "primary", url: "https://deepmind.google/blog/rss.xml" },
      { source: "huggingface", kind: "primary", url: "https://huggingface.co/blog/feed.xml" },
      // Added so the `primary` tier, which carries the heaviest source weight in
      // the collector, is not three feeds of which one is the loudest publisher
      // in the industry. A tier that small decides its own winner.
      { source: "nvidia", kind: "primary", url: "https://blogs.nvidia.com/feed/" },
      { source: "microsoft", kind: "primary", url: "https://blogs.microsoft.com/feed/" },
      { source: "googleblog", kind: "primary", url: "https://blog.google/rss/" },
      { source: "techcrunch-ai", kind: "outlet", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
      { source: "venturebeat-ai", kind: "outlet", url: "https://venturebeat.com/category/ai/feed/" },
      { source: "arstechnica", kind: "outlet", url: "https://feeds.arstechnica.com/arstechnica/index", filter: true },
      { source: "theverge", kind: "outlet", url: "https://www.theverge.com/rss/index.xml", filter: true },
      { source: "engadget", kind: "outlet", url: "https://www.engadget.com/rss.xml", filter: true },
      { source: "wired", kind: "outlet", url: "https://www.wired.com/feed/rss", filter: true },
      // Infrastructure and enterprise, which is where the outages, breaches and
      // chip supply stories the new queries ask for actually get covered; the
      // other four outlets here are all consumer-facing.
      { source: "theregister", kind: "outlet", url: "https://www.theregister.com/headlines.atom", filter: true },
    ],
    // ── THIS TEST USED TO SAY "AI", NOT "TECHNOLOGY" ─────────────────────────
    // It was a list of AI words, applied to the two general tech feeds, and it
    // was throwing away most of what they publish: measured live, The Verge kept
    // 1 item in 10 and Ars Technica 3 in 20. What it discarded was not noise, it
    // was Europe's first commercial orbital rocket, the Cybercab investigation,
    // an iPhone feature launch, the Fairphone 6. A category called "AI &
    // technology" was filtering technology out of itself and keeping only the
    // half that mentions AI, which is the other reason the feed read as
    // all-OpenAI-all-the-time.
    //
    // Now a real technology test. The same feeds keep 80%, and what still drops
    // is what genuinely belongs elsewhere: Ars's medical and political coverage
    // (science_health's job) and Wired's shopping guides (nobody's).
    filterTerms:
      /\b(ai|a\.i\.|artificial intelligence|llm|gpt|claude|gemini|openai|anthropic|deepmind|machine learning|neural|chatbot|agent|copilot|hugging ?face|inference|diffusion|model|algorithm|chips?|semiconductor|processor|gpu|nvidia|amd|intel|arm|qualcomm|tsmc|apple|google|microsoft|amazon|meta|tesla|spacex|samsung|sony|nintendo|valve|steam|iphone|ipad|android|windows|macos|linux|pixel|galaxy|laptop|smartphone|phone|tablet|headset|vr|wearable|e-?reader|console|gaming|robot|drone|satellite|rocket|orbital|ev|electric vehicle|battery|quantum|software|hardware|apps?|startup|cloud|server|data ?cent(er|re)|outage|breach|hack(ed)?|ransomware|malware|phishing|encryption|privacy|cyber|browser|chrome|firefox|open source|api|developer|programming|crypto|bitcoin|streaming|netflix|spotify|youtube|tiktok|social media|antitrust|regulat|lawsuit|ftc)\b/i,
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
    // The one list that was already event-shaped. Widened rather than rewritten:
    // the old five covered indices, policy and IPOs but nothing about the rupee,
    // a sector move, or a regulator acting, all of which `top` rewards.
    googleNews: [
      "stock market India",
      "Nifty Sensex today",
      "RBI monetary policy",
      "IPO listing India",
      "quarterly earnings company India",
      "rupee dollar exchange rate",
      "SEBI regulatory action",
      "sector stocks rally fall",
    ],
    // Paid-source terms, deliberately broader than the Google News ones above.
    // Those are tuned to a free feed that rewards a narrow phrase; this endpoint
    // is one paid request for thirty articles, so a term naming a single company
    // spends it on that company's week rather than on the category. See
    // sources/apidirectNews.js, which rotates through this whole list.
    apidirectNews: [
      "Indian stock market", "Nifty Sensex today", "RBI monetary policy",
      "India IPO listing", "quarterly earnings India", "rupee dollar rate",
      "Indian economy news", "mutual funds India",
    ],
    // ── THE WIRE NOISE THAT WAS EATING THIS CATEGORY'S RANKING WINDOW ────────
    // Indian markets publish a continuous stream of MACHINE-GENERATED filings:
    // AGM and EGM scheduling notices, record dates, board-meeting calendars, and
    // ratings-bot posts ("X Ltd Upgraded to Hold by MarketsMOJO"). They are
    // always minutes old, so they always look like breaking news to a score
    // built on recency, and they are worth zero to a creator.
    //
    // Measured on one live pass: 22 of 200 Google News items, and they held
    // slots 1, 3, 4, 7, 12 and 17 of the sixty the ranker actually judges. The
    // ranker then correctly scored them 0-2, which means the whole pass was
    // spent proving that filings are not news, while the day's real stories
    // never entered the window at all. See newsRanker.js.
    //
    // Dropped at collection rather than left to the ranker on purpose: the
    // ranker's cost is per candidate and its window is the scarce resource.
    // Judging this and throwing it away is the expensive way to be right.
    excludeTerms:
      /\b(\d+(st|nd|rd|th)\s+(AGM|EGM)|AGM|EGM|annual general meeting|extraordinary general meeting|record date|postal ballot|investor meet|closes books|book closure|(up|down)graded to (buy|hold|sell|strong buy)|marketsmojo|grey market premium|\bGMP\b|schedules \d+)\b/i,
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
    // "unicorn startup" returned 6 items and "layoffs company", unscoped, mostly
    // returned Volkswagen: a bare noun with no country in an India-locale
    // category drifts to whatever the world's biggest employer did that day.
    // Every line is now scoped and names an event `top` or `mid` rewards.
    googleNews: [
      "startup funding round India",
      "company acquisition India",
      "layoffs India employees",
      "IPO startup India",
      "CEO steps down company",
      "venture capital fund India",
      "new company launch India",
      "business results India company",
    ],
    // Paid-source terms, deliberately broader than the Google News ones above.
    // Those are tuned to a free feed that rewards a narrow phrase; this endpoint
    // is one paid request for thirty articles, so a term naming a single company
    // spends it on that company's week rather than on the category. See
    // sources/apidirectNews.js, which rotates through this whole list.
    apidirectNews: [
      "Indian startup funding", "India business news", "startup acquisition India",
      "company layoffs India", "unicorn startup India", "venture capital India",
      "Indian entrepreneurs", "small business India",
    ],
    // The same corporate-filing wire noise as finance; this category reads the
    // Indian business press, which carries it too. See the note there.
    excludeTerms:
      /\b(\d+(st|nd|rd|th)\s+(AGM|EGM)|AGM|EGM|annual general meeting|extraordinary general meeting|record date|postal ballot|investor meet|book closure|(up|down)graded to (buy|hold|sell|strong buy)|marketsmojo)\b/i,
    hn: ["startup funding", "acquisition", "layoffs"],
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
    // ── THE CLEAREST CASE OF FETCHING WHAT YOU INTEND TO BIN ─────────────────
    // `low` below calls daily price commentary noise. "bitcoin price" and
    // "ethereum" returned 100 items each, live, and they were price charts and
    // presale spam: 200 rows collected so the ranker could score them 0-2, while
    // occupying the ranking window that the hacks and rulings needed.
    // The blurb says "prices with a CAUSE", and a cause is an ETF flow, an
    // enforcement action, an upgrade. Those are what this asks for now.
    googleNews: [
      "crypto regulation ruling",
      "crypto exchange hack",
      "bitcoin ETF institutional",
      "blockchain protocol upgrade",
      "stablecoin news",
      "crypto enforcement SEC",
      "crypto adoption company",
      "crypto India tax",
    ],
    // Paid-source terms, deliberately broader than the Google News ones above.
    // Those are tuned to a free feed that rewards a narrow phrase; this endpoint
    // is one paid request for thirty articles, so a term naming a single company
    // spends it on that company's week rather than on the category. See
    // sources/apidirectNews.js, which rotates through this whole list.
    apidirectNews: [
      "cryptocurrency news", "bitcoin news", "ethereum news",
      "crypto regulation India", "crypto exchange", "blockchain web3",
      "altcoin market", "crypto tax India",
    ],
    hn: ["bitcoin", "ethereum", "crypto"],
    rss: [
      { source: "coindesk", kind: "outlet", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
      { source: "cointelegraph", kind: "outlet", url: "https://cointelegraph.com/rss" },
      { source: "decrypt", kind: "outlet", url: "https://decrypt.co/feed" },
      { source: "theblock", kind: "outlet", url: "https://www.theblock.co/rss.xml" },
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
    // An India-locale film category whose only industry term was "Bollywood"
    // was missing the South Indian industries, which out-gross Hindi cinema in
    // most years, and had no line for Hollywood at all despite carrying Variety
    // and Deadline. Both added.
    googleNews: [
      "box office collection",
      "South Indian film release",
      "Bollywood film announcement",
      "OTT streaming release",
      "film trailer launch",
      "Hollywood film release date",
      "streaming series premiere",
      "actor signs film",
    ],
    // This category had no paid-source list at all, so the paid endpoint fell
    // back to the Google News terms, which are written for a free feed that
    // rewards a narrow phrase. Same mismatch in sports and science_health, and
    // fixed the same way: broader terms, written for a request that returns
    // thirty articles at a flat price.
    apidirectNews: [
      "Bollywood movie news", "South Indian cinema news", "box office collection India",
      "OTT release India", "Hollywood movie news", "streaming series news",
      "film industry news", "celebrity casting news",
    ],
    rss: [
      { source: "bollywoodhungama", kind: "outlet", url: "https://www.bollywoodhungama.com/rss/news.xml" },
      { source: "variety", kind: "outlet", url: "https://variety.com/feed/" },
      { source: "deadline", kind: "outlet", url: "https://deadline.com/feed/" },
      { source: "hollywoodreporter", kind: "outlet", url: "https://www.hollywoodreporter.com/feed/" },
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
    // "IPL news" is a season, not a topic: for most of the year it returns
    // archive pages and filler, and it was one of only four lines. Cricket stays
    // the focus, as the label promises, but the tournament name is gone and the
    // other sports an Indian audience follows now have a line each.
    googleNews: [
      "cricket match result",
      "cricket squad announcement",
      "football transfer confirmed",
      "tennis tournament result",
      "athlete injury ruled out",
      "sports league final",
      "badminton hockey India",
      "Olympics athletics India",
    ],
    // See the note on entertainment's list: this category had none, so the paid
    // endpoint was spending on phrases written for Google News.
    apidirectNews: [
      "cricket news India", "cricket match result", "football transfer news",
      "Indian sports news", "sports injury update", "tennis news",
      "olympics india athletes", "sports tournament result",
    ],
    rss: [
      { source: "espncricinfo", kind: "outlet", url: "https://www.espncricinfo.com/rss/content/story/feeds/0.xml" },
      { source: "ndtv-sports", kind: "outlet", url: "https://feeds.feedburner.com/ndtvsports-latest" },
      { source: "bbc-sport", kind: "outlet", url: "https://feeds.bbci.co.uk/sport/rss.xml" },
      { source: "skysports", kind: "outlet", url: "https://www.skysports.com/rss/12040" },
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
    // "scientific study finds" is a headline cliche rather than a subject, and
    // it was pulling in marketing copy that happened to use the phrase. These
    // name the events `top` rewards: a publication, a trial, an approval, a
    // launch, an outbreak.
    googleNews: [
      "study published journal",
      "clinical trial results",
      "drug approval FDA",
      "space mission launch",
      "disease outbreak health",
      "climate research finding",
      "researchers discover study",
      "public health guidance",
    ],
    // See the note on entertainment's list: this category had none either.
    apidirectNews: [
      "science research news", "health medical news", "clinical trial results",
      "space mission news", "disease outbreak", "drug approval",
      "climate science news", "public health news",
    ],
    rss: [
      { source: "sciencedaily", kind: "outlet", url: "https://www.sciencedaily.com/rss/all.xml" },
      { source: "arstechnica-science", kind: "outlet", url: "https://feeds.arstechnica.com/arstechnica/science" },
      { source: "nature", kind: "primary", url: "https://www.nature.com/nature.rss" },
      { source: "statnews", kind: "outlet", url: "https://www.statnews.com/feed/" },
      { source: "bbc-science", kind: "outlet", url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml" },
    ],
    editor: "science and health news, for a curious general audience",
    top: "A major published finding, an approved treatment, a launch or landing, a public health decision.",
    mid: "A solid peer-reviewed study with a clear result, a notable trial outcome.",
    low: "Single small studies dressed as breakthroughs, supplement marketing, anything correlational reported as causal.",
    caution:
      "Do NOT overstate a finding. A study on mice is not a cure, and a correlation is not a cause. Say plainly what was and was not shown.",
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

/** Only what the UI needs, the fetch config is server-side detail. */
export function publicCategories() {
  return CATEGORIES.map((c) => ({ id: c.id, label: c.label, blurb: c.blurb }));
}

/**
 * Clean a user's selection: valid ids only, deduped, capped, order preserved.
 * Returns [] for nothing usable so callers can tell "not chosen yet" from "chose
 * something invalid", the onboarding gate depends on that difference.
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
