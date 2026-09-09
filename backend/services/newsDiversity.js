/**
 * newsDiversity.js: stop one name from owning the feed.
 *
 * ── WHY BALANCED QUERIES ARE NOT ENOUGH ──────────────────────────────────────
 * services/categories.js no longer asks for any company by name, and that alone
 * moved ai_tech from 32% OpenAI-titled to 19% on a live A/B. It cannot finish
 * the job, because the thing that decides ORDER is not the fetch.
 *
 * The feed sorts on heat (services/newsHeat.js), which is a decayed count of how
 * many outlets are writing about a story right now. That is the right signal and
 * it has one structural consequence: the largest company in any domain always
 * draws the most simultaneous coverage, so its stories carry the most heat, so
 * they take the top slots. Not because the ranker likes them, and not because
 * the queries asked for them, but because two hundred outlets file on OpenAI's
 * launch and eleven file on Qualcomm's. A creator opening the page sees four
 * OpenAI cards and concludes the product only knows one company, which is the
 * report this module exists to answer.
 *
 * ── WHAT IT DOES, AND WHAT IT DELIBERATELY DOES NOT ──────────────────────────
 * It REORDERS. It never drops a story and never changes a score. A genuinely
 * huge OpenAI day still puts OpenAI at the top of the feed, and still puts more
 * OpenAI stories in the list than anything else; they are just spread down the
 * page instead of stacked at the top of it. The rule is a ceiling per stretch of
 * the list, not a quota.
 *
 * ── WHY A NAMED LIST AND NOT SOMETHING SELF-TUNING ───────────────────────────
 * The obvious clever version derives the subject from the headlines themselves,
 * by taking whichever word is over-represented in today's candidates. It was
 * tried on paper and rejected: news headlines are written in title case, so
 * capitalisation cannot find the proper noun, and the most repeated word in a
 * tech feed is "launches" or "model", not "Nvidia". A feed that silently
 * reordered itself around the word "launches" would be impossible to explain to
 * somebody staring at it, and this codebase already learned (see newsHeat.js,
 * and scripts/newsDoctor.js, which exists purely so an order can be explained)
 * that an ordering nobody can read off the page is worse than a blunter one.
 *
 * So: an explicit list of the names that actually dominate. It is short on
 * purpose. An entity only needs an entry if it is capable of taking over a feed,
 * and anything not on the list is simply never constrained, which is the safe
 * direction: the failure mode of a missing name is today's behaviour, not a
 * scrambled feed. Categories with no dominant players (a cricket feed, a film
 * feed) match nothing and pass through untouched.
 */

/**
 * How many items about ONE entity may appear in any WINDOW consecutive slots.
 *
 * 2 in 5 is what the reported screenshot needed: it had four OpenAI cards in the
 * first five, and this makes that at most two, while still letting a big day
 * lead the feed. Raising MAX or lowering WINDOW loosens it; MAX >= WINDOW turns
 * the module off without removing it.
 */
const WINDOW = Math.max(1, parseInt(process.env.NEWS_DIVERSITY_WINDOW || "5", 10));
const MAX_PER_WINDOW = Math.max(1, parseInt(process.env.NEWS_DIVERSITY_MAX || "2", 10));

/**
 * The names capable of dominating a feed, and the spellings each really appears
 * under. Grouped so that a company and its products count as ONE entity, which
 * is the whole point: "OpenAI ships Sora", "ChatGPT ad revenue" and "Sam Altman
 * says" are three cards about one subject, and matching only the literal string
 * "openai" would space out none of them.
 *
 * Ordered most-specific first, so "chatgpt" is not swallowed by a broader
 * pattern; the first match wins.
 */
const ENTITIES = [
  ["openai",     /\b(openai|chatgpt|sam altman|gpt-?\d|sora|dall-?e)\b/i],
  ["anthropic",  /\b(anthropic|claude)\b/i],
  ["google",     /\b(google|alphabet|gemini|deepmind|android|pixel|youtube|waymo)\b/i],
  ["meta",       /\b(meta|facebook|instagram|whatsapp|llama|zuckerberg)\b/i],
  ["microsoft",  /\b(microsoft|copilot|azure|windows|xbox|openai deal)\b/i],
  ["apple",      /\b(apple|iphone|ipad|macbook|ios|siri|vision pro)\b/i],
  ["amazon",     /\b(amazon|aws|alexa)\b/i],
  ["nvidia",     /\b(nvidia|geforce|cuda|blackwell)\b/i],
  ["tesla",      /\b(tesla|musk|cybertruck|cybercab)\b/i],
  ["xai",        /\b(xai|x\.ai|grok)\b/i],
  ["spacex",     /\b(spacex|starship|starlink)\b/i],
  ["samsung",    /\b(samsung|galaxy)\b/i],
  ["intel",      /\bintel\b/i],
  ["amd",        /\bamd\b/i],
  ["qualcomm",   /\b(qualcomm|snapdragon)\b/i],
  ["tsmc",       /\btsmc\b/i],

  // ── PHONE BRANDS, WHICH IS WHAT ACTUALLY FLOODS A GADGET FEED ─────────────
  // The list above was written when this category was AI industry news, so the
  // things it knows how to space apart are labs and chipmakers. On a feed of
  // Indian phone launches the entity that repeats is a phone brand: Xiaomi
  // ships Redmi, POCO and its own line, and a launch week from any one of them
  // can put four near-identical cards at the top of the feed.
  //
  // Sub-brands map to their PARENT on purpose. Redmi and POCO are both Xiaomi,
  // and three Xiaomi launches spaced as three different companies is exactly
  // the clustering this file exists to break up. iQOO is vivo's, and OnePlus
  // and realme are BBK's alongside oppo, but those three are run and marketed
  // as separate rivals in India and a viewer reads them that way, so they stay
  // separate here.
  ["xiaomi",     /\b(xiaomi|redmi|poco|hyperos|mi\s?\d)\b/i],
  ["vivo",       /\b(vivo|iqoo|funtouch|originos)\b/i],
  ["oppo",       /\b(oppo|coloros)\b/i],
  ["oneplus",    /\b(oneplus|one ?plus|oxygenos)\b/i],
  ["realme",     /\brealme\b/i],
  ["motorola",   /\b(motorola|moto\s|lenovo)\b/i],
  ["nothing",    /\b(nothing phone|nothing ear|cmf by nothing)\b/i],
  ["transsion",  /\b(infinix|tecno|itel)\b/i],
  ["honor",      /\bhonor\b/i],
  ["huawei",     /\bhuawei\b/i],
  ["asus",       /\b(asus|rog phone|zenfone|vivobook)\b/i],
  ["lava",       /\b(lava|micromax)\b/i],
  ["sony",       /\bsony\b/i],
  ["boat",       /\b(boat lifestyle|boAt)\b/],
  ["noise",      /\bnoise (buds|colorfit|smartwatch)\b/i],

  // Telecom, which is its own recurring segment on these channels and where one
  // operator's tariff week can otherwise take the whole feed.
  ["airtel",     /\b(airtel|bharti airtel)\b/i],
  ["vodafoneidea", /\b(vodafone idea|\bvi\b|vodafone)\b/i],
  ["bsnl",       /\bbsnl\b/i],

  // Finance and business, India-weighted because those categories are.
  // `jio` sits here rather than with telecom above because Reliance is the
  // parent and the finance feed talks about it constantly.
  ["reliance",   /\b(reliance|jio)\b/i],
  ["adani",      /\badani\b/i],
  ["tata",       /\b(tata|tcs)\b/i],
  ["infosys",    /\binfosys\b/i],
  ["hdfc",       /\bhdfc\b/i],
  ["rbi",        /\b(rbi|reserve bank of india)\b/i],
  ["sebi",       /\bsebi\b/i],

  // Crypto, where a single asset can fill a feed on its own.
  ["bitcoin",    /\b(bitcoin|btc)\b/i],
  ["ethereum",   /\b(ethereum|ether|eth)\b/i],
  ["solana",     /\b(solana|sol)\b/i],
  ["binance",    /\bbinance\b/i],
  ["coinbase",   /\bcoinbase\b/i],
];

/**
 * Which dominant entity, if any, a story is about.
 *
 * @param {string} text  headline plus whatever else identifies the story. The
 *   caller passes the ranker's `cluster_id` too, because that key is the model's
 *   own name for the EVENT ("openai-astra-safety-risk") and often carries the
 *   entity in cases where the headline is coy about it ("Astra sparks alarm").
 * @returns {string|null} the entity's id, or null when nothing dominant matches,
 *   which means "never constrain this item".
 */
export function entityOf(text) {
  const s = String(text || "");
  if (!s) return null;
  for (const [id, re] of ENTITIES) if (re.test(s)) return id;
  return null;
}

/**
 * Reorder so no entity holds more than MAX_PER_WINDOW of any WINDOW consecutive
 * slots. Stable otherwise: an item only moves when it is displacing a run.
 *
 * Greedy, taking the best remaining item that does not breach the ceiling, and
 * falling back to the outright best when nothing qualifies. That fallback is
 * what makes it safe on a day when every story really is about one company: the
 * list stays complete and simply comes out in its original order, rather than
 * stalling or dropping the tail.
 *
 * @param {Array} rows        already in final rank order, best first
 * @param {(row:any)=>string} textOf  how to read a row's identifying text
 * @returns {Array} the same rows, reordered
 */
export function spaceByEntity(rows, textOf) {
  if (!Array.isArray(rows) || rows.length < 3) return rows || [];

  // Resolved once per row: entityOf runs the whole pattern list, and the greedy
  // loop below would otherwise re-ask about the same row on every pass.
  const pool = rows.map((row) => ({ row, entity: entityOf(textOf(row)) }));

  const out = [];
  const placed = [];   // entity ids, in output order, for the window lookback

  while (pool.length) {
    let pick = 0;      // the best remaining, used when nothing clears the ceiling

    for (let i = 0; i < pool.length; i++) {
      const { entity } = pool[i];

      // Not a dominant name, so it cannot be the thing crowding the feed.
      if (!entity) { pick = i; break; }

      let seen = 0;
      for (let j = Math.max(0, placed.length - WINDOW + 1); j < placed.length; j++) {
        if (placed[j] === entity) seen++;
      }
      if (seen < MAX_PER_WINDOW) { pick = i; break; }
    }

    const [chosen] = pool.splice(pick, 1);
    placed.push(chosen.entity);
    out.push(chosen.row);
  }

  return out;
}

export default { entityOf, spaceByEntity, WINDOW, MAX_PER_WINDOW };
