#!/usr/bin/env node
/**
 * Pipeline presentación CIPREC (Node + Puppeteer + edge-tts + ffmpeg)
 *
 * Pasos:
 *  1. Genera audio TTS por escena con edge-tts (voz es-AR-ElenaNeural)
 *  2. Captura N frames de cada escena HTML con Puppeteer
 *  3. Une frames + audio con ffmpeg → demo-guest.mp4
 *
 * Requisitos: LD_LIBRARY_PATH=/tmp/chrome-libs (libs de Chromium extraídas)
 */

import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const SCENES = path.join(ROOT, "scenes");
const FRAMES = path.join(ROOT, "frames");
const AUDIO = path.join(ROOT, "audio");
const FFMPEG = path.join(ROOT, "tools/ffmpeg-7.0.2-amd64-static/ffmpeg");

for (const d of [FRAMES, AUDIO]) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

// ───────── CONFIG ─────────
const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

// Narración y duración por escena
const SCENES_DATA = [
  {
    idx: 0,
    slug: "acceso",
    duration: 16,
    text: "Para entrar a la pantalla de invitados usamos un usuario y una contraseña que entrega el equipo de administración. Es una sesión con tiempo limitado: si nadie la usa durante un rato, se cierra sola para cuidar la información de los pacientes. Vamos a entrar.",
  },
  {
    idx: 1,
    slug: "mapa",
    duration: 18,
    text: "Lo que tenemos acá es una foto viva del día. Cada punto de color que se mueve es un chofer trabajando. Cada marca redonda es un paciente esperando su traslado. Toda la información importante la vemos al costado del mapa, en la lista del día.",
  },
  {
    idx: 2,
    slug: "etapas",
    duration: 24,
    text: "La plataforma acompaña cada traslado en cuatro etapas. Primero el chofer está en camino al paciente. Después aparece como llegando, cuando ya está a un paso del destino. Cuando arriba, el sistema marca ya llegó. Y si es un traslado de ida y vuelta, pasa a volviendo cuando el chofer regresa con el paciente. El sistema avisa solo con un cartelito en pantalla.",
  },
  {
    idx: 3,
    slug: "remis",
    duration: 14,
    text: "A veces no hay un móvil disponible para un paciente. En esos casos pedimos un remis. En el mapa se ve en negro, y muestra los minutos que faltan para que llegue el auto.",
  },
  {
    idx: 4,
    slug: "herramientas",
    duration: 18,
    text: "La pantalla tiene tres ayudas para el invitado. El timbre avisa cuando hay cortes de calle o manifestaciones que pueden demorar un traslado. El botón del gráfico abre un resumen con la actividad de la semana. Y abajo a la derecha hay un chat para hacerle preguntas a la plataforma.",
  },
  {
    idx: 5,
    slug: "cierre",
    duration: 20,
    text: "Para encontrar rápido lo que buscamos, podemos buscar por nombre del paciente, o filtrar la lista por estado: ver solo los traslados pendientes, en curso o ya terminados. Cuando terminamos, cerramos la sesión con la equis de arriba a la derecha. Con esto ya conocemos la pantalla de invitados de Cipréc, una vista panorámica para tener el pulso del día.",
  },
];

// ───────── TTS con edge-tts (subprocess Python) ─────────
async function generarAudio() {
  console.log("\n[TTS] Generando audios con edge-tts (es-AR-ElenaNeural)...");
  const voice = "es-AR-ElenaNeural";
  for (const s of SCENES_DATA) {
    const mp3Path = path.join(AUDIO, `escena-${s.idx}.mp3`);
    const wavPath = path.join(AUDIO, `escena-${s.idx}.wav`);
    console.log(`[TTS]   escena ${s.idx} (${s.text.length} chars)`);
    const py = `
import asyncio, edge_tts, sys
async def main():
    c = edge_tts.Communicate(sys.argv[1], voice=sys.argv[2])
    await c.save(sys.argv[3])
asyncio.run(main())
`;
    writeFileSync("/tmp/_tts.py", py);
    execSync(
      `python3 /tmp/_tts.py ${JSON.stringify(s.text)} ${voice} ${mp3Path}`,
      { stdio: "inherit" },
    );
    // mp3 → wav 44.1k mono
    execSync(
      `${FFMPEG} -y -loglevel error -i ${JSON.stringify(mp3Path)} -ar 44100 -ac 1 ${JSON.stringify(wavPath)}`,
      { stdio: "inherit" },
    );
    const sz = statSync(wavPath).size / 1024;
    console.log(`[TTS]   → ${path.basename(wavPath)} (${sz.toFixed(0)} KB)`);
  }
}

// ───────── Captura de frames con Puppeteer ─────────
async function capturarFrames() {
  console.log("\n[FRAMES] Iniciando Puppeteer (headless Chromium)...");
  const puppeteer = (await import("puppeteer")).default;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
  });

  try {
    for (const s of SCENES_DATA) {
      const htmlPath = path.join(SCENES, `escena-${s.idx}.html`);
      const url = `file://${htmlPath}`;
      const nFrames = s.duration * FPS;
      console.log(
        `[FRAMES] Escena ${s.idx}: ${nFrames} frames (${s.duration}s @ ${FPS}fps)`,
      );

      const page = await browser.newPage();
      await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
      await page.goto(url, { waitUntil: "networkidle0" });
      await new Promise((r) => setTimeout(r, 600));

      for (let f = 0; f < nFrames; f++) {
        const out = path.join(FRAMES, `e${String(s.idx).padStart(2, "0")}-${String(f).padStart(5, "0")}.png`);
        await page.screenshot({ path: out, type: "png", omitBackground: false });
        if (f % 60 === 0) console.log(`[FRAMES]   e${s.idx} ${f}/${nFrames}`);
      }
      await page.close();
      console.log(`[FRAMES] Escena ${s.idx} OK`);
    }
  } finally {
    await browser.close();
  }
}

// ───────── Unión con ffmpeg ─────────
function unirMp4() {
  console.log("\n[MP4] Armando video final...");
  const out = path.join(ROOT, "demo-guest.mp4");
  const tempDir = path.join(ROOT, "temp");
  if (!existsSync(tempDir)) mkdirSync(tempDir);

  // Por cada escena: frames + audio → mp4 parcial
  const parciales = [];
  for (const s of SCENES_DATA) {
    const framesPat = path.join(FRAMES, `e${String(s.idx).padStart(2, "0")}-%05d.png`);
    const wav = path.join(AUDIO, `escena-${s.idx}.wav`);
    const parcial = path.join(tempDir, `escena-${s.idx}.mp4`);
    console.log(`[MP4]   escena ${s.idx}: frames → mp4 + audio (${s.duration}s)`);
    // Forzar duración exacta de la escena; -af apad rellena con silencio el audio hasta llegar
    execSync(
      `${FFMPEG} -y -loglevel error -framerate ${FPS} -i ${JSON.stringify(framesPat)} -i ${JSON.stringify(wav)} -t ${s.duration} -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -c:a aac -b:a 128k -af apad ${JSON.stringify(parcial)}`,
      { cwd: FRAMES, stdio: "inherit" },
    );
    parciales.push(parcial);
  }

  // Concatenar todas las escenas
  const concatList = path.join(tempDir, "concat.txt");
  writeFileSync(
    concatList,
    parciales.map((p) => `file '${p}'`).join("\n"),
  );
  console.log(`[MP4] Concatenando ${parciales.length} escenas...`);
  execSync(
    `${FFMPEG} -y -loglevel error -f concat -safe 0 -i ${JSON.stringify(concatList)} -c copy ${JSON.stringify(out)}`,
    { stdio: "inherit" },
  );

  const mb = statSync(out).size / (1024 * 1024);
  console.log(`[MP4] ✅ Video final: ${out} (${mb.toFixed(1)} MB)`);
  return out;
}

// ───────── MAIN ─────────
const SKIP_AUDIO = process.env.SKIP_AUDIO === "1";
const SKIP_FRAMES = process.env.SKIP_FRAMES === "1";

(async () => {
  console.log("═══════════════════════════════════════════");
  console.log(" PIPELINE PRESENTACIÓN CIPREC");
  console.log(` Flags: SKIP_AUDIO=${SKIP_AUDIO} SKIP_FRAMES=${SKIP_FRAMES}`);
  console.log("═══════════════════════════════════════════");
  const t0 = Date.now();
  if (!SKIP_AUDIO) await generarAudio();
  if (!SKIP_FRAMES) await capturarFrames();
  const mp4 = unirMp4();
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("═══════════════════════════════════════════");
  console.log(` ✅ Listo en ${secs}s: ${mp4}`);
  console.log("═══════════════════════════════════════════");
})().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
