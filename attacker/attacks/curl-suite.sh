#!/bin/sh
# One crafted request per attack class, then a benign lookalike that must pass.
# The benign 200 is the "real WAF, not a brick wall" proof.

TARGET="${TARGET:-http://proxy:8080}"
echo "== curl-suite against $TARGET =="

probe() {
  code=$(curl -s -G -o /dev/null -w '%{http_code}' "$2" --data-urlencode "$3")
  printf "  %-11s %s -> %s\n" "$1" "$3" "$code"
}

probe "sqli"      "$TARGET/api/a/users"  "id=1' OR '1'='1"
probe "xss"       "$TARGET/api/a/search" "q=<script>alert(1)</script>"
probe "traversal" "$TARGET/api/a/file"   "path=../../../../etc/passwd"
probe "cmdi"      "$TARGET/api/a/ping"   "host=127.0.0.1;id"
probe "ssrf"      "$TARGET/api/a/fetch"  "url=http://169.254.169.254/latest/meta-data/"
echo "  --- benign (must stay 200) ---"
probe "benign"    "$TARGET/api/a/search" "q=I love the union of jazz"
