#!/bin/bash
# Publica um commit num ambiente do painel.
#   uso (root): drenesse-publicar <homologacao|producao> <commit>
# Os segredos chegam pelo stdin, uma linha CHAVE=valor cada (vindos do GitHub Actions). Sem stdin, mantém os do .env atual.
# Instalado como /usr/local/sbin/drenesse-publicar (root:root 755) pelo setup-vps.sh.
set -euo pipefail
umask 077

AMB="${1:-}"; SHA="${2:-}"
case "$AMB" in
  producao) PORTA=8787 ;;
  homologacao) PORTA=8788 ;;
  *) echo "ambiente inválido (use homologacao ou producao)" >&2; exit 2 ;;
esac
[[ "$SHA" =~ ^[0-9a-f]{7,40}$ ]] || { echo "commit inválido" >&2; exit 2; }

DIR=/opt/drenesse/$AMB
DADOS=/var/lib/drenesse
[ -d "$DIR/.git" ] || { echo "$DIR não existe; rode o deploy/setup-vps.sh" >&2; exit 1; }
exec 9>"/run/lock/drenesse-publicar-$AMB.lock"
flock -w 900 9 || { echo "outra publicação de $AMB em andamento" >&2; exit 1; }

# comandos fixos executados como o usuário do serviço (AMB e SHA já validados acima)
como() { runuser -u drenesse -- env HOME="$DADOS" APP_AMBIENTE="$AMB" bash -c "cd '$DIR' && $1"; }

echo "== $AMB: publicando $SHA"

# 1) segredos: só as chaves conhecidas
SEG=$(mktemp); NOVO=$(mktemp); trap 'rm -f "$SEG" "$NOVO"' EXIT
if [ ! -t 0 ]; then
  while IFS= read -r linha || [ -n "$linha" ]; do
    chave="${linha%%=*}"; valor="${linha#*=}"
    case "$chave" in BELLE_API_TOKEN|LEVER_API_TOKEN|BELLE_BI_TOKEN|DASHBOARD_PASSWORD) ;; *) continue ;; esac
    [ -n "$valor" ] || continue
    if [[ "$valor" == *"'"* && "$valor" == *'"'* ]]; then echo "$chave tem aspas simples e duplas; troque o valor" >&2; exit 2; fi
    if [[ "$valor" == *"'"* ]]; then printf '%s="%s"\n' "$chave" "$valor"; else printf "%s='%s'\n" "$chave" "$valor"; fi >> "$SEG"
  done
fi
if [ ! -s "$SEG" ] && [ -f "$DIR/.env" ]; then
  grep -E '^(BELLE_API_TOKEN|LEVER_API_TOKEN|BELLE_BI_TOKEN|DASHBOARD_PASSWORD)=' "$DIR/.env" > "$SEG" || true
  echo "   (sem segredos no stdin: mantidos os do .env atual)"
fi

# 2) código no commit pedido
como "git fetch --prune --quiet origin '+refs/heads/*:refs/remotes/origin/*'"
como "git checkout --force --detach --quiet '$SHA'"
COMMIT=$(como "git rev-parse HEAD")
echo "   commit: $COMMIT"

# 3) dependências e build (tsx e o build precisam das devDependencies)
como "npm ci --include=dev --no-audit --no-fund --loglevel=error"
como "npm run build --silent"

# 4) .env do ambiente
{
  cat "$SEG"
  echo "PORT=$PORTA"
  echo "HOST=127.0.0.1"
  echo "APP_AMBIENTE=$AMB"
  echo "APP_VERSION=$COMMIT"
} > "$NOVO"
install -o drenesse -g drenesse -m 600 "$NOVO" "$DIR/.env"

# 5) reinicia e confere
systemctl enable --quiet "drenesse-painel@$AMB"
systemctl restart "drenesse-painel@$AMB"
for i in $(seq 1 30); do
  curl -fsS -o /dev/null "http://127.0.0.1:$PORTA/api/health" 2>/dev/null && break
  [ "$i" = 30 ] && { echo "o painel não respondeu em 127.0.0.1:$PORTA" >&2; journalctl -u "drenesse-painel@$AMB" -n 40 --no-pager >&2; exit 1; }
  sleep 1
done
echo "   painel no ar em 127.0.0.1:$PORTA"

# 6) primeira vez: carga inicial do quadro Avaliação × Cabine (~10 min, em segundo plano)
if [ ! -f "$DIR/.cache/avaliacao-cabine/resultado.json" ]; then
  systemctl start --no-block "drenesse-quadro@$AMB.service"
  echo "   carga inicial do quadro iniciada (acompanhe: journalctl -fu drenesse-quadro@$AMB)"
fi
echo "== $AMB publicado: ${COMMIT:0:7}"
