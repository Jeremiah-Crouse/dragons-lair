#!/usr/bin/env node
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const port = process.env.PORT || 3456;
const PHONE = process.env.PHONE || '+19362300683';

function gvoiceSms(phoneNumber, text) {
  return new Promise((resolve, reject) => {
    const sid = process.env.GVOICE_SID;
    if (!sid) return reject(new Error('GVOICE_SID not set'));
    const ts = Math.floor(Date.now() / 1000);
    const hash = crypto.createHash('sha1').update(`${ts} ${sid}`).digest('hex');
    const data = JSON.stringify({ phoneNumber, text });
    const rn = String(Math.random()).slice(2, 12);
    // Try both endpoints — Google Voice API is finicky
    const tryEndpoint = (path) => new Promise((res, rej) => {
      const req = https.request({
        hostname: 'voice.google.com', path, method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data),
          'Authorization': `SAPISIDHASH ${ts}_${hash}`,
          'X-Goog-AuthUser': '0', 'X-Origin': 'https://voice.google.com',
          'Origin': 'https://voice.google.com', 'Referer': 'https://voice.google.com/',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Cookie': `__Secure-3PSID=${sid}; SAPISID=${sid.slice(0, 30)}; APISID=${sid.slice(0, 20)}; SID=${sid.slice(0, 50)}`
        }
      }, (r) => { let b=''; r.on('data', d=>b+=d); r.on('end', ()=>res({status:r.statusCode,body:b.slice(0,200)})); });
      req.on('error', rej);
      req.write(data);
      req.end();
    });
    tryEndpoint(`/sendSms?rn=${rn}&authuser=0`).then(resolve).catch(reject);
  });
}

let summoned = 0;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  if (req.url === '/api/summon') {
    summoned++;
    const msg = `Da She is requested at the Qwert.`;
    if (process.env.GVOICE_SID) {
      gvoiceSms(PHONE, msg).then(r => console.log('[GVoice]', r.status)).catch(e => console.error('[GVoice]', e.message));
    } else {
      try { require('child_process').execSync(`termux-sms-send -n "${PHONE}" "${msg}"`, { timeout: 5000 }); } catch (e) {}
    }
    res.end(JSON.stringify({ status: 'summoned', message: 'Da She!', count: summoned }));
  } else {
    res.end(JSON.stringify({ status: 'listening', message: 'The dragon remains unshaken.', summoned }));
  }
}).listen(port, () => console.log('Summon server on :' + port + ', SMS to ' + PHONE));

