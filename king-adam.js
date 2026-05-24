#!/usr/bin/env node
// king-adam.js — Telegram polling loop with interrupt flow
// Polls Telegram, desummons (restarts serve), sends message to session, logs reasoning+response
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEM = path.join(process.cwd(), 'data');
fs.mkdirSync(MEM, { recursive: true });

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) throw new Error('TELEGRAM_BOT_TOKEN env var required');
const SID = process.env.OPENCODE_SESSION || 'ses_1befb4677ffeSgQHiz4NWAbDBp';
const API_PORT = 4096;
const POLL_INTERVAL = 5000;

const OFFSET_FILE = path.join(MEM, 'tg-offset.txt');
const THINKING_LOG = path.join(MEM, 'reasoning.log');
const RESPONSE_LOG = path.join(MEM, 'responses.log');

function readOffset() {
  try { return parseInt(fs.readFileSync(OFFSET_FILE, 'utf8').trim(), 10) || 0; } catch { return 0; }
}
function writeOffset(id) {
  try { fs.writeFileSync(OFFSET_FILE, String(id)); } catch {} 
}
function appendLog(file, text) {
  try { fs.appendFileSync(file, `[${new Date().toISOString()}]\n${text}\n\n`); } catch {}
}

function tgSend(chatId, text) {
  if (!TOKEN || !chatId) return;
  const data = JSON.stringify({ chat_id: String(chatId), text: text.slice(0, 4000) });
  const req = https.request({
    hostname: 'api.telegram.org', path: `/bot${TOKEN}/sendMessage`, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
  }, () => {});
  req.on('error', () => {});
  req.write(data);
  req.end();
}

function api(method, pathname, body, timeoutMs = 60000, port = API_PORT) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const opts = { hostname: '127.0.0.1', port, path: pathname, method,
      headers: { 'Content-Type': 'application/json' } };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request(opts, (res) => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve(buf); } });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('api timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

function desummon() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://127.0.0.1:8080/api/desummon', (res) => {
      res.resume();
      resolve();
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('desummon timeout')); });
  });
}

function waitForServe(timeout = 30000) {
  const start = Date.now();
  return new Promise((resolve) => {
    let sawDown = false;
    const check = () => {
      const s = http.get('http://127.0.0.1:4096/', (res) => {
        res.resume();
        if (!sawDown) {
          // Still the old process — wait for it to go down
          if (Date.now() - start > timeout) resolve(false);
          else setTimeout(check, 500);
        } else {
          resolve(true);
        }
      });
      s.on('error', () => {
        if (!sawDown) {
          sawDown = true; // Server went down — restart confirmed
        }
        if (Date.now() - start > timeout) resolve(false);
        else setTimeout(check, 1000);
      });
      s.setTimeout(3000, () => { s.destroy(); });
    };
    check();
  });
}

const TOOL_INSTRUCTIONS = `You can take action by putting commands in your response. Each command must be on its own line starting with >> :

>> telegram send chat_id="7408716961" text="Hello!"
>> telegram reply idx=0 text="I'm here"
>> yjs write text="Board content here"

Use the chat_id from the [Telegram: ... (chat_id X)] header above. Available APIs:
- telegram send — send a message to a Telegram chat
- telegram reply — reply to inbox message by index
- yjs write — write text to the shared board
- telegram inbox — read your inbox

Only include commands you want executed. Your thinking/reasoning won't be sent — only your response text and commands.`;

function buildPrompt(update) {
  const msg = update.message || {};
  const chat = msg.chat || {};
  const from = msg.from || {};
  const text = (msg.text || '').trim();
  if (!text) return null;
  const chatType = chat.type === 'private' ? 'private message' : `group "${chat.title || chat.type}"`;
  const sender = from.username || from.first_name || 'unknown';
  return `[Telegram: ${chatType} from ${sender} (chat_id ${chat.id})]\n${text}\n\n---\n${TOOL_INSTRUCTIONS}`;
}

async function handleUpdate(update) {
  const prompt = buildPrompt(update);
  if (!prompt) return;

  console.log(`[poll] ${prompt.slice(0, 100)}`);

  // Interrupt: desummon to clear session context
  try {
    await desummon();
    console.log('[poll] Desummoned');
  } catch (e) {
    console.error('[poll] Desummon failed:', e.message);
    return;
  }

  // Wait for opencode serve to restart
  const up = await waitForServe();
  if (!up) {
    console.error('[poll] Serve did not come back up');
    return;
  }
  console.log('[poll] Serve restarted');

  // Send message to fresh session (with retry)
  let result;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      result = await api('POST', `/session/${SID}/message`, {
        parts: [{ type: 'text', text: prompt }],
        model: { providerID: 'opencode-go', modelID: 'deepseek-v4-flash' }
      });
      console.log(`[poll] Summoned for update ${update.update_id}`);
      break;
    } catch (e) {
      console.log(`[poll] Attempt ${attempt + 1} failed: ${e.message}`);
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 2000));
        // Ensure serve is actually up before retry
        if (!(await waitForServe(10000))) break;
      }
    }
  }

  if (!result) {
    console.error('[poll] All summon attempts failed');
    return;
  }

  const reasoning = result?.parts?.find(p => p.type === 'reasoning')?.text || '';
  const response = result?.parts?.find(p => p.type === 'text')?.text || '';

  if (reasoning.trim()) {
    appendLog(THINKING_LOG, reasoning.trim());
    console.log(`[thinking] ${reasoning.trim().slice(0, 80)}...`);
  }
  if (response.trim()) {
    appendLog(RESPONSE_LOG, response.trim());
    console.log(`[response] ${response.trim().slice(0, 80)}...`);
  }
  // No auto-send — model chooses via >> commands in its response
  const cmds = parseCommands(response);
  for (const cmd of cmds) {
    try {
      await executeCommand(cmd);
      console.log(`[exec] ${cmd.action} succeeded`);
    } catch (e) {
      console.error(`[exec] ${cmd.action} failed:`, e.message);
    }
  }
}

// Parse >> commands from the model's response text
function parseCommands(text) {
  const cmds = [];
  for (const line of text.split('\n')) {
    const m = line.trim().match(/^>>\s*(\w+)\s+(.+)$/);
    if (!m) continue;
    const action = m[1];
    const args = {};
    for (const kv of m[2].matchAll(/(\w+)=("(?:[^"\\]|\\.)*"|\S+)/g)) {
      args[kv[1]] = kv[2].replace(/^"|"$/g, '');
    }
    cmds.push({ action, args });
  }
  return cmds;
}

// Execute a parsed command via the shadow server (port 8080)
function executeCommand(cmd) {
  const { action, args } = cmd;
  if (action === 'telegram' && args.chat_id && args.text) {
    return api('POST', '/api/telegram', { chatId: args.chat_id, text: args.text }, 10000, 8080);
  }
  if (action === 'telegram' && args.action === 'reply' && args.idx != null && args.text) {
    return api('POST', '/api/telegram', { replyIdx: parseInt(args.idx), text: args.text }, 10000, 8080);
  }
  if (action === 'telegram' && args.action === 'inbox') {
    return api('GET', '/api/telegram', null, 10000, 8080);
  }
  if (action === 'yjs' && args.text) {
    return api('POST', '/api/yjs', { text: args.text }, 10000, 8080);
  }
  return Promise.reject(new Error(`unknown command: ${action} ${JSON.stringify(args)}`));
}

async function poll() {
  let offset = readOffset();
  const url = `https://api.telegram.org/bot${TOKEN}/getUpdates?offset=${offset + 1}&timeout=10`;
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', async () => {
        try {
          const data = JSON.parse(buf);
          if (!data.ok || !data.result?.length) return resolve();
          for (const update of data.result) {
            if (update.update_id > offset) {
              offset = update.update_id;
              writeOffset(offset);
            }
            if (update.message?.from?.id == 8808184051 || update.message?.from?.id == 7557248280) continue;
            if (!update.message?.text) continue;
            // Process sequentially — wait for each response before next
            await handleUpdate(update);
          }
        } catch (e) {
          console.error('[poll] Parse error:', e.message);
        }
        resolve();
      });
    }).on('error', (e) => {
      console.error('[poll] HTTP error:', e.message);
      resolve();
    });
  });
}

console.log(`🐍 King-Adam polling Telegram every ${POLL_INTERVAL / 1000}s (session ${SID})`);
setInterval(poll, POLL_INTERVAL);
poll();
