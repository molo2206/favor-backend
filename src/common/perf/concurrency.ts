// src/common/perf/concurrency.ts
/**
 * ✅ Limiteur de concurrence (sémaphore).
 * Empêche qu'une rafale de requêtes lance en même temps des dizaines de traitements lourds
 * (Chromium, ffmpeg, sharp, suppression de fond…) qui saturent le processeur, la mémoire
 * et la file de threads de Node : les traitements attendent leur tour, le reste de l'API reste fluide.
 */
export class Semaphore {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    private readonly max: number,
    private readonly maxQueue = 500,
  ) {}

  get running(): number {
    return this.active;
  }

  get queued(): number {
    return this.waiting.length;
  }

  private acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return Promise.resolve();
    }
    if (this.waiting.length >= this.maxQueue) {
      return Promise.reject(new Error('Serveur occupé : trop de traitements en attente, réessayez dans un instant'));
    }
    return new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) {
      next(); // le créneau passe directement au suivant
    } else {
      this.active = Math.max(0, this.active - 1);
    }
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }
}

const envInt = (key: string, def: number, min = 1): number => {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : def;
};

/** Génération de PDF (Chromium) : 2 pages en même temps par défaut */
export const pdfLimiter = new Semaphore(envInt('PDF_MAX_CONCURRENCY', 2));

/** Compression vidéo ffmpeg : 1 à la fois par défaut */
export const videoLimiter = new Semaphore(envInt('VIDEO_MAX_CONCURRENCY', 1));

/** Traitements d'images sharp (upload) : 2 à la fois par défaut */
export const imageLimiter = new Semaphore(envInt('IMAGE_MAX_CONCURRENCY', 2));

/** Suppression de fond (IA onnx, très lourde) : 1 à la fois par défaut */
export const heavyAiLimiter = new Semaphore(envInt('BG_REMOVAL_MAX_CONCURRENCY', 1), 20);
