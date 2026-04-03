const BASE_URL = "https://api.kie.ai";

// Some models use "image_size" instead of "aspect_ratio"
const IMAGE_SIZE_MAP = {
  "1:1":  "square_hd",
  "16:9": "landscape_16_9",
  "9:16": "portrait_16_9",
  "4:3":  "landscape_4_3",
  "3:4":  "portrait_4_3",
};

const models = [
  // Black Forest Labs
  { id: "kie/flux-2-pro",       label: "Flux-2 Pro",       provider: "Black Forest Labs", priceEst: "$0.025", kieModel: "flux-2/pro-text-to-image",                kieEndpoint: "createTask" },
  { id: "kie/flux-2-flex",      label: "Flux-2 Flex",      provider: "Black Forest Labs", priceEst: "$0.07",  kieModel: "flux-2/flex-text-to-image",               kieEndpoint: "createTask" },
  { id: "kie/flux-kontext-pro", label: "Flux Kontext Pro", provider: "Black Forest Labs", priceEst: "$0.025", kieModel: "flux-kontext-pro",                        kieEndpoint: "kontext" },
  { id: "kie/flux-kontext-max", label: "Flux Kontext Max", provider: "Black Forest Labs", priceEst: "$0.05",  kieModel: "flux-kontext-max",                        kieEndpoint: "kontext" },
  // Google
  { id: "kie/imagen4",          label: "Imagen 4",         provider: "Google",            priceEst: "$0.04",  kieModel: "google/imagen4",                          kieEndpoint: "createTask" },
  { id: "kie/imagen4-ultra",    label: "Imagen 4 Ultra",   provider: "Google",            priceEst: "$0.06",  kieModel: "google/imagen4-ultra",                    kieEndpoint: "createTask" },
  { id: "kie/imagen4-fast",     label: "Imagen 4 Fast",    provider: "Google",            priceEst: "$0.02",  kieModel: "google/imagen4-fast",                     kieEndpoint: "createTask" },
  { id: "kie/nano-banana",      label: "Nano Banana",      provider: "Google",            priceEst: "$0.04",  kieModel: "google/nano-banana",                      kieEndpoint: "createTask" },
  { id: "kie/nano-banana-2",    label: "Nano Banana 2",    provider: "Google",            priceEst: "$0.04",  kieModel: "google/nano-banana-2",                    kieEndpoint: "createTask" },
  { id: "kie/nano-banana-pro",  label: "Nano Banana Pro",  provider: "Google",            priceEst: "$0.09",  kieModel: "nano-banana-pro",                         kieEndpoint: "createTask" },
  // Grok
  { id: "kie/grok-t2i",         label: "Grok Imagine",     provider: "Grok",              priceEst: "$0.02",  kieModel: "grok-imagine/text-to-image",              kieEndpoint: "createTask" },
  // ByteDance
  { id: "kie/seedream-3",       label: "Seedream 3.0",     provider: "ByteDance",         priceEst: "N/A",    kieModel: "bytedance/seedream",                      kieEndpoint: "createTask", kieAspectParam: "image_size" },
  { id: "kie/seedream-4",       label: "Seedream 4.0",     provider: "ByteDance",         priceEst: "$0.0175",kieModel: "bytedance/seedream-v4-text-to-image",     kieEndpoint: "createTask", kieAspectParam: "image_size" },
  { id: "kie/seedream-4.5",     label: "Seedream 4.5",     provider: "ByteDance",         priceEst: "$0.03",  kieModel: "bytedance/seedream-v4.5-text-to-image",   kieEndpoint: "createTask", kieAspectParam: "image_size" },
  { id: "kie/seedream-5-lite",  label: "Seedream 5 Lite",  provider: "ByteDance",         priceEst: "N/A",    kieModel: "bytedance/seedream-v5-lite-text-to-image", kieEndpoint: "createTask", kieAspectParam: "image_size" },
  // Ideogram
  { id: "kie/ideogram-v3",      label: "Ideogram v3",      provider: "Ideogram",          priceEst: "$0.035", kieModel: "ideogram/v3-text-to-image",               kieEndpoint: "createTask", kieAspectParam: "image_size" },
  // Alibaba / Qwen
  { id: "kie/qwen-t2i",         label: "Qwen T2I",         provider: "Alibaba",           priceEst: "$0.02",  kieModel: "qwen/text-to-image",                      kieEndpoint: "createTask", kieAspectParam: "image_size" },
  // OpenAI
  { id: "kie/gpt-image-1.5",    label: "GPT Image 1.5",    provider: "OpenAI",            priceEst: "$0.02",  kieModel: "gpt-image/1.5-text-to-image",             kieEndpoint: "createTask", kieExtraInput: { quality: "medium" } },
  // Wan
  { id: "kie/wan-2.7",          label: "Wan 2.7",          provider: "Wan",               priceEst: "N/A",    kieModel: "wan/2-7-image",                           kieEndpoint: "createTask" },
  { id: "kie/wan-2.7-pro",      label: "Wan 2.7 Pro",      provider: "Wan",               priceEst: "N/A",    kieModel: "wan/2-7-image-pro",                       kieEndpoint: "createTask" },
  // Z-Image
  { id: "kie/z-image",          label: "Z-Image",          provider: "Z-Image",           priceEst: "$0.004", kieModel: "z-image",                                 kieEndpoint: "createTask" },
].map(m => ({ ...m, platform: "kie" }));

async function post(path, body, apiKey) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `kie.ai error ${res.status}`;
    try { const e = await res.json(); msg = e.msg || e.message || msg; } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

async function poll(taskId, apiKey, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`${BASE_URL}/api/v1/jobs/recordInfo?taskId=${taskId}`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    if (!res.ok) continue;
    const { data } = await res.json();
    if (!data) continue;
    if (data.state === "fail") throw new Error(data.failMsg || "kie.ai generation failed");
    if (data.state === "success") {
      const parsed = JSON.parse(data.resultJson || "{}");
      const url = parsed.resultUrls?.[0] || parsed.url;
      if (!url) throw new Error("kie.ai: no result URL in response");
      return url;
    }
  }
  throw new Error("Timed out waiting for kie.ai job");
}

async function run(model, { prompt, aspectRatio }, apiKey, timeoutMs) {
  let taskId;

  if (model.kieEndpoint === "kontext") {
    const res = await post("/api/v1/flux/kontext/generate", {
      model: model.kieModel, prompt, aspectRatio: aspectRatio || "9:16",
    }, apiKey);
    taskId = res.data?.taskId;

  } else {
    const aspectParam = model.kieAspectParam || "aspect_ratio";
    const aspectValue = aspectParam === "image_size"
      ? (IMAGE_SIZE_MAP[aspectRatio] || "square_hd")
      : (aspectRatio || "9:16");
    const input = { prompt, [aspectParam]: aspectValue, resolution: "1K", ...model.kieExtraInput };
    const res = await post("/api/v1/jobs/createTask", { model: model.kieModel, input }, apiKey);
    taskId = res.data?.taskId;
  }

  if (!taskId) throw new Error("kie.ai: no taskId returned");
  return poll(taskId, apiKey, timeoutMs);
}

const defaultSelected = [
  "kie/flux-2-pro",
  "kie/imagen4",
  "kie/seedream-4.5",
  "kie/gpt-image-1.5",
];

module.exports = { models, run, defaultSelected };
