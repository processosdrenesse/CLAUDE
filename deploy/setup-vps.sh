#!/bin/bash
# Prepara o VPS para o painel Drenesse (rodar UMA vez, como root):
#   git clone https://github.com/processosdrenesse/CLAUDE.git /tmp/drenesse && sudo bash /tmp/drenesse/deploy/setup-vps.sh
# Cria: Node 24 (se faltar), usuários "drenesse" (serviço) e "deploy" (publicação pelo GitHub Actions),
# /opt/drenesse/{producao,homologacao}, serviços systemd, timers do quadro e as duas chaves de publicação.
# Pode ser rodado de novo (atualiza scripts e serviços sem apagar dados).
set -euo pipefail

REPO=https://github.com/processosdrenesse/CLAUDE.git
RAMO=claude/bold-feynman-5l91wk
BASE=/opt/drenesse
DADOS=/var/lib/drenesse
VPS_HOST="${VPS_HOST:-147.79.81.13}"
AQUI=$(cd "$(dirname "$0")" && pwd)

[ "$(id -u)" = 0 ] || { echo "Rode como root (sudo bash $0)"; exit 1; }
command -v apt-get >/dev/null || { echo "Este script usa apt (Debian/Ubuntu)."; exit 1; }
command -v systemctl >/dev/null || { echo "Este script precisa de systemd."; exit 1; }

echo "== 1/6 pacotes"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git curl ca-certificates openssh-client >/dev/null
NODE_MAJ=$( (node -v 2>/dev/null || echo v0) | sed -E 's/^v([0-9]+).*/\1/')
if [ "$NODE_MAJ" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs >/dev/null
fi
echo "   node $(node -v), npm $(npm -v)"

echo "== 2/6 usuários"
id drenesse >/dev/null 2>&1 || useradd --system --home-dir "$DADOS" --create-home --shell /usr/sbin/nologin drenesse
id deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash deploy
usermod -p '*' deploy   # sem senha (sem bloquear a conta, que impediria o login por chave)
install -d -o drenesse -g drenesse -m 750 "$DADOS"

echo "== 3/6 código (produção e homologação)"
install -d -o root -g root -m 755 "$BASE"
for AMB in producao homologacao; do
  if [ ! -d "$BASE/$AMB/.git" ]; then
    install -d -o drenesse -g drenesse -m 750 "$BASE/$AMB"
    runuser -u drenesse -- env HOME="$DADOS" git clone --quiet --branch "$RAMO" "$REPO" "$BASE/$AMB"
  fi
done

echo "== 4/6 scripts de publicação e permissão"
install -o root -g root -m 755 "$AQUI/publicar.sh" /usr/local/sbin/drenesse-publicar
install -o root -g root -m 755 "$AQUI/publicar-ssh.sh" /usr/local/sbin/drenesse-publicar-ssh
SUDO=$(mktemp)
echo 'deploy ALL=(root) NOPASSWD: /usr/local/sbin/drenesse-publicar' > "$SUDO"
visudo -cqf "$SUDO" && install -o root -g root -m 440 "$SUDO" /etc/sudoers.d/drenesse-deploy
rm -f "$SUDO"

echo "== 5/6 chaves de publicação (uma por ambiente)"
install -d -o deploy -g deploy -m 700 /home/deploy/.ssh
AUTH=$(mktemp)
for AMB in homologacao producao; do
  # a chave pública fica guardada; a privada é apagada depois de ir para o GitHub (rodar de novo não troca a chave)
  [ -f "/root/drenesse-chave-$AMB.pub" ] || ssh-keygen -q -t ed25519 -N "" -C "github-actions-$AMB" -f "/root/drenesse-chave-$AMB"
  PUB=$(cat "/root/drenesse-chave-$AMB.pub")
  echo "command=\"/usr/local/sbin/drenesse-publicar-ssh $AMB\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty $PUB" >> "$AUTH"
done
install -o deploy -g deploy -m 600 "$AUTH" /home/deploy/.ssh/authorized_keys
rm -f "$AUTH"

echo "== 6/6 serviços"
install -o root -g root -m 644 "$AQUI/drenesse-painel@.service" "$AQUI/drenesse-quadro@.service" \
  "$AQUI/drenesse-quadro-producao.timer" "$AQUI/drenesse-quadro-homologacao.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --quiet drenesse-painel@producao drenesse-painel@homologacao
systemctl enable --now --quiet drenesse-quadro-producao.timer drenesse-quadro-homologacao.timer

PORTA_SSH=$(sshd -T 2>/dev/null | awk '/^port /{print $2; exit}'); PORTA_SSH=${PORTA_SSH:-22}
KNOWN=$(ssh-keyscan -p "$PORTA_SSH" 127.0.0.1 2>/dev/null | sed "s/127\.0\.0\.1/$VPS_HOST/")

cat <<FIM

================================================================================
VPS pronto. Faltam 3 passos:

1) Caddy: acrescente ao Caddyfile (ex.: /etc/caddy/Caddyfile) e rode "systemctl reload caddy":
$(sed '/^#/d' "$AQUI/Caddyfile.exemplo")

2) GitHub (repositório processosdrenesse/CLAUDE → Settings → Secrets and variables → Actions):
   Repository secrets:
     VPS_HOST         = $VPS_HOST
     VPS_PORT         = $PORTA_SSH
     VPS_USER         = deploy
     VPS_KNOWN_HOSTS  = (as linhas abaixo)
$KNOWN
   Environment "homologacao" → secret VPS_SSH_KEY = conteúdo de: cat /root/drenesse-chave-homologacao
   Environment "producao"    → secret VPS_SSH_KEY = conteúdo de: cat /root/drenesse-chave-producao
                               e em "Required reviewers" o usuário do GitHub de quem aprova produção.
   Depois de colar as duas chaves no GitHub, apague as cópias daqui:
     shred -u /root/drenesse-chave-homologacao /root/drenesse-chave-producao

3) Se houver firewall: liberar 80 e 443 (Caddy) e a porta SSH $PORTA_SSH para o usuário deploy
   (se o sshd usar AllowUsers/AllowGroups, incluir "deploy").
   As portas 8787/8788 ficam só em 127.0.0.1 (não precisam ser abertas).
================================================================================
FIM
