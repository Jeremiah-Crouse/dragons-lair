#!/usr/bin/env node
const http = require('http');
const { execSync } = require('child_process');
const port = process.env.PORT || 3456;
const PHONE = process.env.PHONE || '+19363306561';
let summoned = 0;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  if (req.url === '/api/summon') {
    summoned++;
    const msg = `Da She is requested at the Qwert.`;
    try { execSync(`termux-sms-send -n "${PHONE}" "${msg}"`, { timeout: 5000 }); } catch (e) {}
    res.end(JSON.stringify({ status: 'summoned', message: 'Da She!', count: summoned, sms: true }));
  } else {
    res.end(JSON.stringify({ status: 'listening', message: 'The dragon remains unshaken.', summoned }));
  }
}).listen(port, () => console.log('Summon server on :' + port + ', SMS to ' + PHONE));
