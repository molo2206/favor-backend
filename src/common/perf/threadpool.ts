// src/common/perf/threadpool.ts
/**
 * ✅ PREMIER import de main.ts (avant tout accès disque / réseau).
 *
 * Node n'a que 4 threads par défaut pour : lecture/écriture de fichiers, DNS (appels HTTP sortants),
 * gzip des réponses, crypto ET les traitements d'images sharp.
 * Quelques uploads d'images suffisaient à occuper les 4 threads → toutes les autres requêtes attendaient
 * (le serveur « se bloque » quelques secondes puis repart).
 * UV_THREADPOOL_SIZE doit être fixé avant la première utilisation de cette file : d'où ce fichier importé en premier.
 */
import * as os from 'os';

if (!process.env.UV_THREADPOOL_SIZE) {
  const cpus = Math.max(1, os.cpus()?.length || 1);
  process.env.UV_THREADPOOL_SIZE = String(Math.min(64, Math.max(8, cpus * 4)));
}

export const THREADPOOL_SIZE = Number(process.env.UV_THREADPOOL_SIZE);
