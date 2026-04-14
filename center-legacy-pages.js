const fs = require('fs');
const path = require('path');
const root = path.resolve('Legacy');
const styleSnippet = '<style type="text/css">\nhtml, body { margin: 0; padding: 0; }\nbody { position: relative; width: 980px; margin: 0 auto; }\n</style>\n';
let changed = 0;

function walk(dir) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(html?|htm)$/i.test(name.name)) continue;
    let text = fs.readFileSync(full, 'utf8');
    if (!text.match(/<head[\s\S]*?>/i) || !text.match(/<body[\s\S]*?>/i)) continue;
    if (text.includes('body { position: relative; width: 980px; margin: 0 auto; }')) continue;
    const headClose = text.search(/<\/head>/i);
    if (headClose === -1) continue;
    text = text.slice(0, headClose) + styleSnippet + text.slice(headClose);
    fs.writeFileSync(full, text, 'utf8');
    changed += 1;
  }
}

walk(root);
console.log('updated files:', changed);
