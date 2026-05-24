// sanitize-doc.mjs  — run once with: node sanitize-doc.mjs
import * as Y from 'yjs';
import { LeveldbPersistence } from 'y-leveldb';

const ldb = new LeveldbPersistence('./crousia-db'); // adjust path if needed

function sanitizeNodes(node) {
  if (!node) return node;
  if (node.type === 'authored-text') {
    node.type = 'text';
    delete node.author;
  }
  if (Array.isArray(node.children)) {
    node.children = node.children.map(sanitizeNodes);
  }
  return node;
}

const ydoc = await ldb.getYDoc('crousia-shared-room');

console.log('Yjs shared keys:');
for (const [key, val] of ydoc.share.entries()) {
  console.log(' ', key, '-', val.constructor.name);
}

await ldb.destroy();