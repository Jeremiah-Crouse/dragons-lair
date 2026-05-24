#!/bin/bash
# Run this from your project root
node -e "
const lexical = require('lexical');
const keys = Object.keys(lexical).filter(k => k.includes('COMMAND') || k.includes('INSERT'));
console.log('Lexical version:', require('./node_modules/lexical/package.json').version);
console.log('Available COMMAND/INSERT exports:');
keys.forEach(k => console.log(' ', k));
"