const express = require("express");
const path = require("path");

const replicate = require("./providers/replicate");
const kie = require("./providers/kie");

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ─── Provider registry ────────────────────────────────────────────────────────
// To add a new provider: create providers/<name>.js exporting { models, run }
// and add it here. Nothing else needs to change.
const PROVIDERS = { replicate, kie };

const MODELS = Object.values(PROVIDERS).flatMap(p => p.models);
const DEFAULT_SELECTED = Object.fromEntries(
  Object.entries(PROVIDERS).map(([key, p]) => [key, p.defaultSelected || []])
);

app.get("/api/models", (req, res) => {
  res.json({ models: MODELS, defaultSelected: DEFAULT_SELECTED });
});

// ─── Run endpoint ─────────────────────────────────────────────────────────────
app.post("/api/run", (req, res) => {
  const { apiKey, kieApiKey, modelIds, prompt, aspectRatio, runsPerModel, resolution, images } = req.body;

  if (!modelIds?.length || !prompt) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Validate that the right API keys are present for the selected models
  const keyByPlatform = { replicate: apiKey, kie: kieApiKey };
  for (const id of modelIds) {
    const model = MODELS.find(m => m.id === id);
    if (model && !keyByPlatform[model.platform]) {
      return res.status(400).json({ error: `API key required for platform: ${model.platform}` });
    }
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(":ok\n\n");

  const runs = Math.min(Math.max(parseInt(runsPerModel) || 1, 1), 5);
  const MAX_RETRIES = 1;
  const TIMEOUT_MS = 180000; // 3 minutes

  function sendEvent(data) {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch (_) {}
  }

  async function runModel(modelId, runIndex) {
    const model = MODELS.find(m => m.id === modelId);
    const provider = PROVIDERS[model?.platform];
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const startTime = Date.now();
      try {
        if (!provider) throw new Error(`Unknown platform: ${model?.platform}`);

        const apiKeyForModel = keyByPlatform[model.platform];
        const imageUrl = await provider.run(
          model,
          { prompt, aspectRatio, resolution, images },
          apiKeyForModel,
          TIMEOUT_MS,
        );

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const hasImages = Array.isArray(images) && images.length > 0;
        sendEvent({
          type: "result",
          modelId,
          runIndex,
          label: model.label,
          priceEst: model.priceEst,
          elapsed,
          imageUrl,
          inputMode: hasImages && model.supportsImages ? "img+text" : "text",
        });
        return;

      } catch (err) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        lastError = err;
        console.error(`[${model?.label}] run ${runIndex} attempt ${attempt} failed (${elapsed}s): ${err.message}`);
        if (attempt < MAX_RETRIES) continue;

        sendEvent({
          type: "error",
          modelId,
          runIndex,
          label: model?.label || modelId,
          priceEst: model?.priceEst || "N/A",
          elapsed,
          error: lastError.message || "Unknown error",
          inputMode: "text",
        });
      }
    }
  }

  const tasks = [];
  for (const modelId of modelIds) {
    for (let runIndex = 0; runIndex < runs; runIndex++) {
      tasks.push(runModel(modelId, runIndex));
    }
  }

  Promise.all(tasks).then(() => {
    sendEvent({ type: "done" });
    res.end();
  });
});

const net = require("net");

function findAvailablePort(startPort) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(startPort, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", () => resolve(findAvailablePort(startPort + 1)));
  });
}

const PREFERRED_PORT = parseInt(process.env.PORT) || 3000;
findAvailablePort(PREFERRED_PORT).then((port) => {
  app.listen(port, () => {
    if (port !== PREFERRED_PORT) {
      console.log(`Port ${PREFERRED_PORT} in use — started on http://localhost:${port}`);
    } else {
      console.log(`Server running at http://localhost:${port}`);
    }
  });
});
