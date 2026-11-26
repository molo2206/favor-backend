// src/common/perf/event-loop-monitor.ts
import { Logger } from '@nestjs/common';
import { monitorEventLoopDelay } from 'perf_hooks';

/**
 * ✅ Diagnostic : signale dans les logs (pm2 logs) quand le serveur est « gelé ».
 *
 *  - « ⛔ Boucle bloquée 2300 ms » : un code synchrone a empêché Node de répondre à TOUTES les requêtes
 *    pendant ce temps (gros calcul, conversion d'image, gros JSON…). La ligne affiche les dernières routes reçues.
 *  - « 🧠 Mémoire » : toutes les 5 min (et dès que le seuil EVENT_LOOP_MEMORY_WARN_MB est dépassé).
 *
 *  EVENT_LOOP_MONITOR=false     → désactivé
 *  EVENT_LOOP_BLOCK_MS=500      → seuil d'alerte (ms)
 *  EVENT_LOOP_MEMORY_WARN_MB=1500
 */
const recent: string[] = [];

/** Middleware Express : garde les 15 dernières routes reçues (pour savoir qui a bloqué) */
export function recentRequestsTracker() {
  return (req: any, _res: any, next: () => void) => {
    recent.push(`${req.method} ${String(req.originalUrl || req.url || '').split('?')[0].slice(0, 120)}`);
    if (recent.length > 15) recent.shift();
    next();
  };
}

export function startEventLoopMonitor(): void {
  if (String(process.env.EVENT_LOOP_MONITOR ?? 'true').toLowerCase() === 'false') return;

  const logger = new Logger('Performance');
  const blockMs = Number(process.env.EVENT_LOOP_BLOCK_MS) || 500;
  const memWarnMb = Number(process.env.EVENT_LOOP_MEMORY_WARN_MB) || 1500;
  const mb = (n: number) => Math.round(n / 1024 / 1024);

  // 1) Détection d'un blocage : un minuteur de 200 ms qui arrive très en retard = boucle bloquée
  const interval = 200;
  let last = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    const lag = now - last - interval;
    last = now;
    if (lag >= blockMs) {
      logger.warn(`⛔ Boucle bloquée ${lag} ms — dernières requêtes : ${recent.slice(-6).join(' | ') || 'aucune'}`);
    }
  }, interval);
  timer.unref();

  // 2) Statistiques toutes les 5 minutes
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  let memWarned = false;
  const stats = setInterval(() => {
    const m = process.memoryUsage();
    const p99 = Math.round(histogram.percentile(99) / 1e6);
    const max = Math.round(histogram.max / 1e6);
    histogram.reset();
    const line = `🧠 Mémoire rss=${mb(m.rss)} Mo heap=${mb(m.heapUsed)}/${mb(m.heapTotal)} Mo externe=${mb(m.external)} Mo · délai boucle p99=${p99} ms max=${max} ms`;
    if (mb(m.rss) >= memWarnMb) {
      logger.warn(`${line} ⚠️ au-dessus de ${memWarnMb} Mo`);
      memWarned = true;
    } else {
      if (memWarned) memWarned = false;
      logger.log(line);
    }
  }, 5 * 60 * 1000);
  stats.unref();

  logger.log(`Surveillance des blocages active (seuil ${blockMs} ms, threads I/O : ${process.env.UV_THREADPOOL_SIZE ?? 4})`);
}
