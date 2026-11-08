'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const assets = [
  { id: 'note-crypto', file: 'note-crypto.js', before: '0a2e594be39a1e947a9fcb90b89791889c9ac377914d7490bce5b992d8b04a71' },
  { id: 'note-security-client', file: 'security-client.js', before: '4dd35ddb47331fafae387a19c1001e799ed637432c86d7759c34f826bb414392' },
];
const normalize = code => code.trim().replace(/\r\n/g, '\n');
const digest = code => crypto.createHash('sha256').update(normalize(code)).digest('hex');

function patch(html, directory) {
  for (const { id, file, before } of assets) {
    const script = new RegExp(`(<script id="${id}">)([\\s\\S]*?)(<\\/script>)`, 'g');
    const matches = [...html.matchAll(script)];
    assert.equal(matches.length, 1, `Expected one script block for ${id}`);
    const [current, open, code, close] = matches[0];
    const replacement = normalize(fs.readFileSync(path.join(directory, file), 'utf8'));
    new vm.Script(replacement, { filename: file });
    if (normalize(code) === replacement) continue;
    assert.equal(digest(code), before, `Unrecognized deployed version of ${id}`);
    html = html.replace(current, () => `${open}\n${replacement}\n${close}`);
  }
  return html;
}

module.exports = { patch };
if (require.main === module) {
  const [live, output, directory] = process.argv.slice(2);
  assert.equal(fs.realpathSync(live), path.resolve(live));
  fs.writeFileSync(output, patch(fs.readFileSync(live, 'utf8'), directory));
}
