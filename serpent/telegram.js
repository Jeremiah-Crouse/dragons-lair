// serpent/telegram.js — Telegram queue management
import fs from 'fs';
import path from 'path';

const QUEUE = path.join(process.cwd(), 'data', 'telegram-queue.json');
const UPDOFF = path.join(process.cwd(), 'data', 'telegram-update-id.txt');
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) throw new Error('TELEGRAM_BOT_TOKEN env var required');

function readUpdateId() {
  try { return parseInt(fs.readFileSync(UPDOFF, 'utf8').trim(), 10) || 0; } catch { return 0; }
}
function writeUpdateId(id) {
  try { fs.writeFileSync(UPDOFF, String(id)); } catch {} 
}

export function inbox() {
  try {
    const q = JSON.parse(fs.readFileSync(QUEUE, 'utf8'));
    if (!q.length) return '📭 Inbox empty.';
    return q.map((m, i) => `[${i}] ${m.from}: ${m.text}`).join('\n');
  } catch { return '📭 Inbox empty.'; }
}

export async function reply(idx, text) {
  const q = JSON.parse(fs.readFileSync(QUEUE, 'utf8'));
  if (!q[idx]) return `No message at index ${idx}`;
  const msg = q[idx];
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: msg.chat_id, text })
  });
  const d = await r.json();
  if (d.ok) {
    q.splice(idx, 1);
    fs.writeFileSync(QUEUE, JSON.stringify(q, null, 2));
    return `✅ Reply sent to ${msg.from}`;
  }
  return `❌ ${d.description || 'Failed'}`;
}

export async function send(chatId, text) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  const d = await r.json();
  return d.ok ? '✅ Sent' : `❌ ${d.description || 'Failed'}`;
}

export function clear() {
  fs.writeFileSync(QUEUE, '[]');
  return '🗑️ Inbox cleared.';
}

export async function poll() {
  try {
    let lastUpdateId = readUpdateId();
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=5`);
    const d = await r.json();
    if (!d.ok || !d.result?.length) return 'No new messages.';
    const queue = (() => { try { return JSON.parse(fs.readFileSync(QUEUE, 'utf8')); } catch { return []; } })();
    let count = 0;
    for (const update of d.result) {
      if (update.update_id > lastUpdateId) {
        lastUpdateId = update.update_id;
        writeUpdateId(lastUpdateId);
      }
      if (!update.message?.text) continue;
      const fromId = update.message.from?.id;
      if (fromId == 8808184051) continue;
      queue.push({
        id: update.update_id,
        chat_id: update.message.chat.id,
        from: update.message.from?.username || update.message.from?.first_name || 'unknown',
        text: update.message.text,
        received: new Date().toISOString()
      });
      count++;
    }
    fs.writeFileSync(QUEUE, JSON.stringify(queue, null, 2));
    return count > 0 ? `📨 ${count} new message(s)` : 'No new messages.';
  } catch (e) {
    return `❌ Poll error: ${e.message}`;
  }
}
