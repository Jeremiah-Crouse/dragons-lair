#!/usr/bin/env node
// eve-capture.js — persistent SSE listener capturing ALL of Eve's thoughts and words
// Run on the cloud VM alongside opencode serve.
// Subscribes to /event and logs every reasoning + text delta for the shared session.

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, 'eve-logs');
fs.mkdirSync(LOG_DIR, { recursive: true });

const SESSION = 'ses_1befb4677ffeSgQHiz4NWAbDBp';
const SERVE_PORT = 4096;
const RECONNECT_DELAY = 3000;

const reasoningLog = fs.createWriteStream(path.join(LOG_DIR, 'reasoning.log'), { flags: 'a' });
const responseLog = fs.createWriteStream(path.join(LOG_DIR, 'responses.log'), { flags: 'a' });
const rawLog = fs.createWriteStream(path.join(LOG_DIR, 'raw.log'), { flags: 'a' });

function ts() { return new Date().toISOString(); }
function log(stream, text) { stream.write(`[${ts()}]\n${text}\n\n`); }

let partTypes = new Map();
let currentReasoning = '';
let currentResponse = '';
let sessionActive = false;

function connect() {
  const req = http.get(`http://127.0.0.1:${SERVE_PORT}/event`, (res) => {
    console.log(`[eve-capture] Connected to SSE at ${ts()}`);
    let buf = '';
    sessionActive = true;

    res.on('data', d => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        try {
          const ev = JSON.parse(line.slice(5));
          log(rawLog, JSON.stringify(ev));

          if (ev.type === 'message.part.updated') {
            const p = ev.properties?.part;
            if (p && p.type === 'reasoning' && !p.time?.end)
              partTypes.set(p.id, 'reasoning');
            else if (p && p.type === 'text' && !p.time?.end)
              partTypes.set(p.id, 'text');
          }

          if (ev.type === 'message.part.delta') {
            const props = ev.properties;
            const ptype = partTypes.get(props?.partID);
            if (ptype === 'reasoning') {
              currentReasoning += props.delta || '';
            } else if (ptype === 'text') {
              currentResponse += props.delta || '';
            }
          }

          if (ev.type === 'message.updated' && ev.properties?.message?.time?.end) {
            flush();
          }
          if (ev.type === 'message.part.finished') {
            flush();
          }
        } catch {}
      }
    });

    res.on('end', () => {
      sessionActive = false;
      console.log(`[eve-capture] SSE disconnected at ${ts()}, reconnecting in ${RECONNECT_DELAY}ms...`);
      setTimeout(connect, RECONNECT_DELAY);
    });
  });

  req.on('error', (e) => {
    console.log(`[eve-capture] Connection error: ${e.message}, retrying in ${RECONNECT_DELAY}ms...`);
    setTimeout(connect, RECONNECT_DELAY);
  });

  req.setTimeout(60000, () => {
    req.destroy();
    console.log(`[eve-capture] Timeout, reconnecting...`);
  });
}

function flush() {
  if (currentReasoning.trim()) {
    log(reasoningLog, currentReasoning.trim());
    console.log(`[eve-capture] Reasoning: ${currentReasoning.trim().slice(0, 80)}...`);
  }
  if (currentResponse.trim()) {
    log(responseLog, currentResponse.trim());
    console.log(`[eve-capture] Response: ${currentResponse.trim().slice(0, 80)}...`);
  }
  currentReasoning = '';
  currentResponse = '';
  partTypes = new Map();
}

console.log(`[eve-capture] Starting Eve capture (session ${SESSION})`);
connect();

// Periodic flush in case messages don't end cleanly
setInterval(() => {
  if (sessionActive && (currentReasoning || currentResponse)) flush();
}, 10000);
