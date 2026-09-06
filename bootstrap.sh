#!/usr/bin/env bash
# bootstrap — Alvaro's setup on a new machine.
#
#   bash bootstrap.sh <target>
#
# targets:
#   client    laptop/PC: ssh access to the VPS only (key + Host vps alias)
#   termux    full phone setup: ssh + pi + memory vault + tunnel
#   server    new VPS/Raspberry Pi: the brain (pi, tmux, extensions, scripts)
#
# Secrets are never in this repo: pi config (API keys) is pulled over SSH
# from the current VPS. Run from any machine that can already `ssh vps`.
set -euo pipefail

TARGET="${1:?usage: bash bootstrap.sh client|termux|server [vps-ip]}"
VPS="${2:-104.248.195.240}"
DOT="$(cd "$(dirname "$0")" && pwd)"
is_termux() { [ -n "${TERMUX_VERSION:-}" ]; }

# ---------- helpers ----------
authorize_key_on_vps() {
  # print one-liner to run on any already-configured machine / DO console
  KEYLINE="$(cat ~/.ssh/id_ed25519.pub)"
  if ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "root@$VPS" true 2>/dev/null; then
    echo "==> key already authorized on VPS"
  else
    echo "==> password auth is off on the VPS. Run this ONE line on any"
    echo "    machine that can already ssh to it (or the DO web console):"
    echo
    echo "    ssh root@$VPS 'mkdir -p ~/.ssh && echo \"$KEYLINE\" >> ~/.ssh/authorized_keys'"
    echo
    read -rp "   ...press ENTER when done: " _
    ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "root@$VPS" true \
      && echo "==> VPS access OK" || { echo "still failing"; exit 1; }
  fi
}

ssh_config() {
  mkdir -p ~/.ssh; chmod 700 ~/.ssh
  if ! grep -q "^Host vps" ~/.ssh/config 2>/dev/null; then
    cat >> ~/.ssh/config << CONF
Host vps
  HostName $VPS
  User root
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
CONF
    chmod 600 ~/.ssh/config
  fi
  ssh -o BatchMode=yes vps 'echo "==> ssh vps: OK"'
}

# =========================== 1. CLIENT ===========================
if [ "$TARGET" = "client" ]; then
  echo "==> CLIENT setup (ssh access only)"
  command -v ssh >/dev/null || { echo "install openssh first"; exit 1; }
  [ -f ~/.ssh/id_ed25519 ] || ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 -q
  authorize_key_on_vps
  ssh_config
  echo "==> done. 'ssh vps' works."
  exit 0
fi

# =========================== 2. TERMUX ===========================
if [ "$TARGET" = "termux" ]; then
  echo "==> TERMUX setup (full phone)"
  pkg install -y openssh git >/dev/null
  [ -f ~/.ssh/id_ed25519 ] || ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 -q
  authorize_key_on_vps
  ssh_config

  # memory vault (private) — PAT or deploy key needed; try ssh first, then https
  if [ ! -d ~/pocket-vault-2 ]; then
    if ssh -o BatchMode=yes -T git@github.com -o StrictHostKeyChecking=accept-new 2>&1 | grep -q "successfully authenticated"; then
      git clone -q git@github.com:DKeAlvaro/pocket-vault-2.git ~/pocket-vault-2
    else
      echo "==> cloning vault (paste a GitHub PAT as password)"
      git clone https://github.com/DKeAlvaro/pocket-vault-2.git ~/pocket-vault-2
    fi
  fi
  mkdir -p ~/.pi/agent/memory
  ln -sfn ~/pocket-vault-2/memory/MEMORY.md ~/.pi/agent/memory/MEMORY.md
  ln -sfn ~/pocket-vault-2/memory/SETUP.md ~/memorysetup.md

  # pi itself
  if ! command -v pi >/dev/null; then
    echo "==> installing pi (npm global)"
    npm install -g @earendil-works/pi-coding-agent >/dev/null 2>&1
  fi

  # pi config pulled from the VPS (keys included, over ssh)
  echo "==> pulling pi config from VPS"
  mkdir -p ~/.pi/agent/extensions ~/bin
  for f in vault-memory.ts canvas.ts merge-thinking-proxy.js; do
    scp -q vps:/root/.pi/agent/extensions/$f ~/.pi/agent/extensions/
  done
  scp -q vps:/root/.pi/agent/{models.json,settings.json} ~/.pi/agent/
  scp -q vps:/usr/local/bin/auth ~/bin/auth
  sed -i "s|/root/pocket-vault-2|$HOME/pocket-vault-2|g" ~/.pi/agent/extensions/vault-memory.ts
  sed -i "s|/root/.canvas|$HOME/.canvas|g; s|/root/courses|$HOME/courses|g" ~/.pi/agent/extensions/canvas.ts
  sed -i "s|/root/.canvas|$HOME/.canvas|g" ~/bin/auth && chmod +x ~/bin/auth

  # phone proxy tunnel
  cp "$DOT/tunnel.sh" ~/tunnel.sh && chmod +x ~/tunnel.sh
  cat << DONE

==> TERMUX setup complete.
  pi                  your agent (memory auto-injected)
  sh ~/tunnel.sh &    start phone proxy (VPS routes web via your IP)
  auth canvas         paste Canvas cookies when needed
  ssh vps             the VPS
DONE
  exit 0
fi

# =========================== 3. SERVER ===========================
if [ "$TARGET" = "server" ]; then
  echo "==> SERVER setup (the brain: VPS / Raspberry Pi)"
  # --- base packages ---
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq tmux git curl privoxy cron >/dev/null
  # --- node + pi ---
  command -v node >/dev/null || { curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null; apt-get install -y -qq nodejs >/dev/null; }
  command -v pi >/dev/null || npm install -g @earendil-works/pi-coding-agent >/dev/null 2>&1
  # --- user setup files ---
  mkdir -p ~/bin
  cp "$DOT/server/tmux.conf" ~/.tmux.conf
  cp "$DOT/server/keepalive.sh" ~/keepalive.sh 2>/dev/null || true
  chmod +x ~/keepalive.sh 2>/dev/null || true
  # --- memory vault ---
  if [ ! -d ~/pocket-vault-2 ]; then
    echo "==> cloning vault (paste GitHub PAT as password)"
    git clone https://github.com/DKeAlvaro/pocket-vault-2.git ~/pocket-vault-2
  fi
  mkdir -p ~/.pi/agent/memory
  ln -sfn ~/pocket-vault-2/memory/MEMORY.md ~/.pi/agent/memory/MEMORY.md
  ln -sfn ~/pocket-vault-2/memory/SETUP.md ~/memorysetup.md
  # --- pi extensions from this repo (canonical copies) ---
  mkdir -p ~/.pi/agent/extensions
  cp "$DOT/server/extensions/"*.ts "$DOT/server/extensions/"*.js ~/.pi/agent/extensions/ 2>/dev/null || true
  # --- pi config: pull from current VPS if reachable, else manual ---
  if ssh -o BatchMode=yes -o ConnectTimeout=5 vps true 2>/dev/null; then
    echo "==> pulling pi config (models.json with API keys) from old VPS"
    scp -q vps:/root/.pi/agent/{models.json,settings.json} ~/.pi/agent/
  else
    echo "!! no ssh vps access — copy models.json (API keys) manually to ~/.pi/agent/"
  fi
  # --- privoxy for phone proxy ---
  grep -q "forward-socks5 / 127.0.0.1:8119" /etc/privoxy/config 2>/dev/null || \
    echo 'forward-socks5 / 127.0.0.1:8119 .' >> /etc/privoxy/config
  systemctl enable --now privoxy cron 2>/dev/null || service privoxy start 2>/dev/null || true
  cat << DONE

==> SERVER setup complete.
  tmux            attach away; sessions: main, pi_session
  pi              agent (memory auto-injected via vault symlink)
  Check: crontab -e for canvas keepalive / daily jobs (in vault workflows)
  Phone tunnel will land on 127.0.0.1:8119 -> privoxy 8118 (already wired)
DONE
  exit 0
fi

echo "unknown target: $TARGET (use client | termux | server)"
exit 1
