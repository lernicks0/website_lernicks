'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.existsSync(path.join(root, 'note-site')) ? 'note-site' : 'note-security-source';
const template = fs.readFileSync(path.join(__dirname, 'install-note-default-e2ee-20261106.sh'), 'utf8').replace(/\r\n/g, '\n');
const assets = [
  ['patch.cjs', 'deploy/patch-note-spoken.cjs'],
  ['note-crypto.js', `${source}/note-crypto.js`],
  ['security-client.js', `${source}/security-client.js`],
];
const payload = assets.map(([name, file]) => {
  const bytes = fs.readFileSync(path.join(root, file));
  return `base64 -d > "$stage/${name}" <<'NOTE_SPOKEN_ASSET'\n${bytes.toString('base64')}\nNOTE_SPOKEN_ASSET`;
}).join('\n');
const script = template
  .replace(/base64 -d > "\$stage\/patch\.cjs" <<'NOTE_DEFAULT_ASSET'\n[\s\S]*?\nNOTE_DEFAULT_ASSET/, () => payload)
  .replace('node "$stage/patch.cjs" "$live" "$stage/index.html"', 'node "$stage/patch.cjs" "$live" "$stage/index.html" "$stage"')
  .replaceAll('note-default-e2ee', 'note-spoken')
  .replace('NOTE_DEFAULT_E2EE_UPDATE_SUCCESS', 'NOTE_SPOKEN_UPDATE_SUCCESS')
  .replace('新便签默认端到端加密；已有便签与数据保持原状，未重启进程。', '便签口述口令页面已上线。');
if (!script.includes('NOTE_SPOKEN_ASSET') || script.includes('NOTE_DEFAULT_ASSET')) throw Error('Unknown installer template');
fs.writeFileSync(path.join(__dirname, 'install-note-spoken-20261108.sh'), script);
