# Presentación demo · Perfil Guest

Video demo del perfil Guest de CIPREC, listo para compartir por link.

## Contenido

- `demo-guest.mp4` — Video final (1920×1080, ~1:50 min, ~8 MB)
- `index.html` — Página HTML con reproductor embebido (para GitHub Pages)
- `scenes/` — Escenas HTML individuales (cada una es una slide)
- `audio/` — Audios WAV por escena (TTS, voz es-AR-ElenaNeural)
- `NotoColorEmoji.ttf` — Fuente de emojis (para que se vean en las escenas)
- `build.mjs` — Script que regenera el video desde las escenas

## Cómo ver el video

### Opción A: GitHub Pages (recomendado)

Subir la carpeta a la rama `gh-pages` o configurar Pages → `main` / `docs/presentacion`.

### Opción B: Local

Abrir `index.html` en cualquier navegador moderno.

## Cómo regenerar el video

Requisitos: Node 18+, Python 3.8+, ffmpeg en PATH.

```bash
npm install puppeteer
pip3 install edge-tts --break-system-packages
node build.mjs
```

Variables de entorno útiles:

- `SKIP_AUDIO=1` — reusa los WAV ya generados (no llama a edge-tts)
- `SKIP_FRAMES=1` — reusa los PNG ya capturados
