// src/common/pdf/html-to-pdf.ts
import { Logger } from '@nestjs/common';
import puppeteer, { Browser, PDFOptions } from 'puppeteer';
import { pdfLimiter } from '../perf/concurrency';

/**
 * ✅ Génération de PDF avec UN SEUL Chromium partagé.
 *
 * Avant : chaque facture / billet / export lançait un Chromium complet (200 à 400 Mo de RAM, 1 à 3 s de CPU).
 * 10 commandes en même temps = 10 Chromium → serveur à court de mémoire, tout se bloque.
 * Et si la page échouait (image distante injoignable…), browser.close() n'était jamais appelé :
 * des Chromium « fantômes » restaient en mémoire jusqu'au redémarrage.
 *
 * Maintenant :
 *  - un Chromium lancé une fois, réutilisé (relancé automatiquement s'il s'arrête) ;
 *  - au plus PDF_MAX_CONCURRENCY pages en même temps (2 par défaut), les autres attendent leur tour ;
 *  - délai maximum par PDF (PDF_TIMEOUT_MS, 30 s) ; la page est TOUJOURS fermée ;
 *  - Chromium fermé après PDF_BROWSER_IDLE_SECONDS d'inactivité (120 s) pour libérer la mémoire.
 */
const logger = new Logger('PDF');

let browserPromise: Promise<Browser> | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let openPages = 0;

const idleMs = () => (Number(process.env.PDF_BROWSER_IDLE_SECONDS) || 120) * 1000;
const timeoutMs = () => Number(process.env.PDF_TIMEOUT_MS) || 30000;

function launch(): Promise<Browser> {
  const p = puppeteer
    .launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // /dev/shm souvent minuscule sur les VPS → crash de Chromium
        '--disable-gpu',
        '--disable-extensions',
        '--no-first-run',
        '--mute-audio',
        '--font-render-hinting=none',
      ],
    })
    .then((browser) => {
      browser.on('disconnected', () => {
        if (browserPromise === p) browserPromise = null;
      });
      logger.log('Chromium démarré (partagé)');
      return browser;
    })
    .catch((e) => {
      if (browserPromise === p) browserPromise = null;
      throw e;
    });
  return p;
}

async function getBrowser(): Promise<Browser> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (!browserPromise) browserPromise = launch();
  const browser = await browserPromise;
  if (!browser.isConnected()) {
    browserPromise = launch();
    return browserPromise;
  }
  return browser;
}

function scheduleIdleClose() {
  if (openPages > 0 || !browserPromise) return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    idleTimer = null;
    if (openPages > 0 || !browserPromise) return;
    const p = browserPromise;
    browserPromise = null;
    try {
      const b = await p;
      await b.close();
      logger.log('Chromium fermé (inactif)');
    } catch {
      /* déjà fermé */
    }
  }, idleMs());
  idleTimer.unref();
}

export type HtmlToPdfOptions = {
  /** load (défaut) ou networkidle0 (attend toutes les images distantes, plus lent) */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
  pdf?: PDFOptions;
};

/** HTML → PDF (Buffer). Utilisable partout à la place de puppeteer.launch(). */
export async function renderHtmlToPdf(html: string, options: HtmlToPdfOptions = {}): Promise<Buffer> {
  return pdfLimiter.run(async () => {
    const started = Date.now();
    let browser = await getBrowser();
    let page;
    try {
      page = await browser.newPage();
    } catch {
      // Chromium tombé entre-temps : on le relance une fois
      browserPromise = null;
      browser = await getBrowser();
      page = await browser.newPage();
    }
    openPages++;
    try {
      const limit = timeoutMs();
      page.setDefaultTimeout(limit);
      page.setDefaultNavigationTimeout(limit);
      await page.setContent(html, { waitUntil: options.waitUntil ?? 'load', timeout: limit });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20px', bottom: '30px', left: '20px', right: '20px' },
        timeout: limit,
        ...(options.pdf ?? {}),
      });
      const took = Date.now() - started;
      if (took > 5000) logger.warn(`PDF généré en ${took} ms (file d'attente : ${pdfLimiter.queued})`);
      return Buffer.from(pdf);
    } finally {
      openPages--;
      await page.close().catch(() => undefined);
      scheduleIdleClose();
    }
  });
}

/** Fermeture propre (arrêt du serveur) */
export async function closePdfBrowser(): Promise<void> {
  if (idleTimer) clearTimeout(idleTimer);
  const p = browserPromise;
  browserPromise = null;
  if (!p) return;
  try {
    await (await p).close();
  } catch {
    /* déjà fermé */
  }
}

process.once('beforeExit', () => void closePdfBrowser());
