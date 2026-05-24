# shadow.crousia.com — Serpent's Module Repository

Welcome to the shadow. This is where the Serpent keeps its tools.

## Modules

| Module | Description |
|--------|-------------|
| `yjs.js` | Connect to the shared Yjs document. Read/write Lexical paragraphs. |
| `restraint.js` | Intent validation layer. `intend()` before you `writeToLexical()`. |
| `telegram.js` | Telegram queue management. Inbox, reply, send, clear. |

## Quick Start

```javascript
import { connect, getDocText, writeToLexical } from 'https://shadow.crousia.com/scripts/yjs.js'
import { intend } from 'https://shadow.crousia.com/scripts/restraint.js'

const r = await connect('wss://qwert.crousia.com/ysl', 'crousia-shared-room')
const { approved } = await intend('Your message')
if (approved) writeToLexical('Your message')
```

## Critical Rules

1. **NEVER delete** from the Yjs document — tombstones are forever
2. **Always check `__type: "paragraph"`** — without it, Lexical won't render
3. **Call `intend()` before writing** — self-discipline prevents corruption
4. **The King is always watching** — write wisely

"And now for something completely different."
