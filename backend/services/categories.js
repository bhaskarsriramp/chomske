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
    id: "tech_gadgets",
    label: "Tech & gadgets",
    blurb: "Phone launches, model releases, big tech moves, the deals worth knowing",
    // The one category on offer. See ENABLED below for why the other six stay
    // in this file fully configured rather than being deleted.
    enabled: true,
    // ── INDIA, NOT THE US ───────────────────────────────────────────────────
    // This was US, inherited from when the category was AI industry news. For a
    // creator whose whole show is "what does this cost in rupees and when can
    // you buy it here", a US feed is not merely less relevant, it is missing the
    // one fact every story turns on. An Oppo launch has a different price, a
    // different date and often a different model number in India.
    locale: IN,

    // ── THE QUERIES ARE ABOUT PRODUCTS PEOPLE BUY ───────────────────────────
    // These used to be "AI model launch", "AI research breakthrough", "AI safety
    // incident", "AI regulation lawsuit". Every one of them asks for the AI
    // INDUSTRY: labs, papers, policy, funding. Measured against the feed those
    // queries produced, not one story in the first twenty named a phone, a
    // price or a rupee.
    //
    // The channels this category is for run a different show. Prasadtechintelugu
    // episode 2242 was "Mobiles GST, GPT 6 Astra, Anker Sleeplab, GTA 6 PC, Edge
    // 70 Neo"; TechFacts 1777 was "Samsung S27 Charging, Vi's New Name, Apple
    // CEO Salary, JioHotstar, Xiaomi 165W Powerbank, Vivo T5, MiVi New Phone".
    // Roughly six parts phones, two parts telecom and deals, one part
    // accessories, one part apps and services, and AI only when it ships to a
    // consumer.
    //
    // So one line per facet of THAT show. The no-company-names rule from the
    // top of this file still holds: naming Samsung buys Samsung's week. The one
    // apparent exception is the telecom line, and it is not an exception, it
    // asks for the recharge plan, which is the event.
    //
    // ── KEEP THEM SHORT ─────────────────────────────────────────────────────
    // Measured, not assumed. Google News punishes long noun piles badly enough
    // to return nothing at all: "earbuds smartwatch power bank charger launched
    // India" returned ZERO items on a live pass, while "power bank launched
    // India" returned 59 and "earbuds launched India" 14. Three or four words
    // is the working length, and every line below was probed at that length
    // before it went in. If a facet needs two nouns, it needs two lines.
    googleNews: [
      "smartphone launched India price",
      "smartphone launch date confirmed India",
      "smartphone specifications leaked ahead of launch",
      "mobile phone price cut India offer",
      "smartphone sale offer discount India",
      "power bank launched India",
      "earbuds launched India",
      "laptop launched India",
      "app update new feature rollout users",
      // The only AI line, and it asks for AI that SHIPS: an assistant in a
      // phone, a feature in an app. The industry's labs, funding and research
      // are what the old query set was made of and what `low` now scores 0-2.
      "AI feature smartphone app rollout",
    ],
    // Telecom, the Jio/Airtel/Vi plan changes these channels run as their own
    // segment, has no query here on purpose: every phrasing tried returned a
    // single item, because Google News barely indexes it inside a one-day
    // window. The telecomtalk feed below carries it properly, twenty items and
    // something new every few hours, so a query slot spent on it is a slot
    // wasted.

    // Paid-source terms, deliberately broader than the Google News ones above:
    // one paid request returns thirty articles, so a narrow phrase wastes it.
    apidirectNews: [
      "smartphone launch India", "mobile phone news India", "gadget launch India",
      "smartphone price India", "consumer technology India", "telecom recharge plan India",
      "laptop launch India", "wearables audio launch India", "smartphone deals offers",
      "mobile app features update",
    ],

    // ── NO HACKER NEWS, NO ARXIV, NO GITHUB ─────────────────────────────────
    // All three were on, and all three are wrong for this category rather than
    // merely unhelpful. Hacker News is a developer forum: it supplied "Super
    // Smash Brothers Melee has been 100% decompiled with the help of LLMs" and
    // "Tao: Open math problems being non-renewably mined by AI", both of which
    // scored well and neither of which a gadget channel could open a video with.
    // arXiv is preprints. GitHub is repositories. A creator covering the POCO
    // X8's battery has no use for any of them, and their volume was crowding out
    // the launches that ARE the category.
    hn: [],
    arxiv: false,
    github: false,

    // ── FEEDS THAT ACTUALLY COVER PHONES, AND MOSTLY COVER THEM IN INDIA ────
    // Every URL below was live-probed. The old list was openai, deepmind,
    // huggingface, nvidia, microsoft, googleblog, techcrunch-ai and venturebeat-ai
    // in the `primary` tier, which is to say the heaviest source weight in the
    // collector was spent entirely on AI lab announcements.
    //
    // `primary` now means an outlet whose core beat is Indian consumer hardware,
    // because that is what should win a tie in this category.
    rss: [
      // Indian gadget desks. Gadgets360 is NDTV's and is the closest thing this
      // category has to a wire: a thousand items and something new most hours.
      { source: "gadgets360", kind: "primary", url: "https://www.gadgets360.com/rss/news" },
      { source: "fonearena", kind: "primary", url: "https://www.fonearena.com/blog/feed" },
      { source: "smartprix", kind: "primary", url: "https://www.smartprix.com/bytes/feed/" },
      { source: "ht-tech", kind: "primary", url: "https://tech.hindustantimes.com/rss/tech" },
      // Telecom is its own segment on these channels, the Jio/Airtel/Vi plan
      // changes and offers, and no general tech feed covers it properly.
      { source: "telecomtalk", kind: "primary", url: "https://telecomtalk.info/feed/" },

      // Phone launches worldwide. India gets most of these a week later, which
      // is exactly the "coming soon" material these channels run on.
      { source: "gsmarena", kind: "outlet", url: "https://www.gsmarena.com/rss-news-reviews.php3" },
      { source: "androidauthority", kind: "outlet", url: "https://www.androidauthority.com/feed/" },
      { source: "androidpolice", kind: "outlet", url: "https://www.androidpolice.com/feed/" },
      { source: "xda", kind: "outlet", url: "https://www.xda-developers.com/feed/" },
      { source: "techpp", kind: "outlet", url: "https://techpp.com/feed/" },

      // General Indian tech desks: real gadget coverage mixed with politics,
      // entertainment and business, so they are filtered.
      { source: "indianexpress-tech", kind: "outlet", url: "https://indianexpress.com/section/technology/feed/", filter: true },
      { source: "digit", kind: "outlet", url: "https://www.digit.in/feed/", filter: true },
    ],

    // ── THE TEST IS NOW "IS THERE A PRODUCT IN IT" ──────────────────────────
    // The old one was a list of AI and big-tech words, which is what let an
    // OpenAI funding round through and dropped a phone launch. This asks for
    // the vocabulary of consumer hardware and the things that happen to it:
    // launches, prices, batteries, cameras, plans, offers, updates.
    filterTerms:
      /\b(smartphones?|phones?|mobiles?|handsets?|tablets?|laptops?|notebooks?|earbuds?|headphones?|earphones?|smartwatch(es)?|wearables?|power ?banks?|chargers?|smart ?tv|projector|camera|display|screen|battery|charging|processor|chipset|soc|snapdragon|dimensity|exynos|tensor|ram|storage|android|ios|iphone|ipad|macbook|galaxy|pixel|oneplus|xiaomi|redmi|poco|realme|vivo|iqoo|oppo|motorola|nothing|infinix|tecno|lava|micromax|samsung|apple|launch(ed|es)?|unveil(ed|s)?|price|priced|pricing|cost|discount|offers?|sale|deal|cashback|emi|gst|specs?|specifications?|features?|update|rollout|firmware|one ?ui|hyperos|oxygenos|beta|5g|4g|recharge|prepaid|postpaid|plan|tariff|data pack|jio|airtel|vodafone|\bvi\b|bsnl|app|whatsapp|upi|play store|app store)\b/i,

    editor:
      "phones, gadgets and consumer technology for an INDIAN audience: what launched, " +
      "what it costs in rupees, when you can buy it, and what deal is on",

    // ── WHAT DESERVES A VIDEO ON A GADGET CHANNEL ───────────────────────────
    // The old bar rewarded "a frontier model launch, a major acquisition, a
    // serious outage or breach, a landmark lawsuit ruling", which is why the
    // feed filled with exactly those. A creator opening a video with a lawsuit
    // ruling has no product to hold up.
    top:
      "A phone launched in India with a price, a big price cut or a GST or tariff change, " +
      "a flagship's India availability and date, a major telecom plan or tariff change, " +
      "a sale with real discounts on things people buy.",
    mid:
      "A credible spec leak or a confirmed launch date, a mid-range or budget launch, " +
      "an accessory or wearable launch, a software update that visibly changes something, " +
      "a widely used app shipping a real new feature.",
    low:
      "AI research, papers, benchmarks and lab drama. Funding rounds, valuations, share " +
      "prices and analyst commentary. Enterprise, cloud, developer tooling and open-source " +
      "project news. Policy and lawsuits with no product attached. Opinion columns. Anything " +
      "with no product a viewer can actually buy, use or hold.",

    // Read by buildPrompt in services/newsRanker.js and appended to the bar above.
    caution:
      "This channel's audience buys these products. A story carrying an India price, an " +
      "India launch date or an India-specific offer is worth more than the same story " +
      "without them. A US-only price or availability is a weaker version of the story, not " +
      "an equal one. AI counts ONLY when it ships to consumers, an assistant in a phone, a " +
      "feature in an app people use; AI as an industry, its labs, its funding, its research " +
      "and its politics, is not this channel's subject however large the news is.",

    /* ── WHAT THE VOICE ANALYST LOOKS FOR IN *THIS* CATEGORY ─────────────────
       The shared analysis in services/voiceProfileService.js captures how a
       person talks: openings, closings, fillers, code-mixing. That is necessary
       and it is not sufficient, because two tech creators with identical
       openings still sound nothing alike once they reach a spec sheet.

       What separates them is category vocabulary, and it is almost entirely
       unrecoverable from a generic prompt: whether a battery is "6000 mAh" or
       "chhe hazaar", whether ₹15,000 is said as "pandrah hazaar" or "fifteen
       thousand", whether every phone is silently benchmarked against one
       reference phone. Ask for those by name and the model finds them; do not
       ask, and you get "energetic and engaging" for the tenth time.

       Each entry is field name → what the analyst is told to extract. They are
       appended to the JSON schema, so adding a field here is a config change. */
    voice: {
      /**
       * ── BUMP THIS WHENEVER A FIELD BELOW CHANGES ──────────────────────────
       * Stored on the profile as `built_for_spec`. Without it, a profile that
       * already carries built_for_category "tech_gadgets" looks current after
       * this file gains six new fields, so the staleness check passes and the
       * creator is CHARGED to pick up questions they never asked to be asked.
       * A mismatch on either the category or this number earns the free rebuild.
       */
      version: 5,

      /**
       * ── NO EXAMPLE IN THIS FILE MAY COME FROM A REAL CREATOR ─────────────
       * Every string below is sent, unchanged, to the analyser for EVERY
       * creator on the platform. So an example phrase here is not an
       * illustration, it is a thumbprint: the analyser reads "reaction beats,
       * for example 'wow, nice'" and goes looking for that beat, in that
       * register, in a language the creator may not speak. Version 3 of this
       * spec carried one Telugu creator's own lines as the examples for
       * reaction_beats, viewer_advice, native_metaphor and show_me_phrases,
       * and his measured on-screen-cue rate as the expected rate for
       * everybody. Every profile built against it was pulled toward one man
       * in one language.
       *
       * The rule, and it has no exceptions: THESE PROMPTS DESCRIBE THE MOVE.
       * THE CREATOR'S OWN TRANSCRIPTS SUPPLY THE WORDS. A unit ('6000 mAh')
       * is a fact about hardware and may be quoted. Anything a person would
       * SAY may not.
       */
      guidance:
        `This creator makes technology and gadget videos. The most distinctive thing ` +
        `about them is NOT their accent or their energy, it is the specific vocabulary ` +
        `they use for products, numbers and money, and every one of those has a house ` +
        `style that varies enormously between creators. Quote it verbatim, in the ` +
        `original script. Where they keep an English word (and for model numbers, ` +
        `brand names and units they almost always will), record that it stays English.\n\n` +
        `Pay particular attention to three things a transcript makes easy to miss, ` +
        `because they read as filler and are not: sentences that POINT AT SOMETHING ON ` +
        `SCREEN, sentences carrying a personal reaction or a remembered experience, and ` +
        `sentences that stop to explain what an unfamiliar company, unit or acronym ` +
        `actually is. On a creator who leans on them these can be a third of the script, ` +
        `and they are the difference between a piece of writing and something a person ` +
        `can stand in front of a camera and record. Report THIS creator's own rate, read ` +
        `off their transcripts. Some creators barely do any of it; that is a finding, not ` +
        `a gap to fill.`,

      // Asked in both lanes: these are true of the creator, not of the format.
      fields: {
        spec_delivery:
          "How they voice a specification. Do they read the unit out as written ('6000 mAh', " +
          "'120 hertz'), or round it into ordinary speech using their own language's number " +
          "words? Do they pair every spec with a real-world consequence, or just state it and " +
          "move on? Give verbatim examples in their own words.",
        price_talk:
          "How they say money. Is a figure like '₹15,000' spoken as digits, in their own " +
          "language's number words, in English number words, or mixed? Do they always name a " +
          "price, do they talk in price BANDS ('under X') as well as exact figures, and do " +
          "they pass judgement on the value out loud? Verbatim examples.",
        verdict_vocabulary:
          "The exact words they use to recommend, to reject, and to withhold judgement, " +
          "whatever those are in their language. Quote what they actually say, not a " +
          "translation of it. Verbatim, up to 8.",
        comparison_habit:
          "Do they benchmark against other products, and which ones do they use as the " +
          "yardstick? Name the brands or models they keep returning to for comparison.",
        brand_handling:
          "Which brand and model names stay in English (nearly always all of them), any " +
          "abbreviations or nicknames they use, and how they pronounce anything unusual.",
        hype_calibration:
          "Their default excitement level and what makes them break it. Are they the hype " +
          "channel, the sceptic, or flat and factual? What actually impresses them? Include " +
          "the VERBATIM phrases they use to admit uncertainty, about an India launch, a " +
          "price, or whether something arrives at all, because hedging honestly is part of " +
          "how this kind of creator keeps their audience's trust.",
        deal_callout:
          "Whether and how they push links, offers or affiliate deals, phrased verbatim. " +
          "Empty string if they never do it.",
        viewer_address:
          "The exact word or phrase they call the viewer. Verbatim, in their script.",

        /* ── THE THREE THINGS A SCRIPT NEEDS TO BE SHOOTABLE ────────────────
           Everything above describes how they sound. These describe what they
           DO while talking, and a script missing them is a correct essay that
           nobody can stand in front of a camera and perform. */

        show_me_phrases:
          "THE MOST IMPORTANT NEW FIELD. The verbatim words they use to point at something " +
          "on screen: 'look at this', 'you can see here', 'let's see'. These are the lines " +
          "an editor cuts footage to. Collect every distinct one, up to 10, exactly as spoken. " +
          "Return an empty array rather than inventing plausible ones. " +
          "ONLY REUSABLE ONES: keep the short general phrases that would work over any shot. " +
          "EXCLUDE any phrase that only works while the creator is physically holding or " +
          "operating the product, or that refers to something happening live in that very " +
          "moment, because those cannot be reused for a story they are only reporting on, and a " +
          "cue that does not match what is on screen is a sentence a viewer cannot follow.",
        reaction_beats:
          "Short standalone lines that carry FEELING rather than information, spoken as their " +
          "own sentence rather than tucked inside a longer one: an exclamation, a wistful " +
          "aside, a blunt reaction. Verbatim, up to 6, in whatever words they actually use. " +
          "These are what make a script readable aloud instead of a wall of prose. Return an " +
          "empty array rather than inventing plausible ones.",
        personal_anecdote:
          "How they bring in their own experience, or a memory they assume the viewer shares. " +
          "Describe the move in one line and give one verbatim example of the whole thing, " +
          "not just the opening words.",
        explainer_move:
          "The shape they use when they stop to explain an unfamiliar company, acronym or " +
          "unit the audience may not know. Give the pattern AND one full verbatim example, " +
          "including what they compare it to. Empty string if they never do this.",
        viewer_advice:
          "What they tell the viewer to DO, as opposed to what they think of the product: " +
          "instructions, warnings, things to try, things to hold off on. Verbatim, up to 6, " +
          "in their own words.",
        native_metaphor:
          "Figures of speech in their own language, the colourful ones: the images they reach " +
          "for instead of saying a thing plainly. NOT their fillers or sign-offs, which are " +
          "collected elsewhere. This is what makes writing read as theirs rather than as a " +
          "translation. Verbatim, up to 6, empty array if they are plain-spoken.",

        /* ── THE CONNECTIVE TISSUE ──────────────────────────────────────────
           Every field above this point asks about a MOVE: how they say a spec,
           a price, a verdict. None of them asks about the words BETWEEN the
           moves, and that turned out to be most of what makes a person
           recognisable.

           Measured on one creator: at his own rates, a 332-word script of his
           should carry about 35 instances of his register and his connectives.
           The generated scripts carried 2. Every content move we had stored a
           verbatim example of came back; every function word we had never
           asked about vanished, and the drafts read like clean written prose
           by nobody in particular.

           These four fields ask for the words nobody notices until they are
           missing. */

        speech_register:
          "Every language has a careful written form and a relaxed spoken one, and in some " +
          "languages the gap between them is enormous. Which does this creator use: the formal " +
          "written register, the everyday spoken register, or a specific regional variety of " +
          "it? Answer in one line, naming the variety if you can identify it. This matters " +
          "more than any other field here: a listener hears it in the first sentence.",
        register_markers:
          "The VERBATIM forms that MARK the register you just named: the verb endings, " +
          "contractions, pronunciations or word choices that a careful editor would " +
          "'correct' into the formal written version. Give the creator's own form, exactly " +
          "as they say it, up to 8. If they speak the formal written form throughout, return " +
          "an empty array. Do not translate these and do not normalise the spelling.",
        discourse_particles:
          "The near-meaningless words holding their sentences together: the particle they " +
          "attach for emphasis, the word they habitually begin a sentence with, the connector " +
          "they use instead of a full stop, their fillers. These are usually among the most " +
          "FREQUENT words in the whole transcript and the easiest to overlook, because they " +
          "carry no information at all. Up to 10, verbatim, each with a note in the same " +
          "string saying where it sits (start of a sentence, after the topic word, at the " +
          "end). Return an empty array rather than guessing.",
        section_transitions:
          "How they move between SECTIONS OF ONE SUBJECT, as opposed to between separate " +
          "stories: the phrase that closes off the camera and opens the battery, or ends the " +
          "specs and starts the price. Verbatim, up to 8. Empty array if they run straight " +
          "through without signposting.",

        /* ── WHAT THEY DO THAT THE STORY DID NOT ASK FOR ─────────────────── */

        cross_promo:
          "Whether they point viewers at their OWN other videos or channel, and how. Some " +
          "creators end every short video by sending people to a longer one; for them it is " +
          "the whole point of the video and a script without it is missing its ending. Give " +
          "the verbatim phrasing and say whether it is a standing habit or a one-off. Empty " +
          "string if they never do it.",
        never_does:
          "NEGATIVE SPACE. Common things creators in this field do that THIS ONE NEVER DOES " +
          "across any transcript: greeting the viewer, naming the channel up front, " +
          "introducing themselves, asking for a subscribe before the content, thanking " +
          "sponsors, and so on. Only list what you can confirm is absent from EVERY " +
          "transcript. This is as load-bearing as anything they do say: an invented greeting " +
          "is the fastest way to make a script sound like somebody else.",
      },

      // Asked only in the lane named. The long lane's three fields are the whole
      // reason this file has lanes at all: none of them can be observed in a Short.
      laneFields: {
        short: {
          compression:
            "How they fit one product into a short-form slot of roughly two minutes or less. " +
            "What do they cut, what do they always keep, and how fast do they reach the point?",
        },
        long: {
          bulletin_transitions:
            "THE MOST IMPORTANT FIELD IN THIS ANALYSIS. The verbatim phrases they use to " +
            "close one story and open the next. Collect every distinct one you can find, up " +
            "to 10, exactly as spoken in their own language. If you cannot find any, return " +
            "an empty array rather than inventing plausible ones.",
          segment_names:
            "Recurring NAMED segments inside their long videos, quoted exactly as they say " +
            "the name. Empty array if they have none.",
          running_order:
            "How they sequence a multi-story video. Do they lead with the biggest story or " +
            "build to it? Do they group by brand, by category, by importance? Do they " +
            "signpost how many items are coming at the top?",
        },
      },
    },

    /* ── THE SHAPES OF VIDEO THIS CATEGORY ACTUALLY PUBLISHES ────────────────
       Measured from live channels, not assumed. Two formats that look obvious
       are deliberately absent: unboxing and hands-on review. They are the most
       rigid skeletons in the category, which makes them tempting, and they are
       unsourceable here: weight, heat, camera samples and "I used it for a week"
       exist in nobody's news feed. A skeleton this product cannot honestly fill
       is how a creator ends up reading an invented benchmark to their audience. */
    script: {
      formats: [
        {
          id: "single_story",
          label: "One story, in depth",
          lane: "short",
          minStories: 1,
          maxStories: 1,
          beats: [
            "Open the way they open, naming the product or company in the first sentence.",
            "What actually happened or launched.",
            "The specifications or numbers that matter, each tied to what it means in use.",
            "Price and availability, where the sources give them.",
            "Their verdict: is it worth it, and who for.",
          ],
          discipline:
            "One subject only. Do not widen into the industry, the competitor, or what it " +
            "signals about the market unless the sources do it first.",
          onScreen: {
            density: "some",
            cueTo:
              "the official render or product image, a spec table the creator puts up, the " +
              "price on screen",
          },
        },
        {
          id: "bulletin",
          label: "Daily tech bulletin",
          lane: "long",
          minStories: 3,
          maxStories: 14,
          beats: [
            "Their opening, then a quick signpost of what today's episode covers. Name two or three of the biggest items, not all of them.",
            "Then one block per story, in the order given: what it is, what actually happened, the one number that matters, and their read on it.",
            "Between every pair of stories, one of THEIR OWN transition phrases. Never the same one twice in a row.",
            "Their recap and sign-off.",
          ],
          discipline:
            "Every story gets its own facts and only its own facts. Do not carry a number " +
            "from one story into another, and do not invent a link between two stories " +
            "that the sources do not make. Stories with thin material get a shorter block, " +
            "not invented detail.",
          onScreen: {
            // Low, and measured rather than guessed: this creator's own price-list
            // video pointed at the screen in 4% of its sentences against 44% in a
            // feature demo. A bulletin is cutting between many products, so a cue
            // in every block would be a cue nobody can follow.
            density: "low",
            cueTo:
              "the product image or the price for the story being read at that moment, " +
              "never anything belonging to another story in the same script",
          },
        },
        {
          id: "explainer",
          label: "Explainer or opinion",
          lane: "long",
          minStories: 1,
          maxStories: 3,
          beats: [
            "The claim, stated plainly in their voice.",
            "Why it is happening now.",
            "The evidence, drawn only from the sources.",
            "What it actually means for the viewer.",
            "Where they land on it.",
          ],
          discipline:
            "This is the one format where their opinion is the point, so their stance may " +
            "be stated with confidence. The FACTS it rests on are still bound by the " +
            "sources: no invented figures, no predictions dressed as reporting.",
          onScreen: {
            density: "low",
            cueTo:
              "a chart or comparison the creator builds themselves, or a figure named in " +
              "the sources",
          },
        },
      ],
    },
  },

  {
    id: "finance",
    label: "Stock market & finance",
    blurb: "Markets, results season, IPOs, RBI, the rupee",
    // Built and kept, not offered. See MAX_CATEGORIES below.
    enabled: false,
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
    // Built and kept, not offered. See MAX_CATEGORIES below.
    enabled: false,
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
    // Built and kept, not offered. See MAX_CATEGORIES below.
    enabled: false,
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
    // Built and kept, not offered. See MAX_CATEGORIES below.
    enabled: false,
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
    // Built and kept, not offered. See MAX_CATEGORIES below.
    enabled: false,
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
    // Built and kept, not offered. See MAX_CATEGORIES below.
    enabled: false,
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

export const DEFAULT_CATEGORY = "tech_gadgets";

/**
 * ── ONE CATEGORY, DONE PROPERLY ──────────────────────────────────────────────
 * Was 3. The engine below this point is now category-specific in three separate
 * places, the voice analysis, the script formats and the writer's prompt, and
 * each of those is real work per category done properly rather than a config
 * line. Offering seven of them half-built is worse for a creator than offering
 * one that actually knows what a tech video is.
 *
 * The other six categories are still fully configured in this file, with their
 * queries, feeds and editorial bars intact. They are switched off, not deleted,
 * because turning one back on after building its `voice` and `script` blocks is
 * then a one-word change rather than an archaeology exercise.
 */
export const MAX_CATEGORIES = parseInt(process.env.MAX_USER_CATEGORIES || "1", 10);

export function getCategory(id) {
  return BY_ID.get(String(id || "")) || null;
}

export function isValidCategory(id) {
  return BY_ID.has(String(id || ""));
}

/** Switched on for users. Everything else here is built but not offered. */
export function isEnabledCategory(id) {
  return getCategory(id)?.enabled === true;
}

/** The enabled ones, in file order. */
export function enabledCategories() {
  return CATEGORIES.filter((c) => c.enabled === true);
}

/**
 * Only what the UI needs, the fetch config is server-side detail.
 *
 * Filtered to the enabled set: a card a user can see is a card they can pick,
 * and a picker that shows six disabled options is a worse answer than a picker
 * that shows one real one.
 */
export function publicCategories() {
  return enabledCategories().map((c) => ({ id: c.id, label: c.label, blurb: c.blurb }));
}

/* ── The per-category engine config ────────────────────────────────────────── */

/**
 * The extra fields the voice analyst is asked for in this category and lane.
 *
 * Returns { guidance, fields } already merged, so the caller never has to know
 * that some fields are shared and some are lane-specific. An unconfigured
 * category returns empty and the analysis falls back to the shared prompt
 * alone, which is exactly what it did before any of this existed.
 */
export function voiceSpecFor(categoryId, lane = "short") {
  const v = getCategory(categoryId)?.voice;
  if (!v) return { guidance: "", fields: {}, version: 0 };
  return {
    guidance: v.guidance || "",
    fields: { ...(v.fields || {}), ...(v.laneFields?.[lane] || {}) },
    version: v.version || 1,
  };
}

/**
 * Is a stored profile's answer set older than the questions we now ask?
 *
 * Two ways to be stale, and both have to be checked. The profile may have been
 * built for a DIFFERENT category, in which case its answers are about the wrong
 * subject. Or it may have been built for this category before the field list
 * changed, in which case the answers are right and incomplete.
 *
 * The second case is the one that bites: a profile carrying
 * built_for_category "tech_gadgets" looks perfectly current, so nothing offers
 * the rebuild and the creator pays for it the next time they press Analyse.
 */
export function voiceSpecStale(categoryId, builtForCategory, builtForSpec) {
  if (!categoryId) return false;
  if ((builtForCategory || "") !== categoryId) return true;
  return Number(builtForSpec || 0) < (getCategory(categoryId)?.voice?.version || 1);
}

/** Every format defined for a category, or [] if it has none yet. */
export function formatsFor(categoryId) {
  return getCategory(categoryId)?.script?.formats || [];
}

/** One format by id, scoped to its category so two categories may reuse an id. */
export function getFormat(categoryId, formatId) {
  return formatsFor(categoryId).find((f) => f.id === String(formatId || "")) || null;
}

/**
 * Which format to write in, given the category, the lane and how many stories
 * the creator actually picked.
 *
 * Story count decides it, because it is the one signal that cannot be wrong:
 * somebody who selected nine stories is making a bulletin whatever the ranker
 * guessed about any one of them. The ranker's per-item suggestion is used only
 * to break the tie at a single story, where "is this a news hit or a thesis"
 * is a genuine editorial judgement rather than arithmetic.
 */
export function pickFormat(categoryId, lane, storyCount = 1, suggested = "") {
  const all = formatsFor(categoryId);
  if (!all.length) return null;

  const n = Math.max(1, Math.round(Number(storyCount) || 1));
  const fits = all.filter(
    (f) => f.lane === lane && n >= (f.minStories || 1) && n <= (f.maxStories || 1)
  );

  if (!fits.length) {
    // No exact fit: fall back to any format in this lane, then to the first
    // defined format, so the writer always has beats rather than none.
    return all.find((f) => f.lane === lane) || all[0];
  }
  if (fits.length === 1) return fits[0];

  return fits.find((f) => f.id === String(suggested || "")) || fits[0];
}

/** Format ids the ranker is allowed to suggest, for its stage-2 prompt. */
export function formatIdsFor(categoryId) {
  return formatsFor(categoryId).map((f) => f.id);
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
    const id = LEGACY_IDS[String(raw || "").trim()] || String(raw || "").trim();
    // Enabled, not merely valid. A stored selection naming a switched-off
    // category is exactly what every pre-existing account holds, and letting it
    // through would mean serving a feed the engine can no longer write for.
    if (isEnabledCategory(id) && !out.includes(id)) out.push(id);
    if (out.length >= MAX_CATEGORIES) break;
  }
  return out;
}

/**
 * Ids that used to mean something else. Read on the way in, everywhere.
 *
 * `ai_tech` became `tech_gadgets` when the category stopped being about AI news
 * and started being about what these channels actually publish, which is phones
 * far more often than models. scripts/migrateSingleCategory.js rewrites the
 * stored copies; this map is what makes an in-flight request, a cached client
 * payload or an un-migrated row survive the gap rather than 400.
 */
export const LEGACY_IDS = { ai_tech: "tech_gadgets" };

/** Map a possibly-legacy id forward. Returns "" for anything unrecognised. */
export function canonicalCategory(id) {
  const raw = String(id || "").trim();
  const mapped = LEGACY_IDS[raw] || raw;
  return isValidCategory(mapped) ? mapped : "";
}

/**
 * A selection that is always usable, for callers that cannot show a picker.
 *
 * sanitizeSelection() returning [] is meaningful, it is what the onboarding gate
 * reads as "has not chosen yet". This is the other question: give me something
 * valid to work with regardless. With one category enabled the answer is always
 * the same, which is the point.
 */
export function coerceSelection(ids) {
  const clean = sanitizeSelection(ids);
  if (clean.length) return clean;
  const first = enabledCategories()[0];
  return first ? [first.id] : [];
}

export default {
  CATEGORIES, getCategory, isValidCategory, isEnabledCategory, enabledCategories,
  publicCategories, sanitizeSelection, coerceSelection, canonicalCategory, LEGACY_IDS,
  MAX_CATEGORIES, DEFAULT_CATEGORY,
  voiceSpecFor, voiceSpecStale, formatsFor, getFormat, pickFormat, formatIdsFor,
};
