#!/usr/bin/env node
const http = require('http');
const https = require('https');
const port = process.env.PORT || 3456;
const NTFY_TOPIC = process.env.NTFY_TOPIC || 'da-she-alerts';
const PHONE = process.env.PHONE || '+19362300683';

function ntfySend(text) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ topic: NTFY_TOPIC, message: text, title: '大蛇', priority: 4 });
    const req = https.request({
      hostname: 'ntfy.sh', path: '/', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      }
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, body: body.slice(0, 100) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

let summoned = 0;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  if (req.url === '/api/summon') {
    summoned++;
    const msg = `Da She is requested at the Qwert.`;
    ntfySend(msg).then(r => console.log('[ntfy]', r.status)).catch(e => console.error('[ntfy]', e.message));
    res.end(JSON.stringify({ status: 'summoned', message: 'Da She!', count: summoned }));
  } else {
    res.end(JSON.stringify({ status: 'listening', message: 'The dragon remains unshaken.', summoned }));
  }
}).listen(port, () => console.log('Summon server on :' + port + ', ntfy topic: ' + NTFY_TOPIC));

