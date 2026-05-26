#!/usr/bin/env node
// gvoice.js — Minimal Google Voice SMS sender using SAPISID auth
// Usage: GVOICE_COOKIE='__Secure-3PSID=...' node gvoice.js "+19362300683" "message text"

// The SAPISID hash is computed from the __Secure-3PSID cookie value
// You can get this cookie from a logged-in browser session at voice.google.com

const https = require('https');
const http = require('http');

function sapisidHash(sapisid, timestamp) {
  const crypto = require('crypto');
  const input = `${timestamp} ${sapisid}`;
  return crypto.createHash('sha1').update(input).digest('hex');
}

function sendSms(phoneNumber, text, cookieValue) {
  return new Promise((resolve, reject) => {
    const ts = Math.floor(Date.now() / 1000);
    const hash = sapisidHash(cookieValue, ts);
    const sapisidHash = `${ts}_${hash}`;

    const data = JSON.stringify({ phoneNumber, text });
    const params = new URLSearchParams({ rn: String(Math.random()).slice(2, 12), authuser: '0' }).toString();

    const opts = {
      hostname: 'www.google.com',
      path: `/voice/sendSms?${params}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': `SAPISIDHASH ${sapisidHash}`,
        'X-Goog-AuthUser': '0',
        'X-Origin': 'https://voice.google.com',
        'Origin': 'https://voice.google.com',
        'Referer': 'https://voice.google.com/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Cookie': cookieValue
      }
    };

    const req = https.request(opts, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode === 200 && body.trim().startsWith('{')) {
          try { resolve(JSON.parse(body)); } catch { resolve({ ok: true, raw: body }); }
        } else {
          reject(new Error(`${res.statusCode}: ${body.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

const phone = process.argv[2];
const text = process.argv[3];
const cookie = process.env.GVOICE_COOKIE;

if (!phone || !text) {
  console.log('Usage: GVOICE_COOKIE="__Secure-3PSID=..." node gvoice.js "+19362300683" "message"');
  process.exit(1);
}
if (!cookie) {
  console.log('Error: GVOICE_COOKIE env var required');
  console.log('Get it from a logged-in browser at voice.google.com (Application > Cookies > __Secure-3PSID)');
  process.exit(1);
}

sendSms(phone, text, cookie)
  .then(r => console.log('Sent:', JSON.stringify(r)))
  .catch(e => console.error('Failed:', e.message));
