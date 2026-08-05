const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Helper to log debug output to stderr so stdout JSON-RPC stream stays clean
const log = (...args) => console.error('[LocalAutocompleteMCP]', ...args);

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
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    } catch (e) {
      log("Error reading .env:", e.message);
    }
  }
}

loadEnv();

function getOllamaHost() {
  let rawHost = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
  rawHost = rawHost.replace('0.0.0.0', '127.0.0.1');
  if (!rawHost.startsWith('http://') && !rawHost.startsWith('https://')) {
    rawHost = `http://${rawHost}`;
  }
  return rawHost;
}

// Query local agent server on port 5050 with automatic fallback
async function queryLocalAgentEndpoint(prompt, messages = null) {
  const agentUrl = 'http://localhost:5050/v1/chat/completions';
  const payload = messages ? { messages } : { prompt };

  try {
    const res = await fetch(agentUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.choices && data.choices[0]?.message?.content || data.choices[0]?.text;
      return {
        success: true,
        text: text,
        metadata: data.antigravity_metadata || { provider: data.model }
      };
    }
  } catch (err) {
    log("Local agent server on 5050 not responding, performing direct auto-switching cascade...");
  }

  // Direct Tier 1: Gemini API
  const geminiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const contents = messages ? messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      })) : [{ role: 'user', parts: [{ text: prompt }] }];

      const gRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents })
      });

      if (gRes.ok) {
        const gData = await gRes.json();
        const text = gData.candidates[0].content.parts.map(p => p.text).join('');
        return { success: true, text, metadata: { provider: 'gemini-2.0-flash', tier: 1 } };
      }
    } catch (e) {
      log("Direct Gemini fallback failed:", e.message);
    }
  }

  // Direct Tier 3: Local Ollama Multi-Model Auto-Switch
  const ollamaHost = getOllamaHost();
  try {
    let installedModels = ['gemma4:e4b'];
    const tagRes = await fetch(`${ollamaHost}/api/tags`);
    if (tagRes.ok) {
      const tagData = await tagRes.json();
      if (tagData.models && tagData.models.length > 0) {
        installedModels = tagData.models.map(m => m.name);
      }
    }

    const preferredOrder = ['qwen2.5-coder:7b', 'qwen2.5-coder:14b', 'deepseek-coder:6.7b', 'gemma4:e4b', 'llama3.1:8b'];
    const modelsToTry = preferredOrder.filter(m => installedModels.includes(m)).concat(installedModels.filter(m => !preferredOrder.includes(m)));

    for (const modelName of modelsToTry) {
      try {
        const oPayload = messages ? { model: modelName, messages, stream: false } : { model: modelName, prompt, stream: false };
        const oEndpoint = messages ? `${ollamaHost}/api/chat` : `${ollamaHost}/api/generate`;

        const oRes = await fetch(oEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(oPayload)
        });

        if (oRes.ok) {
          const oData = await oRes.json();
          const text = oData.message ? oData.message.content : oData.response;
          if (text) {
            return { success: true, text, metadata: { provider: `ollama/${modelName}`, tier: 3 } };
          }
        }
      } catch (e) {
        continue;
      }
    }
  } catch (err) {
    log("Direct Ollama cascade failed:", err.message);
  }

  return { success: false, error: "All local and zero-cost providers failed." };
}

// Fetch list of local Ollama models
async function fetchLocalOllamaModels() {
  const host = getOllamaHost();
  try {
    const res = await fetch(`${host}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.models || [];
  } catch (err) {
    return [];
  }
}

// JSON-RPC Helpers
function sendResult(id, result) {
  console.log(JSON.stringify({ jsonrpc: "2.0", id, result }));
}

function sendError(id, code, message) {
  console.log(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }));
}

// Handle JSON-RPC request
async function handleRequest(req) {
  const { jsonrpc, id, method, params } = req;
  if (jsonrpc !== "2.0") {
    sendError(id, -32600, "Invalid Request: expected jsonrpc '2.0'");
    return;
  }

  switch (method) {
    case "initialize":
      sendResult(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "local-autocomplete-mcp-server", version: "1.0.0" }
      });
      break;

    case "notifications/initialized":
      log("MCP Handshake complete.");
      break;

    case "ping":
      sendResult(id, {});
      break;

    case "tools/list":
      sendResult(id, {
        tools: [
          {
            name: "local_autocomplete",
            description: "Generates real-time zero-cost code and text autocomplete using Gemini -> OpenRouter Free -> Local Ollama auto-switching cascade.",
            inputSchema: {
              type: "object",
              properties: {
                prompt: { type: "string", description: "The code prefix or prompt to complete." },
                prefix: { type: "string", description: "Code prefix before cursor." },
                suffix: { type: "string", description: "Code suffix after cursor." }
              },
              required: ["prompt"]
            }
          },
          {
            name: "chat_local_agent",
            description: "Perform zero-cost conversation and reasoning using auto-switching local cascade pipeline.",
            inputSchema: {
              type: "object",
              properties: {
                prompt: { type: "string", description: "User message or query." },
                system_prompt: { type: "string", description: "Optional system instructions." }
              },
              required: ["prompt"]
            }
          },
          {
            name: "get_autocomplete_status",
            description: "Checks health of local agent server, Gemini API, and local Ollama daemon.",
            inputSchema: { type: "object", properties: {} }
          },
          {
            name: "list_local_ollama_models",
            description: "Lists all locally installed Ollama models.",
            inputSchema: { type: "object", properties: {} }
          }
        ]
      });
      break;

    case "tools/call":
      if (!params || !params.name) {
        sendError(id, -32602, "Invalid params: name is required");
        break;
      }

      const { name, arguments: args = {} } = params;

      if (name === "local_autocomplete" || name === "chat_local_agent") {
        let promptText = args.prompt || "";
        if (args.prefix || args.suffix) {
          promptText = `<PRE> ${args.prefix || ""} <SUF> ${args.suffix || ""} <MID> ${promptText}`;
        }
        const messages = args.system_prompt ? [
          { role: 'system', content: args.system_prompt },
          { role: 'user', content: promptText }
        ] : null;

        const result = await queryLocalAgentEndpoint(promptText, messages);
        if (result.success) {
          sendResult(id, {
            content: [{ type: "text", text: result.text }]
          });
        } else {
          sendResult(id, {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true
          });
        }
      } else if (name === "get_autocomplete_status") {
        const ollamaModels = await fetchLocalOllamaModels();
        let agentServerOnline = false;
        try {
          const sRes = await fetch('http://localhost:5050/status');
          agentServerOnline = sRes.ok;
        } catch (e) {}

        sendResult(id, {
          content: [{
            type: "text",
            text: JSON.stringify({
              agentServerStatus: agentServerOnline ? "ONLINE (http://localhost:5050)" : "OFFLINE (Direct Cascade Active)",
              ollamaHost: getOllamaHost(),
              ollamaModelsCount: ollamaModels.length,
              availableOllamaModels: ollamaModels.map(m => m.name)
            }, null, 2)
          }]
        });
      } else if (name === "list_local_ollama_models") {
        const models = await fetchLocalOllamaModels();
        sendResult(id, {
          content: [{ type: "text", text: JSON.stringify(models, null, 2) }]
        });
      } else {
        sendError(id, -32601, `Tool not found: ${name}`);
      }
      break;

    default:
      if (id !== undefined) {
        sendError(id, -32601, `Method not found: ${method}`);
      }
      break;
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    const request = JSON.parse(line);
    handleRequest(request);
  } catch (err) {
    sendError(null, -32700, "Parse error: " + err.message);
  }
});

log("Local Autocomplete MCP Server initialized.");
