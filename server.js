const express = require("express");
const Replicate = require("replicate");
const path = require("path");

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

const MODELS = [
  // Google
  { id: "google/nano-banana-pro", label: "Nano Banana Pro", provider: "Google", priceEst: "$0.04", supportsImages: true, imageParam: "image_input" },
  { id: "google/imagen-4", label: "Imagen 4", provider: "Google", priceEst: "$0.03" },
  { id: "google/imagen-4-fast", label: "Imagen 4 Fast", provider: "Google", priceEst: "$0.02" },
  // ByteDance
  { id: "bytedance/seedream-4.5", label: "Seedream 4.5", provider: "ByteDance", priceEst: "$0.03", supportsImages: true, imageParam: "image_input" },
  { id: "bytedance/seedream-5-lite", label: "Seedream 5.0 Lite", provider: "ByteDance", priceEst: "$0.03", supportsImages: true, imageParam: "image_input" },
  // Black Forest Labs
  { id: "black-forest-labs/flux-2-max", label: "Flux-2-Max", provider: "Black Forest Labs", priceEst: "$0.05", supportsImages: true, imageParam: "input_images" },
  { id: "black-forest-labs/flux-2-pro", label: "Flux-2-Pro", provider: "Black Forest Labs", priceEst: "$0.03", supportsImages: true, imageParam: "input_images" },
  { id: "black-forest-labs/flux-kontext-pro", label: "Flux Kontext Pro", provider: "Black Forest Labs", priceEst: "$0.04", supportsImages: true, imageParam: "input_image", singleImage: true },
  // Ideogram (only supports inpainting with mask, not general image input)
  { id: "ideogram-ai/ideogram-v3-quality", label: "Ideogram v3 Quality", provider: "Ideogram", priceEst: "$0.06" },
  { id: "ideogram-ai/ideogram-v3-turbo", label: "Ideogram v3 Turbo", provider: "Ideogram", priceEst: "$0.03" },
  // OpenAI (separate key)
  { id: "openai/gpt-image-1.5", label: "GPT Image 1.5", provider: "OpenAI", priceEst: "$0.04–0.12", requiresSeparateKey: true, supportsImages: true, imageParam: "input_images" },
  // Recraft
  { id: "recraft-ai/recraft-v4", label: "Recraft V4", provider: "Recraft", priceEst: "$0.04" },
  // Alibaba
  { id: "alibaba/wan-2.1-t2i", label: "Wan 2.1 T2I", provider: "Alibaba", priceEst: "$0.03" },
  // xAI (separate key — direct API, not Replicate)
  { id: "xai/grok-imagine-image", label: "Grok Imagine", provider: "xAI", priceEst: "$0.02", requiresSeparateKey: true, apiProvider: "xai", supportsImages: true },
  { id: "xai/grok-imagine-image-pro", label: "Grok Imagine Pro", provider: "xAI", priceEst: "$0.07", requiresSeparateKey: true, apiProvider: "xai", supportsImages: true },
];

// Map user-selected aspect ratio to what each model actually supports.
// Models not listed here accept the standard ratios fine.
const ASPECT_RATIO_MAP = {
  "openai/gpt-image-1.5": {
    "9:16": "2:3",
    "16:9": "3:2",
    "1:1": "1:1",
    "3:4": "2:3",
  },
};

// Call the xAI image generation API directly
async function runXaiModel(modelId, prompt, aspectRatio, resolution, xaiApiKey, images) {
  const xaiModel = modelId.replace("xai/", ""); // e.g. "grok-imagine-image"

  const body = {
    model: xaiModel,
    prompt,
    n: 1,
  };

  if (aspectRatio) {
    body.aspect_ratio = aspectRatio;
  }
  if (resolution === "high") {
    body.resolution = "2k";
  }

  // Image editing uses a different endpoint
  const hasImages = Array.isArray(images) && images.length > 0;
  const endpoint = hasImages
    ? "https://api.x.ai/v1/images/edits"
    : "https://api.x.ai/v1/images/generations";

  if (hasImages) {
    // xAI editing endpoint expects { image: { url: "data:..." } }
    body.image = { url: images[0] };
  }

  console.log(`[xAI] Calling ${endpoint} with model=${xaiModel}, aspect_ratio=${body.aspect_ratio || 'default'}`);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${xaiApiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[xAI] Error response: ${res.status} ${errBody}`);
    throw new Error(`xAI API error ${res.status}: ${errBody}`);
  }

  const json = await res.json();
  console.log(`[xAI] Success, got ${json.data?.length || 0} image(s)`);
  // OpenAI-compatible response: { data: [{ url: "..." }] }
  const imageUrl = json.data?.[0]?.url || json.data?.[0]?.b64_json;
  if (!imageUrl) {
    throw new Error("No image URL in xAI response");
  }
  return imageUrl;
}

app.get("/api/models", (req, res) => {
  res.json(MODELS);
});

// Extract a usable image URL from various Replicate output formats
function extractImageUrl(output) {
  // String URL
  if (typeof output === "string") {
    if (output.startsWith("http")) return output;
    // Could be a data URI
    if (output.startsWith("data:image")) return output;
  }

  // FileOutput object (has .url() or is URL-like when cast to string)
  if (output && typeof output === "object" && !Array.isArray(output)) {
    if (typeof output.url === "function") return output.url();
    if (typeof output.url === "string") return output.url;
    if (typeof output.href === "string") return output.href;
    // Some FileOutput objects stringify to a URL
    const str = String(output);
    if (str.startsWith("http")) return str;
  }

  // Array of outputs — take the first image
  if (Array.isArray(output)) {
    for (const item of output) {
      const url = extractImageUrl(item);
      if (url) return url;
    }
  }

  // Iterator/generator result (some models return async iterables that have already been collected)
  if (output && typeof output[Symbol.iterator] === "function" && !Array.isArray(output)) {
    for (const item of output) {
      const url = extractImageUrl(item);
      if (url) return url;
    }
  }

  return null;
}

app.post("/api/run", (req, res) => {
  const { apiKey, xaiApiKey, modelIds, prompt, aspectRatio, runsPerModel, resolution, images } = req.body;

  if ((!apiKey && !xaiApiKey) || !modelIds?.length || !prompt) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Send a keepalive comment immediately so the connection is established
  res.write(":ok\n\n");

  const replicate = apiKey ? new Replicate({ auth: apiKey }) : null;
  const runs = Math.min(Math.max(parseInt(runsPerModel) || 1, 1), 5);
  const hasImages = Array.isArray(images) && images.length > 0;
  const MAX_RETRIES = 1;
  const TIMEOUT_MS = 180000; // 3 minutes per model

  function sendEvent(data) {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      console.error("Failed to write SSE event:", e.message);
    }
  }

  async function runModel(modelId, runIndex) {
    const model = MODELS.find((m) => m.id === modelId);
    const modelSupportsImages = hasImages && model?.supportsImages;
    const isXai = model?.apiProvider === "xai";
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const startTime = Date.now();
      try {
        let imageUrl;

        if (isXai) {
          // Direct xAI API call
          if (!xaiApiKey) throw new Error("xAI API key required for Grok models");
          const modelAspect = aspectRatio || "9:16";
          imageUrl = await Promise.race([
            runXaiModel(modelId, prompt, modelAspect, resolution, xaiApiKey, modelSupportsImages ? images : null),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Timed out after 3 minutes")), TIMEOUT_MS)
            ),
          ]);
        } else {
          // Replicate API call
          const modelAspect = ASPECT_RATIO_MAP[modelId]?.[aspectRatio] || aspectRatio || "9:16";

          const input = {
            prompt,
            aspect_ratio: modelAspect,
          };

          if (resolution === "high") {
            input.output_quality = 100;
          }
          if (modelSupportsImages) {
            const paramName = model.imageParam || "input_images";
            if (model.singleImage) {
              input[paramName] = images[0];
            } else {
              input[paramName] = images;
            }
          }

          const output = await Promise.race([
            replicate.run(modelId, { input }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Timed out after 3 minutes")), TIMEOUT_MS)
            ),
          ]);

          console.log(`[${model?.label}] run ${runIndex} attempt ${attempt} output type: ${typeof output}, isArray: ${Array.isArray(output)}, value: ${String(output).slice(0, 200)}`);

          imageUrl = extractImageUrl(output);
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        if (!imageUrl) {
          throw new Error("No image content found in response");
        }

        sendEvent({
          type: "result",
          modelId,
          runIndex,
          label: model?.label || modelId,
          priceEst: model?.priceEst || "N/A",
          elapsed,
          imageUrl,
          inputMode: modelSupportsImages ? "img+text" : "text",
        });
        return; // success, no retry needed

      } catch (err) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        lastError = err;
        console.error(`[${model?.label}] run ${runIndex} attempt ${attempt} failed (${elapsed}s): ${err.message}`);

        if (attempt < MAX_RETRIES) {
          console.log(`[${model?.label}] retrying...`);
          continue;
        }

        // Final failure — send error event
        sendEvent({
          type: "error",
          modelId,
          runIndex,
          label: model?.label || modelId,
          priceEst: model?.priceEst || "N/A",
          elapsed,
          error: lastError.message || "Unknown error",
          inputMode: modelSupportsImages ? "img+text" : "text",
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
