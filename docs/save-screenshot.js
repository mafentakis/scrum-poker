// Usage: node docs/save-screenshot.js <source-tool-result.txt> <output.png>
const fs = require('fs');
const [,, src, out] = process.argv;
const raw = fs.readFileSync(src, 'utf8');
const arr = JSON.parse(raw);
const text = JSON.parse(arr[0].text);
const b64 = text.replace(/^data:image\/png;base64,/, '');
fs.writeFileSync(out, Buffer.from(b64, 'base64'));
const hdr = fs.readFileSync(out).slice(0, 4).toString('hex');
console.log(`${out} — ${fs.statSync(out).size} bytes — header: ${hdr}`);
