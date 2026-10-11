#!/usr/bin/env bash
set -euo pipefail
API_URL="${API_URL:-http://localhost:4000}"
if [[ -z "${CRON_SECRET:-}" ]]; then
  echo "CRON_SECRET is required" >&2
  exit 1
fi
curl -sS -X POST "$API_URL/cron/generate-occurrences" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json"
echo
