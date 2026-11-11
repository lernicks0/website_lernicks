'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n').trim();
const source = read('deploy/classic-post-tools.cjs');
const css = read('design/classic-post-tools.css');
const script = `#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ "$(id -u)" == 0 ]] || { echo '请使用 sudo bash。' >&2; exit 1; }
if ! command -v node >/dev/null; then
  set +eu
  export NVM_DIR=/root/.nvm
  [ ! -s "$NVM_DIR/nvm.sh" ] || . "$NVM_DIR/nvm.sh"
  set -Eeuo pipefail
fi
exec 9>/root/.classic-class-tools.lock
flock -n 9
work=$(mktemp -d /root/.classic-class-tools-XXXXXXXX)
trap 'rm -f -- "$work/install.cjs"; rmdir -- "$work"' EXIT
cat > "$work/install.cjs" <<'CLASSIC_TOOLS_SOURCE'
const bundledToolsCss = ${JSON.stringify(css)};
${source}
CLASSIC_TOOLS_SOURCE
node "$work/install.cjs" "\${1:---check}"
`;
fs.writeFileSync(path.join(root, 'deploy/install-classic-post-tools-20261111.sh'), script);
