# dotfiles — mi setup, en un script

Mi setup vive en 3 tipos de máquina: el VPS, el móvil y el PC.
Este repo convierte ese setup en un script de instalación, para que
cambiar de máquina no sea un drama.

## El único comando que hay que recordar

```
git clone https://github.com/DKeAlvaro/dotfiles && cd dotfiles
bash bootstrap.sh <target>
```

El target es el tipo de máquina donde estás ejecutando el script:

```
bash bootstrap.sh client   → en un PC      (solo ssh vps)
bash bootstrap.sh termux   → en el móvil   (todo: pi, memoria, túnel)
bash bootstrap.sh server   → en un VPS     (el cerebro completo)
```

- **¿PC nuevo?** → `client`
- **¿Móvil nuevo?** → `termux`
- **¿VPS nuevo?** → `server`

## Qué instala cada modo

### client (PC)
Lo mínimo para conectarse: genera una clave SSH, la autoriza en el VPS
y crea el alias `ssh vps`. Nada más.

### termux (móvil, setup completo)
- ssh al VPS (igual que client)
- pi instalado, con las mismas extensiones y config que el VPS
- memoria: clona el vault y enlaza MEMORY.md (pi se acuerda de ti)
- `~/tunnel.sh` (proxy para que el VPS salga por la IP del móvil)
- comando `auth` para las cookies de Canvas

### server (VPS o Raspberry Pi)
- tmux (con mi tmux.conf), pi con las extensiones, privoxy, cron
- memoria: vault clonado y enlazado
- proxy del móvil ya cableado (privoxy → túnel del teléfono)

Después de un `server` faltan 3 cosas a mano (el script avisa):
- copiar `~/.canvas/cookies.json` del VPS viejo (o correr `auth canvas`)
- hacer push de los repos de `~/projects` que no tengan remote en GitHub
- en el móvil, cambiar la IP en `~/.ssh/config` (Host vps)

## Cómo funciona por dentro

- Las claves SSH se GENERAN nuevas en cada máquina. Nunca se copian.
- La config de pi con las API keys se copia DESDE el VPS por SSH.
  Por eso este repo puede ser público: no hay secretos aquí.
- La memoria (vault) viene del repo privado de GitHub; pide un PAT
  una sola vez para clonarla.
- Si la clave SSH nueva aún no está autorizada en el VPS, el script
  imprime una línea para pegar en cualquier máquina que ya tenga
  acceso. La pegas, ENTER, y sigue solo.

## Migrar a otro VPS / Raspberry Pi

1. Caja nueva: `bash bootstrap.sh server <ip-nueva>`
2. Las 3 cosas a mano de arriba.
3. En el móvil: `Host vps` apunta a la IP nueva. El túnel reconecta solo.
