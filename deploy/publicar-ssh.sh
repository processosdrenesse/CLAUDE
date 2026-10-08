#!/bin/bash
# Comando forçado das chaves de publicação (authorized_keys do usuário "deploy").
# Cada chave fixa o ambiente ($1); o GitHub Actions só informa o commit e manda os segredos pelo stdin.
# Instalado como /usr/local/sbin/drenesse-publicar-ssh (root:root 755) pelo setup-vps.sh.
set -euo pipefail
AMB="${1:-}"
SHA="${SSH_ORIGINAL_COMMAND:-}"
[[ "$AMB" =~ ^(homologacao|producao)$ ]] || { echo "ambiente inválido" >&2; exit 2; }
[[ "$SHA" =~ ^[0-9a-f]{7,40}$ ]] || { echo "commit inválido: informe só o hash do commit" >&2; exit 2; }
exec sudo -n /usr/local/sbin/drenesse-publicar "$AMB" "$SHA"
