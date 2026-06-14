#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="ahits-499421"

# Parse .env and create secrets
while IFS= read -r line; do
  # Skip blank lines and comments
  [[ -z "$line" || "$line" =~ ^# ]] && continue

  key="${line%%=*}"
  value="${line#*=}"
  # Strip surrounding quotes
  value="${value%\"}"
  value="${value#\"}"

  secret_name="AHITS_${key}"

  echo "Creating secret: $secret_name"

  # Create the secret (ignore error if it already exists)
  gcloud secrets create "$secret_name" \
    --project="$PROJECT_ID" \
    --replication-policy="automatic" 2>/dev/null || true

  # Add the secret version
  printf '%s' "$value" | gcloud secrets versions add "$secret_name" \
    --project="$PROJECT_ID" \
    --data-file=-

done < .env

echo "Done."