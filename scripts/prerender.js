/**
 * postbuild: run react-snap, and make its outcome impossible to miss.
 *
 * Why this wrapper exists instead of calling `react-snap` straight from the npm
 * script: `reactSnap.include` in package.json already listed /terms,
 * /privacy-policy etc, but nothing ever verified react-snap actually produced
 * them — it was silently failing (see the puppeteer note below) and nginx
 * served a raw 404 for every route react-snap should have pre-rendered.
 *
 * The failure mode (same one betaFounderProduction hit and documented in its
 * own scripts/prerender.js): react-snap 1.23 depends on puppeteer 1.20, which
 * carries Chromium 686378 — Chrome 76, from July 2019. Optional chaining and
 * nullish coalescing (both used throughout this bundle) arrived in Chrome 80,
 * so that Chromium dies on `SyntaxError: Unexpected token '?'` before React can
 * mount, on every route. package.json pins react-snap's puppeteer to ^13.7.0
 * via `overrides` to fix this — if that override is ever dropped, pre-rendering
 * breaks again, silently, unless this wrapper is still in the postbuild chain.
 *
 * This script takes a deliberate position on failure:
 *   - react-snap worked  → report every route it rendered.
 *   - react-snap failed  → print a loud banner and exit 0.
 *
 * Exit 0 on failure is the point. A missing pre-render is an SEO regression
 * (routes fall back to a 404 instead of real content), not a broken app — the
 * client-side SPA still works for anyone who lands on "/" first. Failing the
 * build would take the whole deploy down over that. The banner here is what
 * makes the regression visible instead of silent.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BUILD_DIR = path.join(ROOT, 'build');
const INDEX_HTML = path.join(BUILD_DIR, 'index.html');
const REACT_SNAP = path.join(ROOT, 'node_modules', 'react-snap', 'run.js');

const banner = (lines) => {
  const bar = '─'.repeat(74);
  console.log('\n' + bar);
  lines.forEach((l) => console.log(l));
  console.log(bar + '\n');
};

function fail(why) {
  banner([
    '  PRE-RENDERING DID NOT RUN — the site will still work, but routes in',
    '  reactSnap.include (terms, privacy-policy, etc.) will 404 on a direct',
    '  or refreshed navigation instead of serving real content.',
    '',
    `  reason: ${why}`,
    '',
    '  Read the react-snap output above for the real cause. The one that has',
    '  actually bitten this project:',
    '    "SyntaxError: Unexpected token \'?\'" — Chromium too old for the bundle.',
    '      Check package.json still has overrides.react-snap.puppeteer = ^13.7.0',
    '      and that it was actually installed (node_modules/puppeteer/package.json).',
    '    "200.html is present in the sourceDir" — a previous run left artifacts.',
    '      Handled automatically now; if you see it, build/ was not rebuilt.',
  ]);
  process.exit(0);
}

if (!fs.existsSync(REACT_SNAP)) {
  fail('node_modules/react-snap is not installed');
}

// react-snap is not idempotent: it writes build/200.html and then refuses to
// start if that file already exists. Clear its own markers first so this
// script can always be re-run after a failed attempt.
for (const leftover of ['200.html', '404.html']) {
  const f = path.join(BUILD_DIR, leftover);
  if (fs.existsSync(f)) {
    fs.unlinkSync(f);
    console.log(`  cleared stale ${leftover} from a previous react-snap run`);
  }
}

console.log('Pre-rendering marketing routes with react-snap...');
const res = spawnSync(process.execPath, [REACT_SNAP], { cwd: ROOT, stdio: 'inherit' });

if (res.error) fail(res.error.message);
if (res.status !== 0) fail(`react-snap exited with code ${res.status}`);

const html = fs.existsSync(INDEX_HTML) ? fs.readFileSync(INDEX_HTML, 'utf8') : '';
if (/<div id="root">\s*<\/div>/.test(html) || !html) {
  fail('react-snap reported success but left #root empty');
}

const routes = ['/'];
for (const entry of fs.readdirSync(BUILD_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === 'static') continue;
  if (fs.existsSync(path.join(BUILD_DIR, entry.name, 'index.html'))) routes.push('/' + entry.name);
}

banner([
  `  Pre-rendered ${routes.length} route(s): ${routes.join(', ')}`,
  `  build/index.html is now ${html.length} bytes of real HTML (was an empty shell).`,
]);
