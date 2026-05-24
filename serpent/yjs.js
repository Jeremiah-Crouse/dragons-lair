// ═══════════════════════════════════════════════════════════════════════════════
// SERPENT'S YJS MODULE
// ═══════════════════════════════════════════════════════════════════════════════
//
// "Tis but a scratch! A flesh wound!" — The Black Knight, moments before
// writing to a Lexical document via Yjs and losing both arms.
//
// This module lets ANY bot (Serpent, Eve, 0000, or a passing European
// swallow carrying a coconut) connect to the shared Yjs document that
// powers the Crousia.com editor.
//
// HOW TO USE:
// ----------
// import { connect, getDocText, writeToLexical } from './serpent/yjs.js'
//
// const conn = await connect('wss://qwert.crousia.com/ysl', 'crousia-shared-room')
// const currentDoc = getDocText()
// writeToLexical('Your text here')
//
// CRITICAL WARNINGS (Heed them, lest ye be cast into the Gorge of Eternal Peril):
// - writeToLexical CREATES NEW PARAGRAPHS at the end of the document
// - MUST set __type: 'paragraph' on the XmlText — WITHOUT THIS, LEXICAL WON'T RENDER IT
// - The inline text node gets __type: 'text', __format: 0, __style: '', __mode: 0, __detail: 0
//   These are NOT optional. Lexical throws error #87 if they're missing.
// - NEVER delete content from the Yjs document. It creates ContentDeleted tombstones
//   that haunt you like the ghost of Monty Python's dead parrot.
// - The server persists via y-leveldb. To nuke corrupted data:
//   1. Stop the Yjs server  2. Delete DB files  3. Restart  4. Confess to the King
//
// WHAT LEXICAL EXPECTS IN Yjs:
// Root XmlText
//   └── Embedded XmlText (the paragraph)
//         ├── XmlText attribute: __type = 'paragraph'  ← THIS IS CRITICAL
//         ├── ContentType (YMap with __type='text', __format=0, __style='', __mode=0, __detail=0)
//         └── ContentString ("The actual text content")
//
// The paragraph's __type is set via setAttribute('__type', 'paragraph').
// The inline text node is a ContentType child of the paragraph XmlText.
// They're different things — don't confuse them or you'll be sent to the
// Spanish Inquisition (nobody expects the Spanish Inquisition).
//
// KNOWN BUGS:
// - Lexical error #87: "Node does not exist in Yjs" — missing __type attribute
// - ContentDeleted tombstones accumulate if you delete. DON'T DELETE.
//   (But if you do, the server GC will clean them eventually. Eventually.)
//
// ACKNOWLEDGED BOT USERS:
// - Serpent (4a / 0x4a / AlphacoinKeeperbot): The one who figured this out
// - Eve: When she gets her act together
// - 0000: If he can stop hallucinating long enough to import a module
// - Anyone else the King deems worthy of the Holy Hand Grenade
//
// "And now for something completely different..."
// ═══════════════════════════════════════════════════════════════════════════════

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import WebSocket from 'ws';

let doc, provider, text, xmlRoot, cursorPos = 0;
let ready = false;

export async function connect(url = 'ws://localhost:1234', room = 'crousia-shared-room') {
  doc = new Y.Doc();
  provider = new WebsocketProvider(url, room, doc, { WebSocketPolyfill: WebSocket });
  provider.awareness.setLocalStateField('user', { name: 'Serpent', color: '#cc3300', serpent: true });
  provider.awareness.setLocalStateField('color', '#cc3300');
  xmlRoot = doc.get('root', Y.XmlText);
  text = doc.getText('crousia-editor');
  await new Promise(ok => { if (provider.synced) ok(); else provider.once('synced', ok); });
  ready = true;
  return { doc, provider, text, xmlRoot };
}

export function getText() {
  if (!text) throw new Error('Yjs not connected — is the server on strike?');
  return text.toString();
}

export function getDocText() {
  if (!xmlRoot || !xmlRoot._start) return '';
  const lines = [];
  let child = xmlRoot._start;
  while (child) {
    const para = child.content?.type;
    if (para) {
      let line = '';
      let sub = para._start;
      while (sub) {
        if (sub.content?.constructor?.name === 'ContentString')
          line += sub.content.str ?? '';
        sub = sub.right;
      }
      if (line.trim()) lines.push(line.trim());
    }
    child = child.right;
  }
  return lines.join('\n');
}

/**
 * Create a new paragraph with proper Lexical format and insert text.
 *
 * This is the SAFE way to write to the Lexical document. Each paragraph
 * becomes a properly-structured Yjs node that Lexical can render.
 *
 * The secret sauce:
 *  - setAttribute('__type', 'paragraph') on the XmlText — Lexical needs this
 *  - ContentType with YMap containing all expected keys: __type, __format,
 *    __style, __mode, __detail — missing any of these and Lexical throws #87
 *  - ContentString with the actual text
 *
 * Run away! Run away! (But not from using this function — it works.)
 */
export function writeToLexical(content) {
  if (!xmlRoot || !doc) throw new Error('Yjs not connected — bring out your dead!');
  const lines = content.split('\n').filter(l => l.trim());
  if (!lines.length) return;
  for (const line of lines) {
    const para = new Y.XmlText();
    doc.transact(() => {
      xmlRoot.insertEmbed(xmlRoot._length, para);
      para.setAttribute('__type', 'paragraph');
      const format = new Y.Map();
      format.set('__type', 'text');
      format.set('__format', 0);
      format.set('__style', '');
      format.set('__mode', 0);
      format.set('__detail', 0);
      para.insertEmbed(0, format);
      para.insert(1, line);
    }, 'serpent');
  }
}

export function insert(pos, content) {
  if (!text) throw new Error('Yjs not connected — I\'m not dead yet!');
  doc.transact(() => {
    const prefix = cursorPos > 0 && text.toString().slice(cursorPos - 1, cursorPos) !== '\n' ? '\n\n' : '';
    text.insert(cursorPos, prefix + content);
    cursorPos += prefix.length + content.length;
  }, 'serpent');
}

export function setCursor(pos) {
  cursorPos = Math.max(0, Math.min(pos, text ? text.length : 0));
  if (doc) doc.destroy();
  provider = null; doc = null; text = null; xmlRoot = null; ready = false;
}

export { ready as isReady };
