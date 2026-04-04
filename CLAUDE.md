# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start

```bash
npm install
node server.js        # or: npm start
# Open http://localhost:3000
```

Custom port: `PORT=8080 node server.js`

No build step, no database, no auth. The app runs fully locally.

## Architecture

**Local image generation model comparison tool.** Users enter a Replicate API key (never persisted), pick models, enter a prompt, and see results side-by-side.

Three files make up the entire app:

- `server.js` — Express server with two endpoints:
  - `GET /api/models` — returns the `MODELS` array (model catalog)
  - `POST /api/run` — takes `{ apiKey, xaiApiKey, modelIds, prompt, aspectRatio, runsPerModel, resolution, images }`, fires all selected models in parallel and streams results back as **SSE (Server-Sent Events)**. Each event is `type: "result"`, `type: "error"`, or `type: "done"`. Most models run via the Replicate SDK; xAI models (`apiProvider: "xai"`) call the xAI REST API directly via `runXaiModel()`.
- `public/index.html` — single-file frontend (HTML + CSS + JS, no framework). Connects to `/api/run` via `EventSource`-style fetch, renders result cards as they arrive. Includes lightbox for full-size image viewing.
- `package.json` — only two dependencies: `express` and `replicate`.

**Key patterns:**
- The `MODELS` array in `server.js` is the source of truth for available models. Each entry has `id`, `label`, `provider`, `priceEst`, and optional flags: `supportsImages`, `imageParam` (API parameter name for image input), `singleImage` (single URI vs array), `requiresSeparateKey`, `apiProvider` (e.g. `"xai"` for direct API models).
- `ASPECT_RATIO_MAP` in `server.js` translates standard aspect ratios to model-specific values where needed.
- `extractImageUrl()` handles the many different output formats Replicate models return (string URLs, FileOutput objects, arrays, iterables).
- `runXaiModel()` handles direct xAI API calls (generations and image editing endpoints).
- Models run with 1 retry on failure and a 3-minute timeout.
- The frontend is dark-mode, vanilla JS — no transpilation or bundling needed.

## Adding a New Model

Add an entry to the `MODELS` array in `server.js`:

```js
{
  id: "owner/model-name",        // Replicate model ID (or "xai/model-name" for xAI)
  label: "Display Name",         // Shown in UI
  provider: "Provider Name",     // Grouping label
  priceEst: "$0.03",             // Approximate cost per generation
  supportsImages: true,          // Optional: accepts image inputs
  imageParam: "input_images",    // Optional: API param name for images
  singleImage: true,             // Optional: single URI instead of array
  requiresSeparateKey: true,     // Optional: needs its own API key
  apiProvider: "xai",            // Optional: "xai" for direct API (not Replicate)
}
```

The frontend fetches this list dynamically. If the model needs aspect ratio translation, add a mapping to `ASPECT_RATIO_MAP`.
