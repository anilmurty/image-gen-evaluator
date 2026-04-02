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

**Local image generation model comparison tool.** Users enter a Replicate API key (never persisted), pick models, enter a prompt, and see results side-by-side.

Three files make up the entire app:

- `server.js` — Express server with two endpoints:
  - `GET /api/models` — returns the `MODELS` array (model catalog)
  - `POST /api/run` — takes `{ apiKey, modelIds, prompt, aspectRatio, runsPerModel, resolution, images }`, fires all selected models in parallel via the Replicate SDK, and streams results back as **SSE (Server-Sent Events)**. Each event is `type: "result"`, `type: "error"`, or `type: "done"`.
- `public/index.html` — single-file frontend (HTML + CSS + JS, no framework). Connects to `/api/run` via `EventSource`-style fetch, renders result cards as they arrive. Includes lightbox for full-size image viewing.
- `package.json` — only two dependencies: `express` and `replicate`.

**Key patterns:**
- The `MODELS` array in `server.js` is the source of truth for available models. Each entry has `id`, `label`, `provider`, `priceEst`, and optional flags (`supportsImages`, `requiresSeparateKey`).
- `ASPECT_RATIO_MAP` in `server.js` translates standard aspect ratios to model-specific values where needed.
- `extractImageUrl()` handles the many different output formats Replicate models return (string URLs, FileOutput objects, arrays, iterables).
- Models run with 1 retry on failure and a 3-minute timeout.
- The frontend is dark-mode, vanilla JS — no transpilation or bundling needed.

## Adding a New Model

Add an entry to the `MODELS` array in `server.js`. The frontend fetches this list dynamically. If the model needs aspect ratio translation, add a mapping to `ASPECT_RATIO_MAP`.
