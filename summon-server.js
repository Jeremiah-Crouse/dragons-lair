#!/usr/bin/env node
const http = require('http');
const port = process.env.PORT || 3456;
let summoned = 0;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  if (req.url === '/api/summon') {
    summoned++;
    res.end(JSON.stringify({ status: 'summoned', count: summoned }));
  } else {
    res.end(JSON.stringify({ status: 'listening', summoned }));
  }
}).listen(port, () => console.log('Summon server on :' + port));
