'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n').trim();
const script = read('deploy/install-classic-post-tools-20261111.sh');
const shell = script.slice(0, script.indexOf('cat > "$work/install.cjs"'));
const originalCss = read('design/classic-post-tools.css');
const ivoryCss = read('design/ivory-class.css');
const installer = shell
  .replace('/root/.classic-class-tools-XXXXXXXX', '/root/.ivory-class-XXXXXXXX')
  .replace('rmdir -- "$work"', 'rm -f -- "$work/classic-post-tools.cjs"; rmdir -- "$work"')
  + `cat > "$work/classic-post-tools.cjs" <<'CLASSIC_TOOLS_SOURCE'
const bundledToolsCss = ${JSON.stringify(originalCss)};
${read('deploy/classic-post-tools.cjs')}
CLASSIC_TOOLS_SOURCE
cat > "$work/install.cjs" <<'IVORY_CLASS_SOURCE'
const bundledIvoryCss = ${JSON.stringify(ivoryCss)};
${read('deploy/ivory-class.cjs')}
IVORY_CLASS_SOURCE
node "$work/install.cjs" "\${1:---check}"
`;
fs.writeFileSync(path.join(root, 'deploy/install-ivory-class-20261113.sh'), installer);
