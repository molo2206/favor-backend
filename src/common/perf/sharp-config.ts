// src/common/perf/sharp-config.ts
import * as os from 'os';
import sharp from 'sharp';

/**
 * ✅ Réglage global de sharp (libvips).
 * Par défaut CHAQUE image utilise autant de threads que de cœurs : 4 uploads simultanés sur un VPS 4 cœurs
 * = 16 threads de calcul qui se battent pour le processeur → l'API ne répond plus.
 *  SHARP_CONCURRENCY : threads par image (défaut : moitié des cœurs, au moins 1)
 *  SHARP_CACHE_MB    : cache mémoire de libvips (défaut 30 Mo)
 */
export function configureSharp(): void {
  const cpus = Math.max(1, os.cpus()?.length || 1);
  const threads = Number(process.env.SHARP_CONCURRENCY) || Math.max(1, Math.floor(cpus / 2));
  sharp.concurrency(threads);
  sharp.cache({ memory: Number(process.env.SHARP_CACHE_MB) || 30, files: 0, items: 100 });
}
