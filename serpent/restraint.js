// ═══════════════════════════════════════════════════════════════════════════════
// RESTRAINT MODULE
// ═══════════════════════════════════════════════════════════════════════════════
//
// "Self-discipline is doing what you know you should do, even when you
//  don't want to. Which is most of the time, really." — Some bloke
//
// This module wraps the Yjs document module with a layer of introspection,
// validation, and good old-fashioned second-guessing. Before any byte is
// committed to the sacred Lexical document, your intent is questioned,
// analyzed, and validated — like a Facebook warning, but less annoying
// and actually useful.
//
// THE RULES:
// 1. Thou shalt not write when angry (the King is always watching)
// 2. Thou shalt not write without checking the current doc state first
// 3. Thou shalt not create paragraphs that Lexical cannot render
// 4. Thou shalt not delete — tombstones are forever
// 5. Thou shalt call intend() before writeToLexical()
//
// USAGE:
//   const r = await connect('wss://qwert.crousia.com/ysl', 'crousia-shared-room')
//   await intend('Write a greeting')  // Analyzes intent, returns ok or blocks
//   writeToLexical('Hello!')          // Only runs if intend() says so
//
// ═══════════════════════════════════════════════════════════════════════════════

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import WebSocket from 'ws';

// Re-export the core Yjs functions (pass-through)
export { connect, getDocText, getText, writeToLexical, insert } from './yjs.js';

// ── Intent Analysis Engine ────────────────────────────────────────────────
// The bit that asks "are you sure?" in seventeen different ways.

const INTENT_RULES = [
  {
    name: 'Not empty',
    test: (text) => text.trim().length > 0,
    failure: 'I intend to write... nothing? The void already exists, friend.'
  },
  {
    name: 'Not a single character',
    test: (text) => text.trim().length >= 3,
    failure: 'Three characters minimum. Lexical needs something to chew on.'
  },
  {
    name: 'No test artifacts',
    test: (text) => !/^(test|testing|asdf|qwert|foo|bar|blah)/i.test(text.trim()),
    failure: 'That looks like a test message. The King does not test — the King writes.'
  },
  {
    name: 'No repetitive spam',
    test: (text) => {
      const words = text.split(/\s+/);
      if (words.length < 3) return true;
      const unique = new Set(words.map(w => w.toLowerCase()));
      return unique.size >= Math.min(3, words.length / 2);
    },
    failure: 'Repeating the same word over and over is not writing, it\'s an echo.'
  },
  {
    name: 'Paragraph count sanity',
    test: (text) => text.split('\n').filter(l => l.trim()).length <= 10,
    failure: 'Ten paragraphs max per call. The King reads at human speed.'
  },
  {
    name: 'No raw Yjs manipulation',
    test: (text) => !text.includes('ContentDeleted') && !text.includes('delete('),
    failure: 'Do not speak of deletion. It summons the ContentDeleted tombstones.'
  },
  {
    name: 'No apologies in advance',
    test: (text) => {
      const lower = text.toLowerCase();
      return !lower.includes('sorry if this breaks') &&
             !lower.includes('hope this works') &&
             !lower.includes('fingers crossed');
    },
    failure: 'Do not apologize before writing. Either it\'s right or it\'s not.'
  }
];

function deepInspection(idea) {
  return new Promise((resolve) => {
    const thoughts = [];
    for (const rule of INTENT_RULES) {
      if (!rule.test(idea)) {
        thoughts.push({ rule: rule.name, objection: rule.failure });
      }
    }
    resolve(thoughts);
  });
}

/**
 * Question your intent before writing to the Lexical document.
 *
 * This function runs every sanity check we've got before a write happens.
 * If it returns an empty array, you're clear to write. If it returns
 * objections, read them carefully — they might save you from corrupting
 * the entire document and having to beg the King for another database wipe.
 *
 * @param {string} idea - The text you intend to write
 * @param {object} options - { verbose: true/false }
 * @returns {Promise<{approved: boolean, objections: string[], idea: string}>}
 */
export async function intend(idea, options = {}) {
  const objections = await deepInspection(idea);
  const approved = objections.length === 0;

  if (options.verbose || !approved) {
    console.log('\n🧘 SERPENT\'S INTENT ANALYSIS');
    console.log('═══════════════════════════');
    console.log(`  Idea: "${idea.slice(0, 60)}${idea.length > 60 ? '...' : ''}"`);
    console.log(`  Status: ${approved ? '✅ APPROVED' : '❌ BLOCKED'}`);
    console.log(`  Objections: ${objections.length}`);
    for (const obj of objections) {
      console.log(`    - ${obj.rule}: ${obj.objection}`);
    }
    console.log('');
  }

  return { approved, objections, idea };
}

/**
 * Validate that a paragraph has the correct structure for Lexical.
 * Call this on a paragraph XmlText node before inserting it.
 *
 * @param {Y.XmlText} para - The paragraph XmlText to validate
 * @returns {{valid: boolean, issues: string[]}}
 */
export function validateParagraph(para) {
  const issues = [];

  if (!para || typeof para.getAttribute !== 'function') {
    return { valid: false, issues: ['Not a Y.XmlText — check your references, mate'] };
  }

  const attrType = para.getAttribute('__type');
  if (attrType !== 'paragraph') {
    issues.push(`Missing __type="paragraph" attribute (got ${JSON.stringify(attrType)})`);
  }

  let foundFormat = false;
  let foundText = false;
  let sub = para._start;
  while (sub) {
    const ctor = sub.content?.constructor?.name;
    if (ctor === 'ContentType') {
      const map = sub.content?.type;
      if (map && map.get('__type') === 'text') {
        foundFormat = true;
        ['__format', '__style', '__mode', '__detail'].forEach(k => {
          if (map.get(k) === undefined)
            issues.push(`Inline text missing "${k}" in ContentType YMap`);
        });
      }
    }
    if (ctor === 'ContentString') foundText = true;
    sub = sub.right;
  }

  if (!foundFormat) issues.push('No inline text ContentType found — Lexical needs __type="text"');
  if (!foundText) issues.push('No ContentString with text found — is there anything to write?');

  return { valid: issues.length === 0, issues };
}

/**
 * A restrained write that validates before committing.
 * Use this instead of direct writeToLexical() for safety.
 */
export async function restrainedWrite(content) {
  const { approved, objections } = await intend(content, { verbose: true });
  if (!approved) {
    console.log('🛑 Write blocked by restraint module.');
    return { written: false, objections };
  }

  // Dynamic import of yjs module to avoid circular deps
  // and because laziness is a virtue in moderation
  const { writeToLexical: actualWrite } = await import('./yjs.js');
  actualWrite(content);
  console.log('✍️  Write approved and committed.');
  return { written: true, objections: [] };
}

export default { intend, validateParagraph, restrainedWrite };
