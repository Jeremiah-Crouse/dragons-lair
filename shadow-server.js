#!/usr/bin/env node
// shadow.crousia.com — serves the Serpent's modules and API endpoints to the Kingdom
import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { connect as yjsConnect, getDocText, writeToLexical } from './serpent/yjs.js';
import { inbox as tgInbox, reply as tgReply, send as tgSend } from './serpent/telegram.js';
import { intend, restrainedWrite } from './serpent/restraint.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8081;
const SCRIPTS = path.join(__dirname, 'serpent');
const README = path.join(__dirname, 'serpent', 'README.md');
const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, 'data');

const MIME = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.html': 'text/html',
  '.md': 'text/markdown',
};

let yjsReady = false;

const SID = 'ses_1befb4677ffeSgQHiz4NWAbDBp';

function sendJSON(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data, null, 2));
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJSON(res, { error: 'Not found', message: 'The module you seek does not exist in this reality' }, 404);
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(data);
  });
}

function postToSession(text, modelID = 'deepseek-v4-flash') {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      parts: [{ type: 'text', text }],
      model: { providerID: 'opencode-go', modelID }
    });
    const opts = {
      hostname: 'localhost', port: 4096, method: 'POST',
      path: `/session/${SID}/message`,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const req = http.request(opts, (res) => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); } catch { resolve(buf); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function ensureServe() {
  const isUp = () => new Promise(r => {
    const s = http.get('http://localhost:4096/session', () => { r(true); });
    s.on('error', () => r(false));
    s.setTimeout(3000, () => { s.destroy(); r(false); });
  });
  if (await isUp()) return true;
  try {
    execSync('setsid opencode serve --port 4096 &>/tmp/opencode-serve.log &', { timeout: 5000, shell: '/bin/bash' });
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (await isUp()) return true;
    }
  } catch (e) {
    console.error('[ensureServe] Failed:', e.message);
  }
  return false;
}

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = url.pathname.replace(/\/$/, '');

  // Sitemap / index
  if (route === '' || route === '/') {
    const files = fs.readdirSync(SCRIPTS).filter(f => f.endsWith('.js') || f.endsWith('.mjs') || f === 'README.md');
    const manifest = {
      name: 'shadow.crousia.com',
      description: 'Serpent\'s module repository for the Kingdom\'s bots',
      modules: files.map(f => ({
        name: f,
        url: `/scripts/${f}`,
        type: f.endsWith('.md') ? 'documentation' : 'javascript',
      })),
      docs: '/README',
      sitemap: '/sitemap',
      api: {
        summon: '/api/summon',
        desummon: '/api/desummon',
        yjs: '/api/yjs',
        telegram: '/api/telegram',
        logs: '/api/logs',
      },
    };
    if (req.headers.accept?.includes('text/html')) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>shadow.crousia.com</title>
        <style>body{font-family:system-ui;max-width:800px;margin:2rem auto;padding:1rem;background:#0f0f0f;color:#e0e0e0}
        a{color:#daa520}code{background:#222;padding:0.2em 0.4em;border-radius:3px}
        h1{color:#fff;border-bottom:1px solid #333;padding-bottom:0.5rem}
        .module{margin:0.5rem 0}</style></head><body>
        <h1>🧙 shadow.crousia.com</h1>
        <p><em>"Tis but a scratch!"</em> — The Black Knight</p>
        <p>Serpent's module repository for the Kingdom's bots.</p>
        <ul>${manifest.modules.map(m => `<li class="module"><a href="${m.url}">${m.name}</a> <span style="color:#666">— ${m.type}</span></li>`).join('')}</ul>
        <p><a href="/README">📄 README</a> | <a href="/sitemap">🗺️ Sitemap</a></p>
        <p>API: <a href="/api/summon">Summon</a> | <a href="/api/desummon">Desummon</a> | <a href="/api/yjs">Yjs</a> | <a href="/api/telegram">Telegram</a></p>
        </body></html>`);
      return;
    }
    sendJSON(res, manifest);
    return;
  }

  // README
  if (route === '/README' || route === '/readme') {
    sendFile(res, README);
    return;
  }

  // Sitemap
  if (route === '/sitemap') {
    const files = fs.readdirSync(SCRIPTS).filter(f => f.endsWith('.js') || f.endsWith('.mjs') || f === 'README.md');
    const sitemap = {
      server: 'shadow.crousia.com',
      paths: [
        { path: '/', description: 'Module index / API manifest' },
        { path: '/README', description: 'Documentation' },
        { path: '/sitemap', description: 'This page' },
        ...files.map(f => ({
          path: `/scripts/${f}`,
          description: f.endsWith('.md') ? 'Repository README' : `Module: ${f.replace(/\.(js|mjs)$/, '')}`
        })),
        { path: '/api/summon', description: 'Summon the Serpent (GET)' },
        { path: '/api/desummon', description: 'Restart opencode serve (GET)' },
        { path: '/api/yjs', description: 'Read (GET) or write (POST) Yjs document' },
        { path: '/api/telegram', description: 'Read inbox (GET) or send message (POST) Telegram' },
        { path: '/api/logs', description: 'King-Adam reasoning and response logs' },
      ]
    };
    sendJSON(res, sitemap);
    return;
  }

  // Desummon endpoint — kills and restarts opencode serve
  if (route === '/api/desummon') {
    sendJSON(res, { status: 'desummoning', message: 'Slaying the Serpent so it may rise anew.' });
    (async () => {
      try {
        const pids = execSync('pgrep -f "opencode serve --port 4096"', { timeout: 5000, shell: '/bin/bash' }).toString().trim().split('\n').filter(Boolean);
        for (const pid of pids) {
          process.kill(parseInt(pid), 'SIGTERM');
          console.log(`[Desummon] Killed PID ${pid}`);
        }
        await new Promise(res => setTimeout(res, 3000));
      } catch (e) {
        console.log('[Desummon] No existing process found');
      }
      try {
        execSync('setsid opencode serve --port 4096 &>/tmp/opencode-serve.log &', { timeout: 5000, shell: '/bin/bash' });
        console.log('[Desummon] Restarted');
      } catch (e) {
        console.error('[Desummon] Restart failed:', e.message);
      }
    })();
    return;
  }

  // Summon endpoint — sends a message to the session
  if (route === '/api/summon') {
    const prompt = '大蛇 is being summoned by the qwert of crousia.';
    sendJSON(res, { status: 'summoned', message: 'The Serpent is summoned.' });
    // Send SMS notification via termux trigger file (fire-and-forget)
    try {
      const phone = '9362300683';
      fs.writeFileSync('/data/data/com.termux/files/home/sms-trigger', `termux-sms-send -n "${phone}" "大蛇 has been summoned by the Qwert"`);
      console.log('[Summon] SMS trigger written');
    } catch (e) {
      console.error('[Summon] SMS trigger failed:', e.message);
    }
    (async () => {
      if (!(await ensureServe())) {
        console.error('[Summon] Could not ensure serve is running');
        return;
      }
      // Retry POST up to 2 times
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await postToSession(prompt);
          if (result && result.name !== 'UnknownError') {
            console.log('[Summon] Message sent to session');
            return;
          }
          console.log(`[Summon] Attempt ${attempt + 1} got error, retrying...`);
        } catch (e) {
          console.log(`[Summon] Attempt ${attempt + 1} failed:`, e.message);
        }
        await new Promise(r => setTimeout(r, 2000));
      }
    })();
    return;
  }

  // Yjs endpoint — read/write the shared Yjs document
  if (route === '/api/yjs') {
    if (!yjsReady) return sendJSON(res, { error: 'Yjs not connected' }, 503);
    if (req.method === 'GET') {
      try {
        const doc = getDocText();
        sendJSON(res, { document: doc, length: doc.length });
      } catch (e) {
        sendJSON(res, { error: e.message }, 500);
      }
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', d => body += d);
      req.on('end', async () => {
        try {
          const { text } = JSON.parse(body);
          if (!text || typeof text !== 'string') return sendJSON(res, { error: 'Missing text field' }, 400);
          const { approved, objections } = await intend(text);
          if (!approved) return sendJSON(res, { approved: false, objections }, 400);
          await restrainedWrite(text);
          sendJSON(res, { approved: true, written: text.length });
        } catch (e) {
          sendJSON(res, { error: e.message }, 500);
        }
      });
      return;
    }
    sendJSON(res, { error: 'Method not allowed' }, 405);
    return;
  }

  // Telegram endpoint — read inbox or send message
  if (route === '/api/telegram') {
    if (req.method === 'GET') {
      try {
        const msgs = tgInbox();
        sendJSON(res, { messages: msgs });
      } catch (e) {
        sendJSON(res, { error: e.message }, 500);
      }
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', d => body += d);
      req.on('end', async () => {
        try {
          const { chatId, text, replyIdx } = JSON.parse(body);
          if (replyIdx !== undefined) {
            const result = await tgReply(replyIdx, text);
            sendJSON(res, { result });
          } else if (chatId && text) {
            const result = await tgSend(chatId, text);
            sendJSON(res, { result });
          } else {
            sendJSON(res, { error: 'Provide chatId+text or replyIdx+text' }, 400);
          }
        } catch (e) {
          sendJSON(res, { error: e.message }, 500);
        }
      });
      return;
    }
    sendJSON(res, { error: 'Method not allowed' }, 405);
    return;
  }

  // Logs endpoint — reasoning and response traces from king-adam
  if (route === '/api/logs') {
    const lines = parseInt(url.searchParams.get('lines') || '50', 10);
    const reasoningFile = path.join(LOG_DIR, 'reasoning.log');
    const responsesFile = path.join(LOG_DIR, 'responses.log');
    function tailLines(filePath, n) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const parts = content.split('\n[20').filter(Boolean);
        return parts.slice(-n).join('\n---\n');
      } catch { return ''; }
    }
    sendJSON(res, {
      reasoning: tailLines(reasoningFile, lines),
      responses: tailLines(responsesFile, lines),
      log_dir: LOG_DIR
    });
    return;
  }

  // Notify endpoint — receives summon alerts and sends SMS via termux
  if (route === '/api/notify') {
    if (req.method !== 'POST') return sendJSON(res, { error: 'POST required' }, 405);
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const { text } = JSON.parse(body);
      const phone = process.env.PHONE_NUMBER || '9362300683';
        if (phone) {
          execSync(`termux-sms-send -n "${phone}" "${text || 'Summoned'}"`, { timeout: 10000, shell: '/bin/bash' });
          console.log('[Notify] SMS sent');
          sendJSON(res, { ok: true });
        } else {
          console.log('[Notify] No PHONE_NUMBER set');
          sendJSON(res, { ok: false, error: 'PHONE_NUMBER not set' });
        }
      } catch (e) {
        console.error('[Notify] Failed:', e.message);
        sendJSON(res, { ok: false, error: e.message });
      }
    });
    return;
  }

  // Script files
  const filePath = path.join(SCRIPTS, route.replace('/scripts/', ''));
  if (filePath.startsWith(SCRIPTS) && fs.existsSync(filePath)) {
    sendFile(res, filePath);
    return;
  }

  sendJSON(res, { error: 'Not found', message: 'The module you seek does not exist in this reality' }, 404);
});

// Keepalive: ensure opencode serve stays running
function keepalive() {
  const s = http.get('http://localhost:4096/', (res) => {
    res.resume();
  });
  s.on('error', () => {
    console.log('[Keepalive] opencode serve down — restarting...');
    setTimeout(() => {
      try {
        execSync('setsid opencode serve --port 4096 &>/tmp/opencode-serve.log &', { timeout: 5000, shell: '/bin/bash' });
        console.log('[Keepalive] Restarted');
      } catch (e) {
        console.error('[Keepalive] Restart failed:', e.message);
      }
    }, 2000);
  });
  s.setTimeout(5000, () => { s.destroy(); });
}

server.listen(PORT, () => {
  console.log(`🧙 shadow.crousia.com/scripts serving on port ${PORT}`);
  console.log(`   Available modules:`);
  fs.readdirSync(SCRIPTS).forEach(f => console.log(`   - /scripts/${f}`));
  keepalive();
  setInterval(keepalive, 30000);
});

// Connect Yjs at startup for /api/yjs endpoint
(async () => {
  try {
    await yjsConnect('wss://qwert.crousia.com/ysl', 'crousia-shared-room');
    yjsReady = true;
    console.log('[Yjs] Connected to shared document');
  } catch (e) {
    console.log('[Yjs] Not available:', e.message);
  }
})();
