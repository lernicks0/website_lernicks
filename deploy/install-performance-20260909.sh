#!/usr/bin/env bash
set -Eeuo pipefail
COMMIT=${1:?请提供固定发布提交}
[[ "$COMMIT" =~ ^[a-f0-9]{40}$ ]] || exit 1
if ! command -v node >/dev/null; then
  if [ -s /root/.nvm/nvm.sh ]; then . /root/.nvm/nvm.sh; fi
fi
STAGE=$(mktemp -d /tmp/performance-update-XXXXXXXX)
curl -fL --retry 3 --connect-timeout 15 --max-time 180 "https://cdn.jsdelivr.net/gh/lernicks0/website_lernicks@$COMMIT/deploy/performance-20260909.tar.gz" -o "$STAGE/update.tar.gz"
echo "26af60ffff3d7395f16cb6ee2ed8737409449f4b793c942c96a4ce19ee88415c  $STAGE/update.tar.gz" | sha256sum -c -
tar -xzf "$STAGE/update.tar.gz" -C "$STAGE"
node "$STAGE/site-performance/update.cjs"
