# launch/: "Generate product demo"

A website address in, a finished launch video out, with no recording. In the app it is the
**Generate product demo** button in Demo Studio; the worker runs this folder's pipeline.

## In the app

| piece | file |
|---|---|
| page: form, progress, player, versions, chat | `src/components/Studio/LaunchPage.js`, `launchApi.js` |
| routes `/studio/launch` (daily allowance, URL checks) | `backend/routes/launch.js` |
| the job (claim, run, store, reply) | `backend/services/launch/launchRunner.js` |
| the document (state, versions, chat, lease) | `backend/models/LaunchVideo.js` |

The worker imports `launch/api.mjs` on first use. If `npm install` has not been run here, the
worker logs that generated demos are OFF and the API answers 503, and nothing else is affected.

Settings (all optional): `LAUNCH_DAILY_VIDEOS` (2), `LAUNCH_DAILY_CHANGES` (10),
`LAUNCH_RENDER_CONCURRENCY` (frames in flight, default ¾ of the CPUs up to 8),
`LAUNCH_CONCURRENCY` (videos at once per worker, 1), `LAUNCH_ENABLED=0` to switch it off,
`TINYFISH_API_KEY` (otherwise the first active row of `TinyfishAPIs`). Gemini uses the
backend's `AISTUDIO_KEY`.

## Setting up a server (once)

```bash
cd launch
npm ci                                   # Remotion, Playwright core, React
npx remotion browser ensure              # downloads Remotion's headless Chrome for this OS
npx remotion still src/index.jsx Launch out/smoke.png   # proves Chrome starts; prints any missing .so
```

If the still fails with a missing shared library (`libnspr4.so: cannot open shared object file`
on a fresh VM), install Chrome's libraries:

```bash
sudo apt-get update
sudo apt-get install -y libnss3 libnspr4 libdbus-1-3 libgbm1 libxrandr2 libxkbcommon0 \
  libxfixes3 libxcomposite1 libxdamage1 libpango-1.0-0 libcairo2
# renamed in Debian 13 (t64); the second line is Debian 12's names
sudo apt-get install -y libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libasound2t64 \
  || sudo apt-get install -y libatk1.0-0 libatk-bridge2.0-0 libcups2 libasound2
# nothing printed = nothing missing
ldd node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell | grep "not found"
```

Then restart the worker and the API.

## From a terminal

```
node generate.mjs https://tryclipo.com              # first video  → out/<slug>-v1.mp4
node generate.mjs --refine <slug> "punchier hook"   # a change     → out/<slug>-v2.mp4
node generate.mjs --render <slug>                   # re-render the latest board
node stills.mjs <slug>                              # one frame per scene, to judge the look fast
```

Keys for the terminal go in `launch/.env` (git-ignored): `AISTUDIO_KEY`, `TINYFISH_API_KEY`,
and `LAUNCH_LOCAL_FALLBACK=1` to let a local Chrome take the screenshots when TinyFish's
browser is unavailable (never set on a server: it would open a stranger's address on our machine).

## Pipeline

| step | what | file |
|---|---|---|
| read | TinyFish Fetch → the site's words (markdown) | `pipeline/site.mjs` |
| look | TinyFish browser (CDP) → 2× screenshots, every element's box, logo, colours, font | `pipeline/capture.mjs` |
| direct | Gemini fills the scene slots by id (never coordinates, never pixels) | `pipeline/director.mjs` |
| speak | Gemini TTS, one take per line, cached by words; falls through models on a daily limit | `pipeline/voice.mjs` |
| score | a track from Clipo's public-domain music library, picked for the mood, in parallel with the voice | `pipeline/music.mjs` |
| resolve | ids → boxes and files; each scene as long as its line | `pipeline/board.mjs` |
| render | Remotion, the hand-built scene library (`src/`), plus a poster frame | `pipeline/render.mjs` |

`api.mjs` is the whole thing as calls (`createVideo`, `refineVideo`, `renderLatest`). The storyboard
(`board-vN.json`) is the whole video: a refinement edits the previous draft and re-renders, reusing the
screenshots, the facts, unchanged voice takes and the music.

## How a screenshot is taken (`pipeline/capture.mjs`)

- Stops are planned by section heading: hero, then pricing, features, how it works, product, reviews; a
  pricing or features page the nav only links to is visited too.
- Each stop is scrolled to in steps, then **waited on until settled**: images in view decoded, fonts
  loaded, no skeleton/spinner, no fade-in running, no requests in flight, nothing moving between two
  looks 350 ms apart, and enough of the screen showing content. Max ~6 s, then a scroll-away-and-back
  retry; a shot that never shows content is dropped, one that never fully settles is marked so the
  director avoids it. "Reduce motion" is requested and chat widgets are hidden.
- Logo candidates: the navbar logo first, then app icons, manifest, structured-data logo, favicon;
  each trimmed to PNG. Gemini picks the brand's own by looking at them.

## How a chat message is handled (`api.mjs refineVideo`)

1. **Understand** (`planChange`): what the creator means. "X is blank / missing / wrong" means fix X,
   never remove it. Decides: retake a screenshot, photograph a section (or another page), switch the
   logo (or use a logo link they pasted), and what to change in the storyboard; writes the reply.
2. **Look again** (`captureMore`) when needed: new shots get new ids, the ones they replace stay for old versions.
3. **Rewrite** the storyboard with all of that, then voice/music/render as usual.
The reply in the chat is the editor's own sentence, then "Version N is ready".

## Notes

- Remotion is free for companies of up to 3 people; above that, automated rendering needs a company licence.
- `.browser/` (git-ignored) holds a hand-downloaded chrome-headless-shell for Windows, because Remotion's own
  download kept failing on one network. Servers use `npx remotion browser ensure` instead.
