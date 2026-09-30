# Browser analysis

Runs the first analysis of a recording (pointer tracking, clicks, zooms) in the creator's browser, with results identical to the server's. Server code: `backend/services/studio/browserAnalysis.js`. Page code: `src/components/Studio/browserAnalysis.js`.

## What the server still answers

Anything that needs Gemini is asked of the server, which answers from its own copy of the recording exactly as its own analysis would, and logs every answer for the re-check:
- the two-pointer check and the stranger check
- the press judge (when `STUDIO_PRESS_JUDGE` is on)
- with `STUDIO_VISION_ON_ANALYSE=on`, the vision pass:
  - every sampled still read (`readFrames`); the server cuts the stills itself and checks they are the ones the browser counted
  - what the pointer rested on (`pointerTargets`)
  - the steps (`detectSteps`) and the narration (`writeNarration`)

Reading every still takes minutes, and nginx closes an `/api/` request after 60 s. So a question is started once and answered within about 20 s, or it comes back "pending" and the page asks again (`POST /analysis/ask` with `{ session, id }`). Its progress reaches the editor's progress bar.

A run's questions share one download of the recording and one set of stills, in a temp folder on the API server, deleted when the run ends. Large questions and answers are stored beside the recording (`analysis/ask-<session>-<n>.json`), not in the demo's document.

Blur finding inside the first analysis (`STUDIO_VISION_ON_ANALYSE` and `STUDIO_BLUR` both on) is not one of these questions. With both on, browser analysis stays off and everything runs on the server.

## Build (after ANY change to the analysis code)

```
cd browser-analysis
npm install
node build.mjs
```

The build writes `public/studio/analysis/`:
- `worker-<version>.js` (and its source map)
- `tpl/*.bin`: every cursor template, drawn by the server's canvas
- `manifest.json`

`react-scripts build` copies these into `build/` like any public file.

If the analysis code changes and this isn't rerun, the server notices at boot that the bundle isn't its code and keeps every analysis on the server. That's safe, but the browser path stays off until you rebuild and redeploy.

## Deploy

Deploy together:
- the backend
- this folder (the server hashes these files to check the bundle)
- the frontend build (which now contains `studio/analysis/`)

## Switches (backend `.env`)

| Variable | Default | What it does |
|---|---|---|
| `STUDIO_BROWSER_ANALYSIS` | `off` | `off`: nothing changes. `shadow`: both run, the server's result is used, and the two are compared (logged, and saved as `analysis.browser.compare`). `on`: the browser's result is used, with the server as fallback |
| `STUDIO_BROWSER_RECHECK` | `0.2` | Share of accepted browser results the server re-runs and compares (`analysis.browser.recheck`) |
| `STUDIO_BROWSER_HOLD_S` | `45` | How long the server waits after the last heartbeat before taking over |
| `STUDIO_BROWSER_FIRST_HOLD_S` | `120` | The first wait, while the browser downloads the recording |
| `STUDIO_BROWSER_MAX_SECONDS` | `600` | Longer recordings always stay on the server |
| `STUDIO_BROWSER_MAX_RUN_S` | `420` (`900` with the vision pass on) | The longest a browser run may hold the server's job |
| `STUDIO_BROWSER_EXTRACT_CONCURRENCY` | `2` | How many runs' stills the API server cuts at once |

Log lines to watch: `browser analysis … accepted`, `… the server took over`, `… re-check … IDENTICAL / DIFFERS`, `… shadow … IDENTICAL / DIFFERS`.

## Tests

In `backend/scripts/browserParity/`:

| Script | What it checks |
|---|---|
| `workerParity.mjs` | The built worker vs today's server on the labelled recordings. `--asks` turns the model on; `--vision` adds the vision pass (needs `VERTEX_PROJECT` or `AISTUDIO_KEY`). `--reuse` answers from the saved answers instead of asking again |
| `node --import ./hooks/fakeModel.mjs workerParity.mjs --vision --fake` | The vision pass with a deterministic stand-in for Gemini (no key, no cost). Checks both the replayed re-check and the server's own analysis against the browser's |
| `e2e.mjs` | Real server, worker, database and browser: the on, fallback and shadow flows. `--vision --fake` (or `--vision` with `E2E_AISTUDIO_KEY`) runs them with the vision pass on |

Note: the parity scripts' Chrome tab occasionally closes mid-run ("Target closed"). That is the test browser crashing, not a mismatch; rerun that recording by name.
