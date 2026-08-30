/**
 * postbuild: make CRA's generated CSS link non-blocking
 *
 * CRA injects <link rel="stylesheet" href="/static/css/main.HASH.css"> into
 * every built HTML file. That tag is render-blocking — the browser won't paint
 * a single pixel until the CSS downloads. This script replaces it with the
 * preload + onload pattern so the browser can paint the #_plh placeholder
 * immediately while the full CSS loads in parallel.
 *
 * Handles BOTH attribute orderings that CRA / react-snap may produce:
 *   <link href="..." rel="stylesheet">        ← CRA default
 *   <link rel="stylesheet" href="...">        ← react-snap output
 *
 * Run order: react-scripts build → react-snap → this script
 */

const fs   = require('fs');
const path = require('path');

const BUILD_DIR = path.join(__dirname, '..', 'build');

const ASYNC_CSS = (href) =>
  `<link rel="preload" href="${href}" as="style" onload="this.onload=null;this.rel='stylesheet'">` +
  `<noscript><link rel="stylesheet" href="${href}"></noscript>`;

/**
 * Scans every <link> tag in the HTML.
 * A tag is "blocking" when it has BOTH:
 *   rel="stylesheet"  AND  href="/static/css/...css"
 * and has NOT already been converted to rel="preload".
 */
function makeCSSAsync(html) {
  let replaced = 0;
  const result = html.replace(/<link\b[^>]+>/gi, (tag) => {
    if (!/\brel="stylesheet"/i.test(tag)) return tag;           // not a stylesheet
    const m = tag.match(/\bhref="(\/static\/css\/[^"]+\.css)"/i);
    if (!m) return tag;                                         // not our bundle
    replaced++;
    return ASYNC_CSS(m[1]);
  });
  return { result, replaced };
}

function processFile(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');
  const { result, replaced } = makeCSSAsync(original);

  if (replaced > 0) {
    fs.writeFileSync(filePath, result, 'utf8');
    console.log(`  ✓ Made ${replaced} CSS link(s) non-blocking: ${path.relative(BUILD_DIR, filePath)}`);
  } else if (/\/static\/css\/[^"]+\.css/i.test(original)) {
    // CSS is referenced but already async — react-snap may have handled it
    console.log(`  ℹ CSS already non-blocking (react-snap inlined?): ${path.relative(BUILD_DIR, filePath)}`);
  } else {
    console.log(`  - No /static/css link found in: ${path.relative(BUILD_DIR, filePath)}`);
  }
}

function walkDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory())       walkDir(full);
    else if (entry.name.endsWith('.html')) processFile(full);
  }
}

if (!fs.existsSync(BUILD_DIR)) {
  console.error('ERROR: build/ directory not found — run npm run build first');
  process.exit(1);
}

console.log('Making CSS non-blocking in build/...');
walkDir(BUILD_DIR);
console.log('Done.');
