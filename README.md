# dotfiles — setup portable de Álvaro

Repo público. Cero secretos: las API keys viven en el VPS y se copian por SSH.

## El comando único (no memorices nada más)

```
git clone https://github.com/DKeAlvaro/dotfiles && cd dotfiles
bash bootstrap.sh <target>
```

### Targets: qué eres tú ahora

| Target | Cuándo | Qué hace |
|---|---|---|
| `client` | PC nuevo / portátil, solo quieres conectarte | genera clave ssh, la autoriza en el VPS, crea el alias `ssh vps` |
| `termux` | móvil nuevo con Termux, setup COMPLETO como el actual | todo lo de client + instala pi, clona el vault de memoria (pide PAT), enlaza MEMORY.md, copia extensiones/config de pi desde el VPS, instala tunnel.sh y `auth` |
| `server` | VPS nuevo o Raspberry Pi (el cerebro) | instala tmux+conf, pi+extensiones, privoxy (proxy del móvil), cron, clona vault; keys de pi se copian desde el VPS viejo si hay ssh |

### Notas

- El script pide interacción solo si: la clave aún no está autorizada en el
  VPS (te da la línea exacta para ejecutar en una máquina ya configurada) o
  al clonar el vault privado (PAT de GitHub, una vez).
- Tú no guardas ni recuerdas keys: `models.json` (con las API keys) vive en
  el VPS y viaja por SSH al montar pi en una máquina nueva.
- Claves ssh: se GENERAN nuevas por máquina, nunca se copian.

## Migrar a otro VPS / Raspberry Pi

1. Caja nueva: `bash bootstrap.sh server <ip-nueva>`
2. Mover lo que no está en git: `~/.canvas/cookies.json`, y haz push de los
   repos de `~/projects` que no tengan remote.
3. En el móvil: cambia la IP en `~/.ssh/config` (Host vps). El tunnel.sh
   reconecta solo.
