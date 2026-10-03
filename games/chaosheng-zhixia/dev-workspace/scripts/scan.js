const fs = require('fs');
const html = fs.readFileSync('潮声之下_深渊潜航3D_v22.html', 'utf8');
const lines = html.split('\n');
let starts = [];
for (let i = 0; i < lines.length; i++) if (lines[i] === '<script>') starts.push(i + 1);
const sLine = starts[starts.length - 1];
let depth = 0, state = 'code';
for (let i = sLine; i <= lines.length; i++) {
  const line = lines[i - 1] || '';
  for (let j = 0; j < line.length; j++) {
    const ch = line[j], nx = line[j + 1];
    if (state === 'code') {
      if (ch === '/' && nx === '/') break;
      if (ch === '/' && nx === '*') { state = 'block'; j++; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { state = 'str'; globalThis.q = ch; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth < 0) { console.log('FIRST NEGATIVE at line', i, ':', line.slice(0, 110)); process.exit(0); } }
    } else if (state === 'str') {
      if (ch === '\\') { j++; continue; }
      if (ch === globalThis.q) state = 'code';
    } else if (state === 'block') {
      if (ch === '*' && nx === '/') { state = 'code'; j++; continue; }
    }
  }
  if (state === 'block') state = 'code';
}
console.log('final depth', depth);
