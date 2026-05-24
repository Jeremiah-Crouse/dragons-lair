#!/usr/bin/env node
// king-adam.js — Telegram polling loop with SSE capture
// Polls Telegram, summons session, captures reasoning+response via SSE, logs + replies
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

function api(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const opts = { hostname: '127.0.0.1', port: API_PORT, path: pathname, method,
      headers: { 'Content-Type': 'application/json' } };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request(opts, (res) => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve(buf); } });
    });
    req.on('error', e => console.error('[api]', e.message));
    if (data) req.write(data);
    req.end();
  });
}

function buildPrompt(update) {
  const msg = update.message || {};
  const chat = msg.chat || {};
  const from = msg.from || {};
  const text = (msg.text || '').trim();
  if (!text) return null;
  const chatType = chat.type === 'private' ? 'private message' : `group "${chat.title || chat.type}"`;
  const sender = from.username || from.first_name || 'unknown';
  return `[Telegram: ${chatType} from ${sender} (chat_id ${chat.id})]\n${text}`;
}

// Subscribe to SSE and accumulate deltas for a specific session
function captureResponse(sessionID, onReasoning, onText, onDone, timeout = 120000) {
  const partTypes = new Map();
  let reasoningAccum = '';
  let textAccum = '';
  let streamEnded = false;
  let sawReasoning = false;
  let insertedSep = false;
  let timer = setTimeout(() => {
    streamEnded = true;
    onDone(reasoningAccum, textAccum);
  }, timeout);

  const req = http.get(`http://127.0.0.1:${API_PORT}/event`, (res) => {
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

          if (ev.type === 'message.part.updated') {
            const p = ev.properties?.part;
            if (p && !p.time?.end && (p.type === 'reasoning' || p.type === 'text')) {
              partTypes.set(p.id, p.type);
            }
          }

          if (ev.type === 'message.part.delta') {
            const props = ev.properties;
            if (props.sessionID !== sessionID) return;
            const ptype = partTypes.get(props.partID);
            if (ptype === 'reasoning') {
              sawReasoning = true;
              reasoningAccum += props.delta;
              if (onReasoning) onReasoning(props.delta);
            } else if (ptype === 'text') {
              if (sawReasoning && !insertedSep) {
                insertedSep = true;
              }
              textAccum += props.delta;
              if (onText) onText(props.delta);
            }
          }

          // Detect end of message
          if (ev.type === 'message.updated' && ev.properties?.message?.time?.end) {
            streamEnded = true;
            clearTimeout(timer);
            onDone(reasoningAccum, textAccum);
          }
          if (ev.type === 'message.part.finished') {
            streamEnded = true;
            clearTimeout(timer);
            onDone(reasoningAccum, textAccum);
          }
        } catch {}
      }
    });
    res.on('end', () => {
      if (!streamEnded) {
        streamEnded = true;
        clearTimeout(timer);
        onDone(reasoningAccum, textAccum);
      }
    });
  });
  req.on('error', () => {
    streamEnded = true;
    clearTimeout(timer);
    onDone(reasoningAccum, textAccum);
  });
}

async function handleUpdate(update) {
  const prompt = buildPrompt(update);
  if (!prompt) return;

  console.log(`[poll] ${prompt.slice(0, 100)}`);

  return new Promise((resolve) => {
    // Subscribe to SSE before posting
    captureResponse(SID, 
      // onReasoning — log only
      (delta) => {},
      // onText — log only
      (delta) => {},
      // onDone — send response to Telegram
      async (reasoning, text) => {
        const response = text.trim();
        if (reasoning.trim()) {
          appendLog(THINKING_LOG, reasoning.trim());
          console.log(`[thinking] ${reasoning.trim().slice(0, 80)}...`);
        }
        if (response) {
          appendLog(RESPONSE_LOG, response);
          console.log(`[response] ${response.slice(0, 80)}...`);
          // Send response back to the chat that triggered it
          const chatId = update.message?.chat?.id;
          if (chatId) {
            tgSend(chatId, response);
            console.log(`[tg] Sent response to ${chatId}`);
          }
        }
        resolve();
      }
    );

    // Wait a moment for SSE connection, then POST message
    setTimeout(async () => {
      try {
        await api('POST', `/session/${SID}/message`, {
          parts: [{ type: 'text', text: prompt }],
          model: { providerID: 'opencode-go', modelID: 'deepseek-v4-flash' }
        });
        console.log(`[poll] Summoned for update ${update.update_id}`);
      } catch (e) {
        console.error('[poll] Summon failed:', e.message);
        resolve();
      }
    }, 500);
  });
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
