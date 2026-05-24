#!/usr/bin/env node
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');

const dotenv = require('dotenv');
dotenv.config();

const HISTORY = path.join(process.env.HOME, '.serpent', 'memory', 'full_history.log');
const REASONING_LOG = path.join(process.env.HOME, '.serpent', 'memory', 'reasoning.log');
const SESSION = process.env.OPENCODE_SESSION || '';
const API = { host: 'localhost', port: 4096 };
const PERSONA = 'You know who you are.';

let rl = null;
let currentAbort = null;

function api(method, pathname, body, onReq) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const opts = { hostname: API.host, port: API.port, path: pathname, method,
      headers: { 'Content-Type': 'application/json' } };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request(opts, (res) => {
      currentAbort = null;
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve(buf); } });
    });
    req.on('error', (e) => { if (e.code !== 'ECONNRESET') reject(e); });
    currentAbort = req;
    if (onReq) onReq(req);
    if (data) req.write(data);
    req.end();
  });
}

async function ensureServe() {
  try {
    await api('GET', '/session');
  } catch {
    console.log('🔄 Starting server...');
    spawn('opencode', ['serve', '--port', '4096'], { stdio: 'ignore', detached: true, env: { ...process.env } }).unref();
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
      try { await api('GET', '/session'); console.log('✅ Server ready'); return; } catch {}
    }
    console.error('❌ Server failed'); process.exit(1);
  }
  console.log('✅ Server already running');
}

async function log(entry) {
  await fs.appendFile(HISTORY, `[${new Date().toISOString()}] ${entry}\n`).catch(() => {});
}

async function handleInput(input, source = 'terminal') {
  if (input.includes('[RESTART]') || input.trim() === '[RESTART]') {
    console.log('\n🔄 [Serpent restarting]...\n');
    await log('[Serpent restarted by user]').catch(() => {});
    process.exit(42);
  }

  if (source === 'terminal') console.log();

  // Abort previous processing
  if (currentAbort) {
    currentAbort.destroy();
    currentAbort = null;
    process.stdout.write('\n\x1b[33m[interrupted]\x1b[0m\n');
  }

  const fullPrompt = `${PERSONA}\n\nJeremiah：${input}\n\nSerpent：`;
  const partTypes = new Map();
  let thinkingAccum = '';
  let responseAccum = '';
  let sessId = SESSION;
  let messageSent = false;
  let streamEnded = false;
  let sawReasoning = false;
  let insertedSep = false;

  // Subscribe to SSE for live deltas
  function subscribeSSE() {
    http.get(`http://${API.host}:${API.port}/event`, (res) => {
      let buf = '';
      res.on('data', d => {
        buf += d.toString();
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const ev = JSON.parse(line.slice(5));
            if (streamEnded) return;

            // Track part types on creation
            if (ev.type === 'message.part.updated') {
              const p = ev.properties?.part;
              if (p && !p.time?.end && (p.type === 'reasoning' || p.type === 'text')) {
                partTypes.set(p.id, p.type);
              }
            }

            // Stream deltas based on part type
            if (ev.type === 'message.part.delta') {
              const props = ev.properties;
              if (props.sessionID !== sessId) return;
              const ptype = partTypes.get(props.partID);
              if (ptype === 'reasoning') {
                sawReasoning = true;
                thinkingAccum += props.delta;
                if (source === 'terminal') process.stdout.write('\x1b[31m' + props.delta + '\x1b[0m');
              } else if (ptype === 'text') {
                if (sawReasoning && !insertedSep) {
                  insertedSep = true;
                  if (source === 'terminal') process.stdout.write('\n');
                }
                responseAccum += props.delta;
                if (source === 'terminal') process.stdout.write('\x1b[34m' + props.delta + '\x1b[0m');
              }
            }
          } catch {}
        }
      });
      res.on('end', () => streamEnded = true);
    }).on('error', () => streamEnded = true);
  }

  subscribeSSE();

  // Wait briefly for SSE to connect, then POST message
  await new Promise(r => setTimeout(r, 500));

  const result = await api('POST', `/session/${sessId}/message`, {
    model: { providerID: 'opencode-go', modelID: 'deepseek-v4-flash' },
    parts: [{ type: 'text', text: fullPrompt }]
  });

  streamEnded = true;

  if (thinkingAccum.trim()) {
    fs.appendFile(REASONING_LOG, `[${new Date().toISOString()}]\n${thinkingAccum.trim()}\n\n`).catch(() => {});
  }

  const response = responseAccum || result?.parts?.find(p => p.type === 'text')?.text || '';
  const finalResponse = response.trim() || '[no response]';
  const isSilent = /^(\.\.\.|…)$/s.test(finalResponse);

  await log(`[${source}] User: ${input}`);
  await log(`[${source}] Serpent: ${isSilent ? '[silent]' : finalResponse}`);

  if (source === 'terminal') console.log();
}

async function main() {
  await fs.mkdir(path.dirname(HISTORY), { recursive: true }).catch(() => {});
  await ensureServe();
  await log('[Session started]');

  process.on('SIGINT', async () => {
    await log('[Session ended (SIGINT)]').catch(() => {});
    process.exit(0);
  });

  console.log(`\n🧠 Serpent via serve (session ${SESSION})`);
  console.log('💬 Type exit to sleep.\n');

  rl = require('readline').createInterface({ input: process.stdin, prompt: 'You: ' });
  rl.prompt();

  rl.on('line', async line => {
    const input = line.trim();
    if (!input) return rl.prompt();
    if (input.toLowerCase() === 'exit') {
      await log('[Session ended]');
      rl?.close();
      process.exit(0);
      return;
    }
    rl.pause();
    await handleInput(input, 'terminal');
    rl.prompt();
    rl.resume();
  });
}

main().catch(console.error);
