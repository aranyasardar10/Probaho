import { KEYWORDS } from './keywords.js';
import { ProbahoError } from './errors.js';

const isDigit = (ch) => ch !== undefined && /\p{Nd}/u.test(ch);
const isStart = (ch) => ch !== undefined && /[\p{L}\p{M}_]/u.test(ch);
// ZWNJ and ZWJ appear inside some Bangla words.
const isPart = (ch) => ch !== undefined && /[\p{L}\p{M}\p{N}_\u200C\u200D]/u.test(ch);
const toAscii = (s) => s.replace(/[\u09E6-\u09EF]/g, (c) => String(c.charCodeAt(0) - 0x09e6));
const TWO_CHAR = new Set(['==', '!=', '<=', '>=']);
const ONE_CHAR = new Set(['+', '-', '*', '/', '%', '<', '>', '=', '(', ')', '{', '}', '[', ']', ',', '.']);
const ESCAPES = { n: '\n', t: '\t', '"': '"', '\\': '\\' };

export function tokenize(source) {
  const tokens = [];
  let i = 0, line = 1, col = 1;
  const advance = () => {
    const ch = source[i++];
    if (ch === '\n') { line++; col = 1; } else col++;
    return ch;
  };
  const push = (type, value, l, c) => {
    if (type === 'NEWLINE' && (tokens.length === 0 || tokens[tokens.length - 1].type === 'NEWLINE')) return;
    tokens.push({ type, value, line: l, col: c });
  };

  while (i < source.length) {
    const ch = source[i], l = line, c = col;
    if (ch === ' ' || ch === '\t' || ch === '\r') { advance(); continue; }
    if (ch === '#') { while (i < source.length && source[i] !== '\n') advance(); continue; }
    if (ch === '\n' || ch === ';') { advance(); push('NEWLINE', '\n', l, c); continue; }

    if (isDigit(ch)) {
      let text = '';
      while (isDigit(source[i])) text += advance();
      // A dot followed by digits belongs to a decimal; otherwise it is member access.
      if (source[i] === '.' && isDigit(source[i + 1])) {
        text += advance();
        while (isDigit(source[i])) text += advance();
      }
      push('NUMBER', Number(toAscii(text)), l, c);
      continue;
    }

    if (isStart(ch)) {
      let text = '';
      while (isPart(source[i])) text += advance();
      push(Object.hasOwn(KEYWORDS, text) ? KEYWORDS[text] : 'IDENT', text, l, c);
      continue;
    }

    if (ch === '"') {
      advance();
      let text = '';
      while (true) {
        if (i >= source.length || source[i] === '\n') {
          throw new ProbahoError('স্ট্রিং শেষ হয়নি, বন্ধ করার " দিন', 'unterminated string, add a closing "', l, c);
        }
        const s = advance();
        if (s === '"') break;
        if (s === '\\') {
          const e = advance();
          text += Object.hasOwn(ESCAPES, e) ? ESCAPES[e] : e;
        } else text += s;
      }
      push('STRING', text, l, c);
      continue;
    }

    const two = source.slice(i, i + 2);
    if (TWO_CHAR.has(two)) { advance(); advance(); push(two, two, l, c); continue; }
    if (ONE_CHAR.has(ch)) { advance(); push(ch, ch, l, c); continue; }
    throw new ProbahoError(`অচেনা অক্ষর '${ch}'`, `unexpected character '${ch}'`, l, c);
  }
  push('NEWLINE', '\n', line, col);
  tokens.push({ type: 'EOF', value: null, line, col });
  return tokens;
}
