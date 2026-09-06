# dotfiles — portable setup

Everything needed to reconstruct Alvaro's agent setup on a new machine
(Termux phone, laptop, new VPS, Raspberry Pi).

## New machine (phone/laptop)

```
pkg install -y git   # or apt
git clone https://github.com/DKeAlvaro/dotfiles && cd dotfiles
bash bootstrap.sh            # optional arg: VPS ip/hostname
```
That's it. Installs ssh keys, connects to the VPS, clones the memory
vault, pulls Pi config from the VPS, links memory. Secrets never touch
this repo (pulled from the VPS over SSH).

## New VPS / Raspberry Pi (the brain)

The brain is: git vault (memory) + this repo (setup) + GitHub.
1. Install pi + openssh-server on the new box.
2. `bash bootstrap.sh <new-box-ip>` from any configured machine, or on the
   box itself run bootstrap and then restore /root from the old VPS or
   re-run the pi-config pull (step 8 of bootstrap.sh).
3. Update `Host vps` / bootstrap default IP when migrating.

## Contents
- bootstrap.sh   one-shot new-machine setup
- tunnel.sh      phone reverse-proxy tunnel (VPS uses phone IP)
