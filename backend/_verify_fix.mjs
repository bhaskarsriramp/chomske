import { getCategory } from "./services/categories.js";
import { fetchGoogleNews } from "./services/sources/googleNews.js";
import { fetchRssFeed } from "./services/sources/rss.js";
import { pickCandidates } from "./services/newsRanker.js";
import { titleSignature } from "./utils/normalize.js";

const now = Date.now();
for (const id of ["finance", "ai_tech"]) {
  const cat = getCategory(id);
  const gn = await fetchGoogleNews(cat.googleNews, cat.locale);
  let rss = [];
  for (const f of cat.rss) rss.push(...await fetchRssFeed(f, f.filter ? cat.filterTerms : null));

  // Exactly what the collector now does.
  const ex = cat.excludeTerms || null;
  let dropped = 0;
  const rows = [...gn, ...rss]
    .filter(i => { if (ex && ex.test(i.title)) { dropped++; return false; } return true; })
    .filter(i => i.published_at && (now - new Date(i.published_at).getTime()) < 48*3600000)
    .map(i => { const h = (now - new Date(i.published_at).getTime())/3600000;
      return { ...i, _id: i.url, title_sig: titleSignature(i.title), cluster_id: "",
               raw_score: Math.pow(0.5, h/8)*0.55 + 0.165, age: h }; })
    .sort((a,b) => b.raw_score - a.raw_score);

  const picked = pickCandidates(rows, 60, now);
  const ages = picked.map(p => p.age).sort((a,b)=>a-b);
  console.log(`\n######## ${id} ########`);
  console.log(`  ${rows.length} rows in pool · ${dropped} wire noise excluded`);
  console.log(`  RANKING WINDOW now spans ${ages[0].toFixed(1)}h -> ${ages[ages.length-1].toFixed(1)}h  (was ~0-3h)`);
  console.log(`  age spread: <2h ${ages.filter(a=>a<2).length} | 2-6h ${ages.filter(a=>a>=2&&a<6).length} | 6-12h ${ages.filter(a=>a>=6&&a<12).length} | 12h+ ${ages.filter(a=>a>=12).length}`);
  console.log("  a sample of what now gets judged that previously could not:");
  picked.filter(p=>p.age>4).slice(0,7).forEach(p=>console.log(`    ${p.age.toFixed(1).padStart(5)}h  ${p.title.slice(0,66)}`));
}
