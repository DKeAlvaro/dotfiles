#!/usr/bin/env bash
# bootstrap — full setup on a new machine (Termux or Linux laptop).
# Usage:  bash bootstrap.sh [vps-host-or-ip]
# Asks for: VPS root password (once, to authorize your key) and a GitHub
# PAT with access to DKeAlvaro/pocket-vault-2 (to clone the private vault).
# Everything else is automatic. Secrets are pulled from the VPS via SSH,
# never stored in this repo.
set -euo pipefail

VPS="${1:-104.248.195.240}"
VPS_ALIAS=vps
DOT="$(cd "$(dirname "$0")" && pwd)"
is_termux() { [ -n "${TERMUX_VERSION:-}" ]; }

echo "==> bootstrap: new machine setup (VPS: $VPS)"

# ---- 1. packages ----
if is_termux; then
  echo "==> installing Termux packages"
  pkg install -y openssh git >/dev/null
fi

# ---- 2. ssh key (generate if missing) ----
if [ ! -f ~/.ssh/id_ed25519 ]; then
  echo "==> generating ssh key"
  mkdir -p ~/.ssh && chmod 700 ~/.ssh
  ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 -q
fi

# ---- 3. authorize key on VPS ----
# The VPS has password auth DISABLED. If this machine is not yet authorized,
# copy the printed command to any machine that CAN ssh to the VPS (phone,
# laptop, or the DigitalOcean web console) and run it there.
KEYLINE="$(cat ~/.ssh/id_ed25519.pub)"
if ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "root@$VPS" true 2>/dev/null; then
  echo "==> key already authorized on VPS"
else
  echo "==> This machine can't reach the VPS with a key yet (password auth is off)."
  echo "==> Run this ONE line on any machine already configured (or the DO console):"
  echo ""
  echo "    ssh root@$VPS 'mkdir -p ~/.ssh && echo \"$KEYLINE\" >> ~/.ssh/authorized_keys'"
  echo ""
  read -rp "   ...press ENTER when done: " _
  ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "root@$VPS" true \
    && echo "==> VPS access OK" || { echo "still failing"; exit 1; }
fi

# ---- 4. ssh config ----
mkdir -p ~/.ssh
if ! grep -q "^Host $VPS_ALIAS" ~/.ssh/config 2>/dev/null; then
  cat >> ~/.ssh/config << CONF
Host $VPS_ALIAS
  HostName $VPS
  User root
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
CONF
  chmod 600 ~/.ssh/config
fi
ssh -o BatchMode=yes $VPS_ALIAS 'echo "==> ssh $VPS_ALIAS: OK"'

# ---- 5. github key authorization via VPS (needs gh on VPS) ----
PUB=$(cat ~/.ssh/id_ed25519.pub)
ssh $VPS_ALIAS "gh ssh-key add - -t \$(hostname)-\$(date +%s) <<< '$PUB' 2>/dev/null || echo '==> note: add your key to github manually'" || true

# ---- 6. clone private vault (asks for PAT once; git caches it) ----
if [ ! -d ~/pocket-vault-2 ]; then
  echo "==> cloning pocket-vault-2 (paste a GitHub PAT as password)"
  git clone https://github.com/DKeAlvaro/pocket-vault-2.git ~/pocket-vault-2
fi

# ---- 7. memory symlink ----
mkdir -p ~/.pi/agent/memory
ln -sfn ~/pocket-vault-2/memory/MEMORY.md ~/.pi/agent/memory/MEMORY.md
ln -sfn ~/pocket-vault-2/memory/SETUP.md ~/memorysetup.md

# ---- 8. pi config pulled from the VPS (source of truth) ----
if is_termux || command -v pi >/dev/null; then
  echo "==> pulling pi config from VPS"
  mkdir -p ~/.pi/agent/extensions ~/.pi/agent
  scp -q $VPS_ALIAS:/root/.pi/agent/extensions/{vault-memory.ts,canvas.ts,merge-thinking-proxy.js} ~/.pi/agent/extensions/ 2>/dev/null || \
  for f in vault-memory.ts canvas.ts merge-thinking-proxy.js; do
    scp -q $VPS_ALIAS:/root/.pi/agent/extensions/$f ~/.pi/agent/extensions/
  done
  scp -q $VPS_ALIAS:/root/.pi/agent/{models.json,settings.json} ~/.pi/agent/
  scp -q $VPS_ALIAS:/usr/local/bin/auth ~/bin/auth 2>/dev/null || true
  # adapt /root paths to $HOME
  sed -i "s|/root/pocket-vault-2|$HOME/pocket-vault-2|g" ~/.pi/agent/extensions/vault-memory.ts
  sed -i "s|/root/.canvas|$HOME/.canvas|g; s|/root/courses|$HOME/courses|g" ~/.pi/agent/extensions/canvas.ts
  sed -i "s|/root/.canvas|$HOME/.canvas|g" ~/bin/auth 2>/dev/null || true
  chmod +x ~/bin/auth 2>/dev/null || true
  mkdir -p ~/.pi/agent/bin && ln -sf "$(command -v pi || echo /usr/bin/pi)" ~/.pi/agent/bin/pi 2>/dev/null || true
fi

# ---- 9. phone proxy tunnel (Termux only) ----
if is_termux && [ ! -f ~/tunnel.sh ]; then
  cp "$DOT/tunnel.sh" ~/tunnel.sh && chmod +x ~/tunnel.sh
  echo "==> tunnel.sh installed. Run it after boot:  sh ~/tunnel.sh &"
fi

# ---- done ----
cat << DONE

==> bootstrap complete.
  ssh vps               connects to the VPS
  pi                    your agent (memory already linked)
  ~/pocket-vault-2      memory vault (commit + push to persist)
  memorysetup.md        how memory works
First pi launch will inject MEMORY.md automatically (vault-memory extension).
DONE
