# Browser analysis

Runs the first analysis of a recording (pointer tracking, clicks, zooms) in the creator's browser, with results identical to the server's. Server code: `backend/services/studio/browserAnalysis.js`. Page code: `src/components/Studio/browserAnalysis.js`.

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

Log lines to watch: `browser analysis … accepted`, `… the server took over`, `… re-check … IDENTICAL / DIFFERS`, `… shadow … IDENTICAL / DIFFERS`.

## Tests

In `backend/scripts/browserParity/`:

| Script | What it checks |
|---|---|
| `workerParity.mjs` | The built worker vs today's server on the labelled recordings (`--asks` turns the model on; needs `VERTEX_PROJECT`) |
| `e2e.mjs` | Real server, worker, database and browser: the on, fallback and shadow flows |
