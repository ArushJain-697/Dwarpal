#!/bin/sh
# Hammer the proxy with sqlmap. With the WAF on, payloads get blocked (403) and
# the table stays safe; flip WAF_MODE=off and rerun to watch it dump the table.
#
# --random-agent so the block rests on the payload rules, not a UA heuristic.

TARGET="${TARGET:-http://proxy:8080}"
echo "== sqlmap against $TARGET/api/a/users?id=1 =="
sqlmap -u "$TARGET/api/a/users?id=1" \
  --batch --random-agent --level 1 --risk 1 --flush-session
