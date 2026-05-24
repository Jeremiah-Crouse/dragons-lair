// scripts/convert-archives.js
// Run with: node scripts/convert-archives.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVES_DIR = path.join(__dirname, '..', 'archives');

const GOLD_COLOR = '#FFD700';

function parseInlineFormatting(text) {
  const tokens = [];
  let remaining = text;
  
  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      tokens.push({ text: boldMatch[1], format: 'bold' });
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }
    
    const italicMatch = remaining.match(/^\*(?!\*)([^*]+)\*/);
    if (italicMatch) {
      tokens.push({ text: italicMatch[1], format: 'italic' });
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }
    
    const strikeMatch = remaining.match(/^~~([^~]+)~~/);
    if (strikeMatch) {
      tokens.push({ text: strikeMatch[1], format: 'strikethrough' });
      remaining = remaining.slice(strikeMatch[0].length);
      continue;
    }
    
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      tokens.push({ text: codeMatch[1], format: 'code' });
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }
    
    const nextSpecial = remaining.search(/(\*\*|\*|~~|`)/);
    if (nextSpecial === -1) {
      if (remaining) tokens.push({ text: remaining, format: '' });
      break;
    } else if (nextSpecial === 0) {
      tokens.push({ text: remaining[0], format: '' });
      remaining = remaining.slice(1);
    } else {
      tokens.push({ text: remaining.slice(0, nextSpecial), format: '' });
      remaining = remaining.slice(nextSpecial);
    }
  }
  
  return tokens;
}

function createTextNode(text, format = '') {
  return {
    children: [],
    type: 'text',
    text,
    style: `color: ${GOLD_COLOR};`,
    format: format || 'normal',
    version: 1
  };
}

function createParagraphWithInlines(text) {
  const tokens = parseInlineFormatting(text);
  
  if (tokens.length === 0) {
    return { children: [createTextNode('')], type: 'paragraph', version: 1 };
  }
  
  if (tokens.length === 1 && !tokens[0].format) {
    return { children: [createTextNode(tokens[0].text)], type: 'paragraph', version: 1 };
  }
  
  return {
    children: tokens.map(t => createTextNode(t.text, t.format)),
    type: 'paragraph',
    version: 1
  };
}

function parseMarkdownToLexical(markdown) {
  const lines = markdown.split('\n');
  const rootChildren = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (trimmed === '') {
      i++;
      continue;
    }
    
    // Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const tag = `h${level}`;
      
      rootChildren.push({
        children: [createTextNode(text)],
        type: 'heading',
        tag,
        version: 1
      });
      i++;
      continue;
    }
    
    // Unordered list
    if (trimmed.match(/^[-*+]\s+/)) {
      const listItems = [];
      while (i < lines.length) {
        const li = lines[i].trim();
        const liMatch = li.match(/^[-*+]\s+(.+)$/);
        if (!liMatch) break;
        listItems.push({
          children: [createTextNode(liMatch[1])],
          type: 'listitem',
          version: 1
        });
        i++;
      }
      rootChildren.push({
        children: listItems,
        type: 'list',
        listType: 'bullet',
        start: 1,
        version: 1
      });
      continue;
    }
    
    // Ordered list
    if (trimmed.match(/^\d+\.\s+/)) {
      const listItems = [];
      while (i < lines.length) {
        const li = lines[i].trim();
        const liMatch = li.match(/^\d+\.\s+(.+)$/);
        if (!liMatch) break;
        listItems.push({
          children: [createTextNode(liMatch[1])],
          type: 'listitem',
          version: 1
        });
        i++;
      }
      rootChildren.push({
        children: listItems,
        type: 'list',
        listType: 'number',
        start: 1,
        version: 1
      });
      continue;
    }
    
    // Code block
    if (trimmed.startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      rootChildren.push({
        children: [createTextNode(codeLines.join('\n'))],
        type: 'code',
        language: '',
        version: 1
      });
      i++;
      continue;
    }
    
    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s*/, ''));
        i++;
      }
      rootChildren.push({
        children: [{
          children: quoteLines.map(t => createTextNode(t)),
          type: 'paragraph',
          version: 1
        }],
        type: 'quote',
        version: 1
      });
      continue;
    }
    
    // Regular paragraph
    rootChildren.push(createParagraphWithInlines(trimmed));
    i++;
  }
  
  return {
    root: {
      children: rootChildren,
      type: 'root',
      version: 1
    }
  };
}

if (!fs.existsSync(ARCHIVES_DIR)) {
  console.log('No archives directory found');
  process.exit(0);
}

const files = fs.readdirSync(ARCHIVES_DIR).filter(f => f.endsWith('.md'));

if (files.length === 0) {
  console.log('No .md files to convert');
  process.exit(0);
}

console.log(`Found ${files.length} .md files to convert`);

for (const file of files) {
  const date = file.replace('.md', '');
  const mdContent = fs.readFileSync(path.join(ARCHIVES_DIR, file), 'utf-8');
  
  try {
    const json = parseMarkdownToLexical(mdContent);
    const jsonPath = path.join(ARCHIVES_DIR, `${date}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(json));
    console.log(`Converted ${date}.md -> ${date}.json`);
  } catch (e) {
    console.error(`Failed to convert ${file}:`, e.message);
  }
}

console.log('Done!');
