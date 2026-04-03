# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start

```bash
npm install
node server.js        # or: npm start
# Open http://localhost:3000
```

No build step, no database, no auth. The app runs fully locally.

## Architecture

**Local image generation model comparison tool.** Users enter an API key, pick models, enter a prompt, and see results side-by-side.

Key files:

- `server.js` — Express server. Loads all providers, exposes two endpoints:
  - `GET /api/models` — returns the merged model catalog across all providers
  - `POST /api/run` — takes `{ apiKey, kieApiKey, modelIds, prompt, aspectRatio, runsPerModel, resolution, images }`, dispatches each model to its provider's `run()`, streams results back as **SSE**. Each event is `type: "result"`, `type: "error"`, or `type: "done"`.
- `providers/replicate.js` — Replicate SDK integration. Exports `{ models, run }`.
- `providers/kie.js` — kie.ai REST API integration. Exports `{ models, run }`.
- `public/index.html` — single-file frontend (HTML + CSS + JS, no framework). Provider dropdown filters which models are shown. Connects to `/api/run` via fetch + SSE, renders result cards as they arrive.
- `package.json` — dependencies: `express`, `replicate`.

**Key patterns:**
- `server.js` is provider-agnostic. It registers providers in `PROVIDERS`, merges their model lists, and dispatches `run()` calls by `model.platform`.
- Each provider module owns its model list and all API logic. No provider-specific code lives in `server.js`.
- Every model entry has `id`, `label`, `provider`, `platform`, `priceEst`. `platform` must match the key in `PROVIDERS`.
- Models run with 1 retry on failure and a 3-minute timeout.
- The frontend is dark-mode, vanilla JS — no transpilation or bundling needed.

## Adding a New Model

Add an entry to the `models` array in the relevant provider file (`providers/replicate.js` or `providers/kie.js`). The frontend fetches the list dynamically — no frontend changes needed.

## Adding a New Provider

1. **Look up model prices** before writing the file. Fetch the provider's pricing page and each model's individual page to get the per-image cost. Set `priceEst` to the dollar value (e.g. `"$0.04"`). Only use `"N/A"` if the price genuinely cannot be found after checking the docs. Prices are hidden in the UI when `"N/A"`, so accurate values matter for the cost tracker.

2. **Create `providers/<name>.js`** — must export:

```js
const models = [
  // Each entry needs at minimum:
  // { id, label, provider, priceEst }
  // platform is added automatically by the .map() at the bottom
].map(m => ({ ...m, platform: "<name>" }));

async function run(model, { prompt, aspectRatio, resolution, images }, apiKey, timeoutMs) {
  // Call the provider's API, return a single image URL string.
  // Throw an Error on failure — server.js handles retries and SSE error events.
}

module.exports = { models, run };
```

3. **Register it in `server.js`**:

```js
const myProvider = require("./providers/<name>");
const PROVIDERS = { replicate, kie, myProvider };  // add here
```

4. **Wire the API key in `server.js`**:

```js
const keyByPlatform = { replicate: apiKey, kie: kieApiKey, "<name>": req.body.<name>ApiKey };
```

5. **Add the API key input in `public/index.html`**:
   - Add an `<option value="<name>">` to the `#provider` select
   - Add the key label/placeholder to the `KEY_META` object in the JS
   - Pass `<name>ApiKey` in the fetch body inside `runBtn` click handler
