#!/bin/bash
# Roda no GitHub Actions: manda os segredos (stdin) e pede ao VPS para publicar o commit.
# O ambiente (homologação/produção) é decidido pela CHAVE usada (VPS_SSH_KEY do Environment do GitHub),
# não por este script: a chave de produção só existe no Environment "producao", que exige aprovação.
#   uso: bash deploy/publicar-via-ssh.sh <commit>
set -euo pipefail
COMMIT="${1:?informe o commit}"
for v in VPS_HOST VPS_USER VPS_KNOWN_HOSTS VPS_SSH_KEY BELLE_API_TOKEN LEVER_API_TOKEN DASHBOARD_PASSWORD; do
  [ -n "${!v:-}" ] || { echo "::error::Segredo $v não cadastrado no GitHub"; exit 1; }
done
D=$(mktemp -d); trap 'rm -rf "$D"' EXIT
printf '%s\n' "$VPS_SSH_KEY" > "$D/chave"; chmod 600 "$D/chave"
printf '%s\n' "$VPS_KNOWN_HOSTS" > "$D/known_hosts"
printf 'BELLE_API_TOKEN=%s\nLEVER_API_TOKEN=%s\nBELLE_BI_TOKEN=%s\nDASHBOARD_PASSWORD=%s\n' \
  "$BELLE_API_TOKEN" "$LEVER_API_TOKEN" "${BELLE_BI_TOKEN:-}" "$DASHBOARD_PASSWORD" |
  ssh -i "$D/chave" -p "${VPS_PORT:-22}" -o UserKnownHostsFile="$D/known_hosts" -o StrictHostKeyChecking=yes \
      -o BatchMode=yes -o ServerAliveInterval=30 "$VPS_USER@$VPS_HOST" "$COMMIT"
