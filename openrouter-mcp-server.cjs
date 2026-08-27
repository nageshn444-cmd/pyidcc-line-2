const readline = require('readline');
const fs = require('fs');

// Helper to log debug/trace output to stderr so it does not corrupt the stdout JSON-RPC stream
const log = (...args) => console.error('[OpenRouterMCP]', ...args);

// Load env variables manually from c:/Users/nages/pyidcc/.env
function loadEnv() {
  const envPath = 'c:/Users/nages/pyidcc/.env';
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        // Match KEY=VALUE, ignore comments
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
      log("Loaded env variables from .env");
    } catch (e) {
      log("Error parsing .env:", e.message);
    }
  }
}

loadEnv();

const apiKey = process.env.OPENROUTER_API_KEY || process.env.VITE_GEMINI_API_KEY; 

// Helper to fetch list of free models dynamically from OpenRouter
async function fetchFreeModels() {
  const blacklisted = new Set([
    "google/gemma-4-31b-it:free",
    "google/gemma-4-26b-a4b-it:free",
    "google/gemma-2b-it:free",
    "google/lyria-3-pro-preview",
    "google/lyria-3-clip-preview",
    "z-ai/glm-5.2:free",
    "openai/gpt-oss-20b:free",
    "nvidia/nemotron-3.5-content-safety:free",
    "sarvamai/fine-tuna-llama-3-8b-swa:free"
  ]);
  try {
    log("Fetching live list of free models from OpenRouter...");
    const response = await fetch('https://openrouter.ai/api/v1/models');
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    const data = await response.json();
    const freeModels = data.data
      .filter(model => (parseFloat(model.pricing.prompt) === 0 && parseFloat(model.pricing.completion) === 0) && !blacklisted.has(model.id))
      .map(m => m.id);
    
    // Put high performance coding models at top
    const priorityList = [
      "nvidia/nemotron-3.5-lightning:free",
      "nvidia/nemotron-3-super-120b-a12b:free",
      "nvidia/nemotron-3-ultra-550b-a55b:free",
      "liquid/lfm-2.5-2.6b:free",
      "cohere/north-mini-code:free",
      "poolside/laguna-s-2.1:free",
      "nvidia/nemotron-3-nano-30b-a3b:free",
      "dots-studio/dots-3-note-preview:free",
      "openrouter/free"
    ];

    const combined = [...priorityList, ...freeModels.filter(m => !priorityList.includes(m))];
    log(`Successfully filtered ${combined.length} verified free models dynamically.`);
    return combined.filter(m => !blacklisted.has(m));
  } catch (err) {
    log("Failed to fetch live free models, using fallback list. Error:", err.message);
    return [
      "nvidia/nemotron-3.5-lightning:free",
      "nvidia/nemotron-3-super-120b-a12b:free",
      "nvidia/nemotron-3-ultra-550b-a55b:free",
      "liquid/lfm-2.5-2.6b:free",
      "cohere/north-mini-code:free",
      "poolside/laguna-s-2.1:free",
      "nvidia/nemotron-3-nano-30b-a3b:free",
      "dots-studio/dots-3-note-preview:free",
      "openrouter/free"
    ];
  }
}

// Call OpenRouter chat completions with automatic model fallback switching on 429 or failure
async function queryOpenRouterWithAutoSwitch(prompt, systemPrompt, preferredModel) {
  const currentKey = process.env.OPENROUTER_API_KEY;
  if (!currentKey) {
    return {
      success: false,
      error: "API key missing. Please add 'OPENROUTER_API_KEY=your_key' to your c:/Users/nages/pyidcc/.env file."
    };
  }

  const freeModels = await fetchFreeModels();
  const blacklisted = new Set([
    "google/gemma-4-31b-it:free",
    "google/gemma-4-26b-a4b-it:free",
    "google/gemma-2b-it:free",
    "google/lyria-3-pro-preview",
    "google/lyria-3-clip-preview",
    "z-ai/glm-5.2:free",
    "openai/gpt-oss-20b:free",
    "nvidia/nemotron-3.5-content-safety:free",
    "sarvamai/fine-tuna-llama-3-8b-swa:free"
  ]);

  let modelsToTry = [];
  
  if (preferredModel && preferredModel !== 'auto') {
    if (blacklisted.has(preferredModel)) {
      log(`Requested model ${preferredModel} is blacklisted/inaccessible on OpenRouter. Remapping to 'nvidia/nemotron-3.5-lightning:free'...`);
      modelsToTry.push('nvidia/nemotron-3.5-lightning:free');
    } else {
      modelsToTry.push(preferredModel);
    }
  }
  
  for (const model of freeModels) {
    if (!modelsToTry.includes(model) && !blacklisted.has(model)) {
      modelsToTry.push(model);
    }
  }

  // Ensure 'openrouter/free' router is at least present as a final fallback
  if (!modelsToTry.includes("openrouter/free")) {
    modelsToTry.push("openrouter/free");
  }

  log(`Models to try in order:`, modelsToTry);

  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    log(`[Attempt ${i + 1}/${modelsToTry.length}] Querying model: ${model}`);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 second timeout

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${currentKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/google/antigravity",
          "X-Title": "Antigravity IDE MCP"
        },
        body: JSON.stringify({
          model: model,
          messages: [
            ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
            { role: "user", content: prompt }
          ]
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        log(`Model ${model} returned 429 (Rate Limit). Trying next model...`);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        log(`Model ${model} failed with HTTP ${response.status}: ${errorText}. Trying next model...`);
        continue;
      }

      const resData = await response.json();
      if (resData.choices && resData.choices[0] && resData.choices[0].message) {
        const textContent = resData.choices[0].message.content;
        log(`Success! Request completed using model: ${model}`);
        return {
          success: true,
          model: model,
          text: textContent
        };
      } else {
        log(`Model ${model} returned invalid payload structure. Trying next...`);
        continue;
      }
    } catch (err) {
      log(`Query error for model ${model}: ${err.message}. Trying next model...`);
      continue;
    }
  }

  return {
    success: false,
    error: "All free OpenRouter models failed or were rate-limited. Please check your network and API key."
  };
}

// JSON-RPC Stdout Response Helpers
function sendResult(id, result) {
  console.log(JSON.stringify({
    jsonrpc: "2.0",
    id,
    result
  }));
}

function sendError(id, code, message) {
  console.log(JSON.stringify({
    jsonrpc: "2.0",
    id,
    error: { code, message }
  }));
}

// Handle incoming JSON-RPC requests
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
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: "openrouter-free-mcp",
          version: "1.0.0"
        }
      });
      break;
      
    case "notifications/initialized":
      log("MCP handshake completed successfully.");
      break;
      
    case "ping":
      sendResult(id, {});
      break;
      
    case "tools/list":
      sendResult(id, {
        tools: [
          {
            name: "ask_openrouter",
            description: "Queries free models on OpenRouter with automatic fallback/switching. Ensure you have configured 'OPENROUTER_API_KEY' in your .env.",
            inputSchema: {
              type: "object",
              properties: {
                prompt: {
                  type: "string",
                  description: "The prompt to send to the models."
                },
                system_prompt: {
                  type: "string",
                  description: "Optional system instruction set for the model."
                },
                model: {
                  type: "string",
                  description: "Optional specific model ID (e.g. 'liquid/lfm-2.5-2.6b:free' or 'openrouter/free'). Defaults to 'auto' to switch automatically between available free models."
                }
              },
              required: ["prompt"]
            }
          },
          {
            name: "list_free_models",
            description: "Returns the list of active free models currently available on OpenRouter.",
            inputSchema: {
              type: "object",
              properties: {}
            }
          }
        ]
      });
      break;
      
    case "tools/call":
      if (!params || !params.name) {
        sendError(id, -32602, "Invalid params: name is required");
        break;
      }
      
      const toolName = params.name;
      const args = params.arguments || {};
      
      if (toolName === "list_free_models") {
        try {
          const modelsList = await fetchFreeModels();
          sendResult(id, {
            content: [
              {
                type: "text",
                text: JSON.stringify(modelsList, null, 2)
              }
            ]
          });
        } catch (err) {
          sendResult(id, {
            content: [
              {
                type: "text",
                text: `Error fetching models: ${err.message}`
              }
            ],
            isError: true
          });
        }
      } else if (toolName === "ask_openrouter") {
        if (!args.prompt) {
          sendResult(id, {
            content: [
              {
                type: "text",
                text: "Error: prompt argument is required."
              }
            ],
            isError: true
          });
          break;
        }
        
        try {
          const result = await queryOpenRouterWithAutoSwitch(
            args.prompt,
            args.system_prompt,
            args.model
          );
          
          if (result.success) {
            sendResult(id, {
              content: [
                {
                  type: "text",
                  text: `[Model Used: ${result.model}]\n\n${result.text}`
                }
              ]
            });
          } else {
            sendResult(id, {
              content: [
                {
                  type: "text",
                  text: `Error calling OpenRouter: ${result.error}`
                }
              ],
              isError: true
            });
          }
        } catch (err) {
          sendResult(id, {
            content: [
              {
                type: "text",
                text: `Exception: ${err.message}`
              }
            ],
            isError: true
          });
        }
      } else {
        sendError(id, -32601, `Tool not found: ${toolName}`);
      }
      break;
      
    default:
      if (id !== undefined) {
        sendError(id, -32601, `Method not found: ${method}`);
      }
      break;
  }
}

// Start CLI Reader
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

log("OpenRouter Free MCP Server started on stdio.");
