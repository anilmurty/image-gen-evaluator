const Replicate = require("replicate");

const models = [
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
  // Ideogram
  { id: "ideogram-ai/ideogram-v3-quality", label: "Ideogram v3 Quality", provider: "Ideogram", priceEst: "$0.06" },
  { id: "ideogram-ai/ideogram-v3-turbo", label: "Ideogram v3 Turbo", provider: "Ideogram", priceEst: "$0.03" },
  // OpenAI
  { id: "openai/gpt-image-1.5", label: "GPT Image 1.5", provider: "OpenAI", priceEst: "$0.04–0.12", requiresSeparateKey: true, supportsImages: true, imageParam: "input_images" },
  // Recraft
  { id: "recraft-ai/recraft-v4", label: "Recraft V4", provider: "Recraft", priceEst: "$0.04" },
  // Alibaba
  { id: "alibaba/wan-2.1-t2i", label: "Wan 2.1 T2I", provider: "Alibaba", priceEst: "$0.03" },
].map(m => ({ ...m, platform: "replicate" }));

// Aspect ratio overrides for models that don't accept standard values
const ASPECT_RATIO_MAP = {
  "openai/gpt-image-1.5": { "9:16": "2:3", "16:9": "3:2", "1:1": "1:1", "3:4": "2:3" },
};

// Extract a usable image URL from various Replicate output formats
function extractImageUrl(output) {
  if (typeof output === "string") {
    if (output.startsWith("http") || output.startsWith("data:image")) return output;
  }
  if (output && typeof output === "object" && !Array.isArray(output)) {
    if (typeof output.url === "function") return output.url();
    if (typeof output.url === "string") return output.url;
    if (typeof output.href === "string") return output.href;
    const str = String(output);
    if (str.startsWith("http")) return str;
  }
  if (Array.isArray(output)) {
    for (const item of output) {
      const url = extractImageUrl(item);
      if (url) return url;
    }
  }
  if (output && typeof output[Symbol.iterator] === "function" && !Array.isArray(output)) {
    for (const item of output) {
      const url = extractImageUrl(item);
      if (url) return url;
    }
  }
  return null;
}

async function run(model, { prompt, aspectRatio, resolution, images }, apiKey, timeoutMs) {
  const replicate = new Replicate({ auth: apiKey });
  const modelAspect = ASPECT_RATIO_MAP[model.id]?.[aspectRatio] || aspectRatio || "9:16";
  const hasImages = Array.isArray(images) && images.length > 0;

  const input = { prompt, aspect_ratio: modelAspect };
  if (resolution === "high") input.output_quality = 100;
  if (hasImages && model.supportsImages) {
    const paramName = model.imageParam || "input_images";
    input[paramName] = model.singleImage ? images[0] : images;
  }

  const output = await Promise.race([
    replicate.run(model.id, { input }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timed out after 3 minutes")), timeoutMs)
    ),
  ]);

  console.log(`[replicate/${model.label}] output type: ${typeof output}, isArray: ${Array.isArray(output)}, value: ${String(output).slice(0, 200)}`);

  const imageUrl = extractImageUrl(output);
  if (!imageUrl) throw new Error("No image content found in response");
  return imageUrl;
}

const defaultSelected = [
  "google/nano-banana-pro",
  "bytedance/seedream-4.5",
  "bytedance/seedream-5-lite",
  "black-forest-labs/flux-2-max",
  "black-forest-labs/flux-2-pro",
];

module.exports = { models, run, defaultSelected };
