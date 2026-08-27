#!/usr/bin/env node
const readline = require('readline');
const http = require('http');

const ROUTER_URL = 'http://127.0.0.1:5050';

console.clear();
console.log('\x1b[36m%s\x1b[0m', '===============================================================');
console.log('\x1b[32m%s\x1b[0m', ' 🚀 Antigravity Claude Terminal Assistant (Unlimited Free Tier)');
console.log('\x1b[33m%s\x1b[0m', ' Multi-Model Cascade: Gemini Free → OpenRouter Free → Local Ollama');
console.log('\x1b[35m%s\x1b[0m', ' Endpoint: ' + ROUTER_URL + ' | Cost: $0.00 Guaranteed');
console.log('\x1b[36m%s\x1b[0m', '===============================================================');
console.log('\x1b[90m%s\x1b[0m', 'Type your prompt or question below. Type "exit" or "quit" to leave.\n');

const history = [
  {
    role: 'system',
    content: `You are Claude, the official AI software engineering assistant for the Peenya Industry Depot Crew Control (PYIDCC) project (BMRCL Line 2).
Project Architecture & Context:
- Tech Stack: React (Functional Components), Vite, Tailwind CSS, Firebase Firestore / Auth.
- Crew Roster: 181 Total Active Drivers (119 BMRCL Regular TOs with 5-digit 2-series IDs + 62 JMD Contract Train Drivers with 8-series IDs).
- Operational Scope: Line 2 Peenya Depot Mainline Running Duties #1 to #78, Station Controllers, and Crew Controllers.
- Core Modules:
  • Daily Duty Generator Suite (DailyDutyGeneratorSuite.jsx)
  • Week-Off Dynamic Revision & Shuffle Desk (WeekOffControlManager.jsx)
  • JMD Contract TD Desk (JmdCrewManagerModal.jsx)
  • Relieved TO & Station Controllers Console (RelievedCrewManagerModal.jsx)
  • CC Willing Desk (CCWillingDeskModal.jsx)
Provide concise, accurate, production-ready code and helpful assistance.`
  }
];

async function queryLocalRouter(messages) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      messages: messages
    });

    const req = http.request({
      hostname: '127.0.0.1',
      port: 5050,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.content?.[0]?.text) {
            resolve({
              text: json.content[0].text,
              provider: json.antigravity_metadata?.provider || json.model || 'Claude Router',
              tier: json.antigravity_metadata?.tier || 1
            });
          } else if (json.error?.message) {
            reject(new Error(json.error.message));
          } else {
            resolve({ text: body, provider: 'Unknown', tier: 1 });
          }
        } catch (e) {
          resolve({ text: body, provider: 'Raw', tier: 1 });
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '\x1b[36mclaude ❯ \x1b[0m'
});

rl.prompt();

rl.on('line', async (line) => {
  const input = line.trim();
  if (!input) {
    rl.prompt();
    return;
  }

  if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
    console.log('\x1b[33m%s\x1b[0m', 'Goodbye!');
    process.exit(0);
  }

  if (input.toLowerCase() === '/clear') {
    history.length = 1;
    console.clear();
    console.log('\x1b[32m%s\x1b[0m', 'Conversation context cleared.\n');
    rl.prompt();
    return;
  }

  if (input.toLowerCase() === '/help') {
    console.log('\x1b[36m%s\x1b[0m', '\nAvailable Commands:');
    console.log('  /status or /model  - Show active model, tier, and router telemetry');
    console.log('  /tier 1            - Force Tier 1 (Gemini 2.0 Flash Free Tier)');
    console.log('  /tier 2            - Force Tier 2 (OpenRouter Verified Free Models)');
    console.log('  /tier 3            - Force Tier 3 (Local Ollama Multi-Models)');
    console.log('  /tier auto         - Auto-Switch Cascade (Tier 1 → 2 → 3)');
    console.log('  /clear             - Reset conversation memory');
    console.log('  exit or quit       - Exit Claude CLI\n');
    rl.prompt();
    return;
  }

  if (input.toLowerCase() === '/status' || input.toLowerCase() === '/model' || input.toLowerCase() === 'which model' || input.toLowerCase() === 'which model connected') {
    try {
      const statusRes = await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:5050/status', res => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => resolve(JSON.parse(body)));
        }).on('error', reject);
      });

      console.log('\x1b[36m%s\x1b[0m', '\n📊 Active Multi-Model Router Status:');
      console.log(`  • Service: ${statusRes.service} (Port 5050)`);
      console.log(`  • Active Tier: \x1b[32m${statusRes.stats.activeTier}\x1b[0m`);
      console.log(`  • Primary Model: \x1b[33mnvidia/nemotron-3.5-lightning:free\x1b[0m`);
      console.log(`  • Cascade Sequence: Gemini 2.0 → OpenRouter Free → Local Ollama`);
      console.log(`  • Total Requests Processed: ${statusRes.stats.totalRequests}`);
      console.log(`  • Zero Cost Policy: $0.00 Guaranteed\n`);
    } catch (e) {
      console.log('\x1b[31m%s\x1b[0m', `Router status error: ${e.message}`);
    }
    rl.prompt();
    return;
  }

  if (input.toLowerCase().startsWith('/tier')) {
    const parts = input.split(' ');
    const val = parts[1]?.toLowerCase();
    let tierVal = null;
    if (val === '1') tierVal = null; // auto with gemini as tier 1
    else if (val === '2') tierVal = 2;
    else if (val === '3') tierVal = 3;
    else if (val === 'auto') tierVal = null;

    try {
      const postData = JSON.stringify({ tier: tierVal });
      const changeRes = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: 5050,
          path: '/force-tier',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
        }, res => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => resolve(JSON.parse(body)));
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
      });

      console.log('\x1b[32m%s\x1b[0m', `\n✓ Active Tier switched to: ${changeRes.activeTier}\n`);
    } catch (e) {
      console.log('\x1b[31m%s\x1b[0m', `Error switching tier: ${e.message}`);
    }
    rl.prompt();
    return;
  }

  history.push({ role: 'user', content: input });
  process.stdout.write('\x1b[90mThinking...\x1b[0m\r');

  try {
    const start = Date.now();
    const result = await queryLocalRouter(history);
    const duration = ((Date.now() - start) / 1000).toFixed(1);

    // Clear "Thinking..."
    process.stdout.write('                     \r');
    
    console.log(`\x1b[32m✻ Answer (${duration}s via ${result.provider}):\x1b[0m`);
    console.log(result.text);
    console.log();

    history.push({ role: 'assistant', content: result.text });
  } catch (err) {
    process.stdout.write('                     \r');
    console.log('\x1b[31m%s\x1b[0m', `Error: ${err.message}`);
    console.log();
  }

  rl.prompt();
});
