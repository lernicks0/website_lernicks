#!/usr/bin/env bash
# Read-only check. Never changes DNS, certificates, firewall rules or Nginx.
set -euo pipefail
domain=tbl.lernicks.cn
origin=124.223.201.40
echo 'Current public HTTPS route:'
curl -fsSI --connect-timeout 8 --max-time 20 "https://$domain/" | head -20
echo 'Direct origin HTTP (bypass local proxy):'
curl --noproxy '*' -fsS --connect-timeout 8 --max-time 20 --resolve "$domain:80:$origin" \
 -o /dev/null -w 'HTTP=%{http_code} TTFB=%{time_starttransfer}s TOTAL=%{time_total}s\n' "http://$domain/"
echo 'Direct origin HTTPS (normal certificate validation; no -k):'
if ! curl --noproxy '*' -fsS --connect-timeout 8 --max-time 20 --resolve "$domain:443:$origin" \
 -o /dev/null -w 'HTTP=%{http_code} TTFB=%{time_starttransfer}s TOTAL=%{time_total}s\n' "https://$domain/"; then
 echo 'NOT_READY: do not disable the existing proxy. Configure trusted HTTPS and verify external port 443 first.' >&2
 exit 1
fi
echo 'HTTPS_REACHABLE: also verify /api/status, image links, certificate renewal and domain routing before any DNS change.'
