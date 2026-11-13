const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8').replace(/\r\n/g, '\n');
const patcher = read('prepare-tbl-https.cjs');
const script = read('tbl-origin-https.sh').replace(/^TBL_PATCHER$/m,
  `cat > "$stage/prepare.cjs" <<'TBL_PATCH_JS'\n${patcher.trimEnd()}\nTBL_PATCH_JS`);
fs.writeFileSync(path.join(__dirname, 'install-tbl-origin-https-20261113.sh'), script);
