#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
SB_TEST_BOOTSTRAP=$(sed '/^for tool in node /,$d' deploy/install-sb-20261001.sh)
SB_TEST_ROOT="$(pwd)/deploy"
SB_TEST_STAGE=$(mktemp -d ./deploy/sb-bootstrap-test-XXXXXXXX)
SB_TEST_STAGE=$(cd "$SB_TEST_STAGE" && pwd)
[[ "$SB_TEST_STAGE" = "$SB_TEST_ROOT"/sb-bootstrap-test-* ]] || exit 1
trap 'rm -rf -- "$SB_TEST_STAGE"' EXIT
mkdir -p "$SB_TEST_STAGE/nvm" "$SB_TEST_STAGE/ready" "$SB_TEST_STAGE/node-only" "$SB_TEST_STAGE/empty"
for tool in node pm2; do printf '#!/bin/sh\nexit 0\n' > "$SB_TEST_STAGE/ready/$tool"; chmod +x "$SB_TEST_STAGE/ready/$tool"; done
cp "$SB_TEST_STAGE/ready/node" "$SB_TEST_STAGE/node-only/node"
cat > "$SB_TEST_STAGE/nvm/nvm.sh" <<'NVM'
# Model an nvm source that reads an unset variable under nounset.
: "$SB_TEST_UNSET"
echo sourced >> "$SB_TEST_LOG"
nvm() {
  echo "$*" >> "$SB_TEST_LOG"
  if [[ "${SB_TEST_DEFAULT_MISSING:-0}" = 1 && "$3" = default ]]; then return 1; fi
  PATH="$SB_TEST_STAGE/ready:$PATH"
  export PATH
}
NVM
for SB_TEST_CASE in missing-tools missing-pm2 ready fallback; do
  (
    export NVM_DIR="$SB_TEST_STAGE/nvm"
    export SB_TEST_LOG="$SB_TEST_STAGE/$SB_TEST_CASE.log"
    unset SB_TEST_UNSET
    case "$SB_TEST_CASE" in
      missing-tools) PATH="$SB_TEST_STAGE/empty" ;;
      missing-pm2) PATH="$SB_TEST_STAGE/node-only" ;;
      ready) PATH="$SB_TEST_STAGE/ready" ;;
      fallback) PATH="$SB_TEST_STAGE/empty"; SB_TEST_DEFAULT_MISSING=1 ;;
    esac
    set -- 75ed753117832fbfbad658258eb2b9a9558951d7
    eval "$SB_TEST_BOOTSTRAP"
    command -v node >/dev/null
    command -v pm2 >/dev/null
    [[ "$-" = *u* ]]
    if [[ "$SB_TEST_CASE" = ready ]]; then test ! -e "$SB_TEST_LOG"; else test -s "$SB_TEST_LOG"; fi
  )
done
grep -q 'use --silent node' "$SB_TEST_STAGE/fallback.log"
echo 'SB bootstrap passed: missing Node, missing PM2, existing environment, default-alias fallback, strict-mode restoration.'
