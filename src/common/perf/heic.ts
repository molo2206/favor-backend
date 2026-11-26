// src/common/perf/heic.ts
import { Worker } from 'worker_threads';

/**
 * ✅ Conversion HEIC (photos iPhone) → JPEG dans un THREAD SÉPARÉ.
 *
 * heic-convert décode l'image en JavaScript/WASM : sur le thread principal, une photo iPhone de 12 Mpx
 * bloquait TOUTE l'API pendant 2 à 6 secondes (aucune autre requête ne pouvait répondre).
 * Ici le décodage se fait dans un worker : l'API continue de répondre pendant la conversion.
 */
const WORKER_CODE = `
const { parentPort, workerData } = require('worker_threads');
const convert = require(workerData.mod);
(async () => {
  try {
    const out = await convert({ buffer: Buffer.from(workerData.input), format: workerData.format, quality: workerData.quality });
    const data = new Uint8Array(out.length);
    data.set(out);
    parentPort.postMessage({ ok: true, data }, [data.buffer]);
  } catch (e) {
    parentPort.postMessage({ ok: false, error: (e && e.message) || String(e) });
  }
})();
`;

let modulePath = '';
function heicModule(): string {
  if (!modulePath) modulePath = require.resolve('heic-convert');
  return modulePath;
}

export function convertHeicInWorker(
  input: Buffer,
  format: 'JPEG' | 'PNG' = 'JPEG',
  quality = 0.85,
  timeoutMs = Number(process.env.HEIC_TIMEOUT_MS) || 60000,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    let done = false;
    const worker = new Worker(WORKER_CODE, {
      eval: true,
      workerData: { mod: heicModule(), input, format, quality },
      resourceLimits: { maxOldGenerationSizeMb: 512 },
    });
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn();
      worker.terminate().catch(() => undefined);
    };
    const timer = setTimeout(() => finish(() => reject(new Error('Conversion HEIC trop longue'))), timeoutMs);
    worker.once('message', (msg: any) =>
      finish(() => (msg?.ok ? resolve(Buffer.from(msg.data)) : reject(new Error(msg?.error || 'Conversion HEIC impossible')))),
    );
    worker.once('error', (err) => finish(() => reject(err)));
    worker.once('exit', (code) => finish(() => reject(new Error(`Conversion HEIC interrompue (code ${code})`))));
  });
}
