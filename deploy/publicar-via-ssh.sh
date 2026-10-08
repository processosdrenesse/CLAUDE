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
# Diagnóstico da chave sem mostrar o conteúdo (erros comuns ao colar no GitHub).
CHAVE=$(printf '%s\n' "$VPS_SSH_KEY" | tr -d '\r')
case "$CHAVE" in
  ssh-ed25519*|ssh-rsa*|ecdsa-*)
    echo "::error::VPS_SSH_KEY contém a chave PÚBLICA (.pub). Cadastre a PRIVADA: no VPS, cat /root/drenesse-chave-<ambiente> (sem .pub), que começa com -----BEGIN OPENSSH PRIVATE KEY-----"; exit 1 ;;
esac
if ! grep -q -- '-----BEGIN OPENSSH PRIVATE KEY-----' <<<"$CHAVE" || ! grep -q -- '-----END OPENSSH PRIVATE KEY-----' <<<"$CHAVE"; then
  echo "::error::VPS_SSH_KEY incompleta: precisa ter a linha -----BEGIN OPENSSH PRIVATE KEY----- no início e -----END OPENSSH PRIVATE KEY----- no fim"; exit 1
fi
if [ "$(grep -c . <<<"$CHAVE")" -lt 3 ]; then
  echo "::error::VPS_SSH_KEY foi colada em uma linha só; cole de novo mantendo as quebras de linha (várias linhas)"; exit 1
fi
printf '%s\n' "$CHAVE" > "$D/chave"; chmod 600 "$D/chave"
if ! ssh-keygen -y -f "$D/chave" >/dev/null 2>&1; then
  echo "::error::VPS_SSH_KEY não abre (chave corrompida ou com senha). Copie de novo o arquivo inteiro: cat /root/drenesse-chave-<ambiente>"; exit 1
fi
echo "Chave OK: $(ssh-keygen -y -f "$D/chave" | awk '{print $1}') — a chave pública dela termina em ...$(ssh-keygen -y -f "$D/chave" | awk '{print substr($2, length($2)-11)}')"
printf '%s\n' "$VPS_KNOWN_HOSTS" | tr -d '\r' > "$D/known_hosts"
printf 'BELLE_API_TOKEN=%s\nLEVER_API_TOKEN=%s\nBELLE_BI_TOKEN=%s\nDASHBOARD_PASSWORD=%s\n' \
  "$BELLE_API_TOKEN" "$LEVER_API_TOKEN" "${BELLE_BI_TOKEN:-}" "$DASHBOARD_PASSWORD" |
  ssh -i "$D/chave" -p "${VPS_PORT:-22}" -o UserKnownHostsFile="$D/known_hosts" -o StrictHostKeyChecking=yes \
      -o BatchMode=yes -o ServerAliveInterval=30 "$VPS_USER@$VPS_HOST" "$COMMIT"
