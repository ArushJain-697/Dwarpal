#!/bin/sh
# Load test: show the proxy still serving thousands of rps with low overhead,
# even while under attack. Runs container-to-container to avoid the host VM
# network boundary polluting the numbers.

TARGET="${TARGET:-http://proxy:8080}"
echo "== autocannon against $TARGET/api/a/x?id=42 =="
autocannon -c 50 -d 20 "$TARGET/api/a/x?id=42"
