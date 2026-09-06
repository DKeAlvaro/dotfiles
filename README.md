# dotfiles — mi setup, en un script

Tengo 2 sitios:

1. **El VPS** — el cerebro. Ahí viven pi, la memoria, los proyectos, los crons.
2. **El móvil** — la ventana. Desde ahí hablo con el cerebro.

Este repo convierte mi setup en un script de instalación. Si algún día hay
algo nuevo (móvil, PC, o cambio de VPS), no hay que acordarse de nada:
se ejecuta un comando y quedas como estabas.

## El único comando que hay que recordar

```
git clone https://github.com/DKeAlvaro/dotfiles && cd dotfiles
bash bootstrap.sh <caso>
```

## Los 3 casos

### Caso 1: PC nuevo
Solo quiero abrir una terminal, escribir `ssh vps` y que entre.

```
bash bootstrap.sh client
```

### Caso 2: móvil nuevo (Termux)
Quiero EXACTAMENTE lo que tengo hoy: pi, que se acuerde de mí (memoria),
el túnel del proxy, todo.

```
bash bootstrap.sh termux
```

### Caso 3: VPS nuevo (o Raspberry Pi)
El cerebro hay que reconstruirlo en otra parte.

```
bash bootstrap.sh server
```

Después de esto faltan 3 cosas a mano (el script avisa):
- copiar `~/.canvas/cookies.json` del VPS viejo (o correr `auth canvas`)
- hacer push de los repos de `~/projects` que no tengan remote en GitHub
- en el móvil, cambiar la IP en `~/.ssh/config` (Host vps)

## Qué pasa dentro del script (por si te da curiosidad)

- Genera una clave SSH nueva para esa máquina (las claves NUNCA se copian
  de una máquina a otra) y la autoriza en el VPS.
- Si la clave aún no está autorizada, te imprime una línea para pegar en
  cualquier máquina que ya tenga acceso. La pegas, ENTER, sigue.
- La configuración de pi con las API keys se copia DESDE el VPS por SSH.
  Por eso este repo puede ser público: no hay secretos aquí.
- La memoria (vault) viene del repo privado de GitHub; para clonarla pide
  un PAT una sola vez.

## Migrar a otro VPS / Raspberry Pi

1. Caja nueva: `bash bootstrap.sh server <ip-nueva>`
2. Las 3 cosas a mano de arriba.
3. En el móvil: `Host vps` apunta a la IP nueva. El túnel reconecta solo.

Eso es todo.
