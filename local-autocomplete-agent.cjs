const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Logger helper
const log = (tag, ...args) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${tag}]`, ...args);
};

// Dynamically load/reload env variables from .env file
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('#')) continue;
        const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
        if (match) {
          const key = match[1].trim();
          let value = match[2].trim();
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          process.env[key] = value;
        }
      }
    } catch (e) {
      log("INIT_ERR", "Error reading .env:", e.message);
    }
  }
}

loadEnv();

const PORT = process.env.PORT || 5050;

function getOllamaHost() {
  let rawHost = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
  rawHost = rawHost.replace('0.0.0.0', '127.0.0.1');
  if (!rawHost.startsWith('http://') && !rawHost.startsWith('https://')) {
    rawHost = `http://${rawHost}`;
  }
  if (!rawHost.includes(':', 7)) {
    rawHost = `${rawHost}:11434`;
  }
  return rawHost;
}

// Live statistics counter
const stats = {
  totalRequests: 0,
  tier1GeminiSuccesses: 0,
  tier2OpenRouterSuccesses: 0,
  tier3OllamaSuccesses: 0,
  failures: 0,
  activeTier: 'Tier 1 (Gemini API)',
  lastFallbackReason: null
};

// --- Tier 1: Gemini Free Tier API ---
async function callGeminiAPI(messages, promptText) {
  loadEnv();
  const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("No Gemini API key found in environment (GEMINI_API_KEY or VITE_GEMINI_API_KEY)");
  }

  const contents = messages ? messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  })) : [{ role: 'user', parts: [{ text: promptText }] }];

  const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  log("TIER1_GEMINI", "Attempting request via Gemini API (gemini-2.0-flash)...");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const data = await res.json().catch(() => ({}));

    if (res.status === 429 || res.status === 403 || data.error?.code === 429 || data.error?.status === 'RESOURCE_EXHAUSTED') {
      const errMsg = data.error?.message || 'Quota/Token limit exceeded';
      log("TIER1_EXHAUSTED", `Gemini API Token Quota Exhausted: ${errMsg.slice(0, 100)}`);
      throw new Error(`Gemini Token/Quota Exhausted: ${errMsg.slice(0, 100)}`);
    }

    if (!res.ok || data.error) {
      const errMsg = data.error?.message || res.statusText || 'HTTP Error';
      throw new Error(`Gemini HTTP Error ${res.status}: ${errMsg.slice(0, 100)}`);
    }

    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      let text = data.candidates[0].content.parts.map(p => p.text).join('');
      stats.tier1GeminiSuccesses++;
      stats.activeTier = 'Tier 1 (Gemini API: gemini-2.0-flash)';
      log("TIER1_SUCCESS", "Completed successfully via Gemini 2.0 Flash");
      return { text, provider: 'gemini-2.0-flash', tier: 1 };
    } else {
      throw new Error("Invalid response format from Gemini API");
    }
  } catch (err) {
    clearTimeout(timeoutId);
    log("TIER1_FAIL", "Gemini API failed/exhausted:", err.message);
    stats.lastFallbackReason = err.message;
    throw err;
  }
}

// --- Tier 2: OpenRouter Free Models Auto-Switch ---
async function fetchOpenRouterFreeModels() {
  const fallbackList = [
    "openrouter/free",
    "google/gemma-4-31b-it:free",
    "google/gemma-4-26b-a4b-it:free",
    "cohere/north-mini-code:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "inclusionai/ling-3.0-flash:free",
    "poolside/laguna-s-2.1:free"
  ];
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const fetchedFree = data.data
      .filter(m => m.id.includes(':free') || (parseFloat(m.pricing?.prompt || '1') === 0 && parseFloat(m.pricing?.completion || '1') === 0))
      .map(m => m.id);

    const combined = ["openrouter/free", ...fetchedFree, ...fallbackList];
    return Array.from(new Set(combined));
  } catch (e) {
    return fallbackList;
  }
}

async function callOpenRouterAPI(messages, promptText) {
  loadEnv();
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured in .env. Skipping to local Ollama fallback.");
  }

  const freeModels = await fetchOpenRouterFreeModels();
  log("TIER2_OPENROUTER", `Auto-switching across ${freeModels.length} free OpenRouter models...`);

  const payloadMessages = messages ? messages : [{ role: 'user', content: promptText }];

  for (let i = 0; i < Math.min(freeModels.length, 8); i++) {
    const model = freeModels[i];
    log("TIER2_AUTO_SWITCH", `[${i + 1}/${freeModels.length}] Trying OpenRouter Model: ${model}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/google/antigravity",
          "X-Title": "Antigravity Local Autocomplete Agent"
        },
        body: JSON.stringify({
          model: model,
          messages: payloadMessages
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        log("TIER2_RATE_LIMIT", `Model ${model} rate limited (429). Auto-switching to next free model...`);
        continue;
      }

      if (!res.ok || data.error) {
        const errMsg = data.error?.message || res.statusText || 'Unknown error';
        log("TIER2_ERR", `Model ${model} returned HTTP ${res.status}: ${errMsg.slice(0, 100)}. Auto-switching...`);
        continue;
      }

      if (data.choices && data.choices[0] && data.choices[0].message) {
        const text = data.choices[0].message.content;
        const actualModel = data.model || model;
        stats.tier2OpenRouterSuccesses++;
        stats.activeTier = `Tier 2 (OpenRouter Free: ${actualModel})`;
        log("TIER2_SUCCESS", `Completed via OpenRouter Free Model: ${actualModel}`);
        return { text, provider: `openrouter/${actualModel}`, tier: 2 };
      }
    } catch (err) {
      clearTimeout(timeoutId);
      log("TIER2_EXC", `Model ${model} failed (${err.message}). Auto-switching...`);
      continue;
    }
  }

  throw new Error("All free OpenRouter models were rate-limited or unavailable.");
}

// --- Tier 3: Local Ollama Multi-Model Auto-Switch ---
async function callOllamaAPI(messages, promptText) {
  const ollamaHost = getOllamaHost();
  log("TIER3_OLLAMA", `Attempting local failover via Ollama at ${ollamaHost}...`);

  let installedModels = ['gemma4:e4b'];
  try {
    const tagsRes = await fetch(`${ollamaHost}/api/tags`);
    if (tagsRes.ok) {
      const tagsData = await tagsRes.json();
      if (tagsData.models && tagsData.models.length > 0) {
        installedModels = tagsData.models.map(m => m.name);
      }
    }
  } catch (e) {
    log("TIER3_OLLAMA_TAGS", "Could not fetch local tags, using fallback list.");
  }

  // Priority order for local models
  const preferredOrder = [
    'qwen2.5-coder:7b',
    'qwen2.5-coder:14b',
    'deepseek-coder:6.7b',
    'qwen2.5-coder:1.5b-base',
    'gemma4:e4b',
    'gemma4:latest',
    'llama3.1:8b'
  ];

  // Order available models by preference
  const modelsToTry = [];
  for (const pref of preferredOrder) {
    if (installedModels.includes(pref)) modelsToTry.push(pref);
  }
  for (const inst of installedModels) {
    if (!modelsToTry.includes(inst)) modelsToTry.push(inst);
  }

  log("TIER3_OLLAMA_CASCADE", `Auto-switching across local Ollama models:`, modelsToTry);

  for (let i = 0; i < modelsToTry.length; i++) {
    const modelName = modelsToTry[i];
    log("TIER3_TRY_MODEL", `[${i + 1}/${modelsToTry.length}] Trying Local Ollama Model: ${modelName}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const payload = messages ? {
        model: modelName,
        messages: messages,
        stream: false
      } : {
        model: modelName,
        prompt: promptText,
        stream: false
      };

      const endpoint = messages ? `${ollamaHost}/api/chat` : `${ollamaHost}/api/generate`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        log("TIER3_FAIL_HTTP", `Ollama model ${modelName} returned HTTP ${res.status}. Auto-switching...`);
        continue;
      }

      const data = await res.json();
      const text = data.message ? data.message.content : data.response;

      if (text) {
        stats.tier3OllamaSuccesses++;
        stats.activeTier = `Tier 3 (Local Ollama: ${modelName})`;
        log("TIER3_SUCCESS", `Completed via Local Ollama Model: ${modelName}`);
        return { text, provider: `ollama/${modelName}`, tier: 3 };
      } else {
        log("TIER3_EMPTY", `Ollama model ${modelName} returned empty text. Auto-switching...`);
        continue;
      }
    } catch (err) {
      clearTimeout(timeoutId);
      log("TIER3_ERR", `Local model ${modelName} failed (${err.message}). Auto-switching...`);
      continue;
    }
  }

  throw new Error("All local Ollama models failed or timed out.");
}

// --- Main Cascade Executor ---
async function executeWithCascade(messages, promptText) {
  loadEnv();
  stats.totalRequests++;

  // Step 1: Try Gemini (Tier 1)
  try {
    return await callGeminiAPI(messages, promptText);
  } catch (err1) {
    log("CASCADE", "Gemini exhausted/failed. Auto-switching to Tier 2 (OpenRouter Free)...");
  }

  // Step 2: Try OpenRouter Free Models (Tier 2)
  try {
    return await callOpenRouterAPI(messages, promptText);
  } catch (err2) {
    log("CASCADE", `OpenRouter Free skipped/failed (${err2.message}). Auto-switching to Tier 3 (Local Ollama)...`);
  }

  // Step 3: Try Local Ollama (Tier 3)
  try {
    return await callOllamaAPI(messages, promptText);
  } catch (err3) {
    stats.failures++;
    log("CASCADE_FATAL", "All providers (Gemini, OpenRouter Free, Local Ollama) failed.");
    throw new Error(`Autocomplete Cascade Completed. Gemini: ${stats.lastFallbackReason || 'Exhausted'}. Ollama: ${err3.message}.`);
  }
}

// --- HTTP Server Definition ---
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  if (req.method === 'GET' && (pathname === '/health' || pathname === '/status')) {
    loadEnv();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      service: 'Antigravity Local Autocomplete Agent',
      uptimeSeconds: Math.floor(process.uptime()),
      stats: stats,
      configuredKeys: {
        hasGeminiKey: Boolean(process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY),
        hasOpenRouterKey: Boolean(process.env.OPENROUTER_API_KEY)
      },
      ollamaHost: getOllamaHost()
    }, null, 2));
    return;
  }

  if (req.method === 'POST' && (pathname === '/v1/chat/completions' || pathname === '/v1/completions' || pathname === '/autocomplete')) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        let messages = payload.messages || null;
        let promptText = payload.prompt || null;

        if (!messages && !promptText) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Request body must contain "messages" or "prompt"' }));
          return;
        }

        const result = await executeWithCascade(messages, promptText);

        if (pathname === '/v1/chat/completions') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: result.provider,
            choices: [{
              index: 0,
              message: {
                role: 'assistant',
                content: result.text
              },
              finish_reason: 'stop'
            }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            antigravity_metadata: {
              tier: result.tier,
              provider: result.provider,
              cost: "$0.00 (100% Free Tier)"
            }
          }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: `cmpl-${Date.now()}`,
          object: 'text_completion',
          created: Math.floor(Date.now() / 1000),
          model: result.provider,
          choices: [{
            text: result.text,
            index: 0,
            logprobs: null,
            finish_reason: 'stop'
          }],
          antigravity_metadata: {
            tier: result.tier,
            provider: result.provider,
            cost: "$0.00 (100% Free Tier)"
          }
        }));

      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: {
            message: err.message,
            type: 'agent_cascade_error',
            code: 500
          }
        }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found. Available endpoints: /status, /v1/chat/completions, /v1/completions, /autocomplete' }));
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    log("SERVER_INFO", `Port ${PORT} is ALREADY IN USE. The Antigravity Local Autocomplete Agent is already running!`);
    log("SERVER_INFO", `To check status, visit: http://localhost:${PORT}/status or run "npm run autocomplete:status"`);
    process.exit(0);
  } else {
    log("SERVER_ERR", "Server error:", err.message);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  log("SERVER_START", `Antigravity Local Autocomplete Agent running at http://localhost:${PORT}`);
  log("SERVER_INFO", "Auto-Switch Cascade: Tier 1 (Gemini 2.0) -> Tier 2 (OpenRouter Free Models) -> Tier 3 (Local Ollama Multi-Models)");
  log("SERVER_INFO", "Zero Cost Policy: 100% Free Tier Guaranteed ($0.00)");
});

module.exports = { executeWithCascade, server, stats };
