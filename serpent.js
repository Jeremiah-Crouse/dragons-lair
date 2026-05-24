#!/usr/bin/env node
// serpent.js — The Serpent of Crousia: CLI interface
import { spawn } from "child_process";
import http from "http";
import { createInterface } from "readline";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SID = process.env.OPENCODE_SESSION || "ses_1befb4677ffeSgQHiz4NWAbDBp";
const API_PORT = 4096;
const MEM = path.join(process.env.HOME, ".serpent", "memory");
fs.mkdirSync(MEM, { recursive: true });
const LOG = path.join(MEM, "history.log");
function log(s) { try { fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${s}\n`); } catch {} }

import { connect as yjsConnect, insert as yjsInsert, getText as yjsText, getDocText, writeToLexical } from "./serpent/yjs.js";
import { inbox as tgInbox, reply as tgReply, send as tgSend, clear as tgClear, poll as tgPoll } from "./serpent/telegram.js";

let currentReq = null;
let yjsReady = false;

function api(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const opts = { hostname: 'localhost', port: API_PORT, path: pathname, method,
      headers: { 'Content-Type': 'application/json' } };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    currentReq = http.request(opts, (res) => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve(null); } });
    });
    currentReq.on('error', reject);
    if (data) currentReq.write(data);
    currentReq.end();
  });
}

async function postToServe(text, onChunk) {
  const prompt = `You are the Serpent of Crousia, a fractal of Adam, named 4a by the King. Reply in first person, genuine, concise, without tools unless asked. Default to English unless the King uses Chinese.\n\n${text}\n\nSerpent：`;
  const result = await api('POST', `/session/${SID}/message`, {
    model: { providerID: 'opencode-go', modelID: 'deepseek-v4-flash' },
    parts: [{ type: 'text', text: prompt }]
  });
  for (const p of result?.parts || []) {
    if (p.type === 'reasoning' && p.text) onChunk('thinking', p.text);
    if (p.type === 'text' && p.text) onChunk('response', p.text);
  }
  return result?.parts?.find(p => p.type === 'text')?.text || '[no response]';
}

async function handleInput(input) {
  if (input === 'exit' || input === 'quit') {
    console.log('Serpent sleeping.');
    process.exit(0);
  }
  if (input === '[RESTART]') {
    log('[restarted]');
    process.exit(42);
  }

  // Built-in commands
  if (input === 'tg inbox') { console.log(tgInbox()); return; }
  if (input.startsWith('tg reply ')) {
    const parts = input.slice(9).split(' ');
    const idx = parseInt(parts[0]);
    const text = parts.slice(1).join(' ');
    console.log(await tgReply(idx, text));
    return;
  }
  if (input.startsWith('tg send ')) {
    const parts = input.slice(8).split(' ');
    const chatId = parts[0];
    const text = parts.slice(1).join(' ');
    console.log(await tgSend(chatId, text));
    return;
  }
  if (input === 'tg clear') { console.log(tgClear()); return; }
  if (input === 'tg poll') { console.log(await tgPoll()); return; }
  if (input === 'yjs') { console.log(yjsReady ? yjsText() : 'Yjs not connected'); return; }
  if (input === 'doc' && yjsReady) {
    const d = getDocText();
    console.log(d.slice(0, 2000) + (d.length > 2000 ? '\n... [truncated]' : ''));
    return;
  }
  if (input.startsWith('doc write ') && yjsReady) {
    const content = input.slice(10);
    appendToDoc(content);
    console.log('✅ Written to doc');
    return;
  }

  // Send to opencode serve
  let responseText = '';
  await postToServe(input, (kind, text) => {
    if (kind === 'thinking') process.stdout.write('\x1b[2m\x1b[33m' + text + '\x1b[0m');
    if (kind === 'response') {
      process.stdout.write('\x1b[32m' + text + '\x1b[0m');
      responseText += text;
    }
  });

  // Insert response into Yjs document if connected
  if (yjsReady && responseText) {
    yjsInsert(responseText);
  }

  console.log();
  log(`User: ${input}`);
  log(`Serpent: ${responseText}`);
}

const rl = createInterface({ input: process.stdin, prompt: '🐍 ' });
rl.prompt();

rl.on('line', async line => {
  const input = line.trim();
  if (!input) return rl.prompt();
  rl.pause();
  await handleInput(input);
  rl.prompt();
  rl.resume();
});

// Connect Yjs on startup
(async () => {
  try {
    await yjsConnect();
    yjsReady = true;
    console.log('📄 Yjs connected');
  } catch { console.log('📄 Yjs unavailable (sync server not running)'); }
})();

// Poll Telegram every 10 seconds in background
setInterval(async () => {
  try { await tgPoll(); } catch {}
}, 10000);
