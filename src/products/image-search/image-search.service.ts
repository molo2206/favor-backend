// src/products/image-search/image-search.service.ts
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { promises as fs } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import sharp from 'sharp';
import OpenAI from 'openai';
import { I18nService } from 'src/libs/common/src';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { Product } from 'src/products/entities/product.entity';
import { ImageProductEntity } from 'src/products/entities/imageProduct.entity';
import { storedRelativePath } from 'src/files/media-url.util';
import {
  computeImageSignature,
  computeSimilarityScore,
  ImageSignature,
} from 'src/users/utility/helpers/image-signature.util';
import { ProductSearchEmbedding } from './product-search-embedding.entity';

/** Statuts des produits visibles dans la recherche */
const SEARCHABLE_STATUSES = ['PUBLISHED', 'AVAILABLE'];
const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif'];

/** Ce que l'IA a reconnu sur la photo */
export type ImageAnalysis = {
  isProduct: boolean;
  label: string;
  labelEn: string | null;
  category: string | null;
  keywords: string[];
  colors: string[];
  brand: string | null;
  description: string | null;
};

export type ImageSearchOptions = {
  page?: number;
  limit?: number;
  minScore?: number;
  q?: string;
  categoryId?: string;
  companyId?: string;
  brandId?: string;
  minPrice?: number;
  maxPrice?: number;
  ip?: string;
};

/** Entrée de l'index en mémoire (un produit) */
type IndexEntry = {
  productId: string;
  companyId: string | null;
  categoryId: string | null;
  brandId: string | null;
  price: number | null;
  sigs: ImageSignature[];
  vec: Float32Array | null;
};

type MatchType = 'IDENTICAL' | 'VERY_SIMILAR' | 'SIMILAR';

const sha256 = (v: Buffer | string) => createHash('sha256').update(v).digest('hex');
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function encodeVector(v: number[]): string {
  const f = new Float32Array(v);
  let norm = 0;
  for (let i = 0; i < f.length; i++) norm += f[i] * f[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < f.length; i++) f[i] = f[i] / norm;
  return Buffer.from(f.buffer).toString('base64');
}

function decodeVector(b64: string): Float32Array | null {
  try {
    const buf = Buffer.from(b64, 'base64');
    return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  } catch {
    return null;
  }
}

function dot(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function parseSig(phash?: string | null, dhash?: string | null, ahash?: string | null, hist?: string | null): ImageSignature | null {
  if (!phash || !dhash || !ahash) return null;
  let histogram: number[] = [];
  try {
    histogram = hist ? JSON.parse(hist) : [];
  } catch {
    histogram = [];
  }
  return { phash, dhash, ahash, histogram };
}

/**
 * ✅ RECHERCHE PAR IMAGE (produits + images produits)
 *
 *  Deux moteurs combinés :
 *   1. VISUEL  : empreintes perceptuelles (pHash, dHash, aHash, couleurs) de l'image principale ET des images
 *                secondaires → retrouve la même photo ou une photo très proche (même produit).
 *   2. SÉMANTIQUE (si OPENAI_API_KEY) : l'IA reconnaît l'objet sur la photo (« basket Nike rouge »), puis
 *                la description est comparée aux produits par embeddings → retrouve des produits SIMILAIRES
 *                même avec une autre photo, un autre angle, un autre fond.
 *
 *  Score final 0–100 : max(identique visuel, 80 % sémantique + 20 % visuel).
 *  Index en mémoire (rechargé toutes les IMAGE_SEARCH_INDEX_TTL_SECONDS) ; indexation automatique en arrière-plan
 *  des produits nouveaux / modifiés (embeddings + empreintes manquantes).
 *
 *  .env : IMAGE_SEARCH_SEMANTIC, OPENAI_VISION_MODEL, OPENAI_EMBEDDING_MODEL, IMAGE_SEARCH_EMBEDDING_DIMS,
 *         IMAGE_SEARCH_MIN_SCORE, IMAGE_SEARCH_RATE_PER_MINUTE, IMAGE_SEARCH_MAX_MB, IMAGE_SEARCH_INDEXER,
 *         IMAGE_SEARCH_INDEX_TTL_SECONDS
 */
@Injectable()
export class ImageSearchService implements OnModuleInit {
  private readonly logger = new Logger('ImageSearch');
  private client: OpenAI | null | undefined;

  private index: IndexEntry[] = [];
  private indexLoadedAt = 0;
  private indexLoading: Promise<void> | null = null;

  private readonly analysisCache = new Map<string, { at: number; value: ImageAnalysis | null }>();
  private readonly embeddingCache = new Map<string, { at: number; value: Float32Array }>();
  private readonly rate = new Map<string, number[]>();
  private readonly failedHash = new Set<string>();

  private indexing = false;
  private lastIndexRun: { at: Date; embedded: number; hashedProducts: number; hashedImages: number; error?: string } | null = null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
  ) {}

  onModuleInit() {
    // Premier chargement de l'index en arrière-plan (ne bloque pas le démarrage)
    setTimeout(() => this.ensureIndex().catch(() => undefined), 15000);
  }

  // ============================================================
  // RÉGLAGES
  // ============================================================
  private env(key: string, def: number, min = 0): number {
    const v = Number(process.env[key]);
    return Number.isFinite(v) && v >= min ? v : def;
  }

  private t(key: string, lang: string, params?: Record<string, any>) {
    try {
      return this.i18n.translate(key, lang, params);
    } catch {
      return key;
    }
  }

  get semanticEnabled(): boolean {
    return !!process.env.OPENAI_API_KEY && String(process.env.IMAGE_SEARCH_SEMANTIC ?? 'true').toLowerCase() !== 'false';
  }

  private get visionModel() {
    return process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';
  }

  private get embeddingModel() {
    return process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
  }

  private get dims() {
    return this.env('IMAGE_SEARCH_EMBEDDING_DIMS', 512, 64);
  }

  private get openai(): OpenAI | null {
    if (this.client === undefined) {
      this.client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30000, maxRetries: 1 }) : null;
    }
    return this.client;
  }

  private get uploadPath() {
    return process.env.UPLOAD_PATH || process.env.UPLOAD_PATH_PROD || '/var/www/favor-storage';
  }

  // ============================================================
  // 1) RECHERCHE
  // ============================================================
  async search(file: Express.Multer.File | undefined, opts: ImageSearchOptions, lang = 'fr') {
    if (!file) throw new BadRequestException(this.t('image_search.image_required', lang));
    this.checkRate(opts.ip, lang);

    const mime = String(file.mimetype || '').toLowerCase();
    // Certains mobiles envoient « application/octet-stream » : l'image est de toute façon vérifiée par sharp
    if (mime && !ALLOWED_MIME.includes(mime) && mime !== 'application/octet-stream') throw new BadRequestException(this.t('image_search.invalid_type', lang));
    const buffer = file.buffer ?? (file.path ? await fs.readFile(file.path) : null);
    if (file.path) await fs.unlink(file.path).catch(() => undefined);
    if (!buffer?.length) throw new BadRequestException(this.t('image_search.image_required', lang));
    const maxBytes = this.env('IMAGE_SEARCH_MAX_MB', 8, 1) * 1024 * 1024;
    if (buffer.length > maxBytes) throw new BadRequestException(this.t('image_search.too_large', lang, { max: maxBytes / 1024 / 1024 }));

    // Image normalisée (orientation, taille) : utilisée par les deux moteurs
    let normalized: Buffer;
    try {
      normalized = await sharp(buffer).rotate().resize(768, 768, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    } catch {
      throw new BadRequestException(this.t('image_search.invalid_image', lang));
    }

    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(opts.limit) || 20));

    // Empreinte visuelle + analyse IA en parallèle
    const [querySig, analysis] = await Promise.all([
      computeImageSignature(buffer).catch(() => computeImageSignature(normalized)),
      this.semanticEnabled ? this.analyze(normalized) : Promise.resolve(null),
    ]);

    const queryText = this.queryText(analysis, opts.q);
    const queryVec = queryText ? await this.embedQuery(queryText) : null;
    const mode: 'SEMANTIC' | 'VISUAL' = queryVec ? 'SEMANTIC' : 'VISUAL';
    const minScore = Math.min(100, Math.max(0, Number(opts.minScore) || this.env('IMAGE_SEARCH_MIN_SCORE', mode === 'SEMANTIC' ? 50 : 60)));

    await this.ensureIndex();

    // Score de chaque produit
    const scored: { id: string; score: number; visual: number; semantic: number | null; matchType: MatchType }[] = [];
    for (const e of this.index) {
      if (opts.categoryId && e.categoryId !== opts.categoryId) continue;
      if (opts.companyId && e.companyId !== opts.companyId) continue;
      if (opts.brandId && e.brandId !== opts.brandId) continue;
      if (opts.minPrice !== undefined && opts.minPrice !== null && (e.price ?? 0) < Number(opts.minPrice)) continue;
      if (opts.maxPrice !== undefined && opts.maxPrice !== null && (e.price ?? 0) > Number(opts.maxPrice)) continue;

      let visual = 0;
      for (const s of e.sigs) {
        const v = computeSimilarityScore(querySig, s);
        if (v > visual) visual = v;
      }

      let semantic: number | null = null;
      if (queryVec && e.vec) {
        // Cosinus des embeddings : ~0,20 = sans rapport, ~0,60 et plus = même type de produit
        semantic = Math.round(clamp01((dot(queryVec, e.vec) - 0.2) / 0.4) * 100);
      }

      const score =
        semantic === null
          ? visual
          : Math.max(visual >= 90 ? visual : 0, Math.round(0.8 * semantic + 0.2 * visual));
      if (score < minScore) continue;
      const matchType: MatchType = visual >= 90 ? 'IDENTICAL' : score >= 75 ? 'VERY_SIMILAR' : 'SIMILAR';
      scored.push({ id: e.productId, score, visual, semantic, matchType });
    }
    scored.sort((a, b) => b.score - a.score || b.visual - a.visual);

    const total = scored.length;
    const pageItems = scored.slice((page - 1) * limit, page * limit);
    const products = await this.loadProducts(pageItems.map((s) => s.id));
    const byId = new Map(products.map((p) => [p.id, p]));
    const items = pageItems
      .map((s) => {
        const p = byId.get(s.id);
        if (!p) return null;
        return {
          ...this.clean(p),
          similarity: s.score,
          matchType: s.matchType,
          visualScore: s.visual,
          semanticScore: s.semantic,
        };
      })
      .filter(Boolean) as any[];

    const label = analysis?.label || null;
    let message: string;
    if (total > 0) {
      message = label
        ? this.t('image_search.results_for', lang, { count: total, label })
        : this.t('image_search.results', lang, { count: total });
    } else if (analysis && !analysis.isProduct) {
      message = this.t('image_search.not_product', lang);
    } else {
      message = label ? this.t('image_search.no_results_for', lang, { label }) : this.t('image_search.no_results', lang);
    }

    return {
      message,
      data: new PaginatedResponseDto(items, total, page, limit),
      analysis: analysis
        ? {
            mode,
            isProduct: analysis.isProduct,
            label: analysis.label,
            labelEn: analysis.labelEn,
            category: analysis.category,
            brand: analysis.brand,
            colors: analysis.colors,
            keywords: analysis.keywords,
            description: analysis.description,
            /** Texte à proposer pour une recherche classique (« Rechercher : basket rouge ») */
            suggestedQuery: [analysis.label, analysis.colors?.[0]].filter(Boolean).join(' ') || null,
          }
        : { mode, isProduct: null, label: null, suggestedQuery: opts.q || null },
      minScore,
    };
  }

  /** Limite par adresse IP (route publique, appels IA payants) */
  private checkRate(ip: string | undefined, lang: string) {
    const max = this.env('IMAGE_SEARCH_RATE_PER_MINUTE', 20, 1);
    const key = ip || 'unknown';
    const now = Date.now();
    const hits = (this.rate.get(key) ?? []).filter((t) => now - t < 60000);
    if (hits.length >= max) {
      throw new HttpException({ code: 'IMAGE_SEARCH_RATE_LIMIT', message: this.t('image_search.rate_limited', lang) }, HttpStatus.TOO_MANY_REQUESTS);
    }
    hits.push(now);
    this.rate.set(key, hits);
    if (this.rate.size > 5000) this.rate.clear();
  }

  private queryText(a: ImageAnalysis | null, q?: string): string | null {
    const parts = [
      q?.trim(),
      a?.isProduct === false && !q ? null : a?.label,
      a?.labelEn,
      a?.category,
      a?.brand,
      a?.colors?.join(' '),
      a?.keywords?.join(', '),
      a?.description,
    ].filter((x) => !!x && String(x).trim());
    return parts.length ? parts.join(' | ').slice(0, 1500) : null;
  }

  // ============================================================
  // 2) INTELLIGENCE ARTIFICIELLE (reconnaissance + embeddings)
  // ============================================================

  /** Reconnaît l'objet sur la photo. null si l'IA est indisponible (la recherche visuelle continue). */
  private async analyze(jpeg: Buffer): Promise<ImageAnalysis | null> {
    const client = this.openai;
    if (!client) return null;
    const key = sha256(jpeg);
    const hit = this.analysisCache.get(key);
    if (hit && Date.now() - hit.at < 3600000) return hit.value;

    try {
      const completion: any = await client.chat.completions.create({
        model: this.visionModel,
        temperature: 0,
        max_tokens: 350,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              "Tu analyses la photo qu'un client envoie sur la marketplace Favor Help (RDC) pour retrouver des produits similaires " +
              '(alimentation, boissons, vêtements, chaussures, électronique, téléphones, maison, beauté, pièces auto, véhicules, plats de restaurant…). ' +
              'Réponds UNIQUEMENT en JSON : {"isProduct": boolean, "label": "nom court du produit en français", "labelEn": "short name in English", ' +
              '"category": "catégorie générale en français", "brand": "marque visible ou null", "colors": ["couleurs principales en français"], ' +
              '"keywords": ["6 à 12 mots-clés FR et EN : type, matière, usage, style, format, contenance"], "description": "une phrase en français"}. ' +
              "Si la photo ne montre pas un produit ou un objet vendable, isProduct = false. N'invente jamais de marque.",
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Identifie le produit principal de cette photo.' },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpeg.toString('base64')}`, detail: 'low' } },
            ],
          },
        ],
      } as any);
      const raw = completion?.choices?.[0]?.message?.content || '{}';
      const j = JSON.parse(raw);
      const list = (v: any) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 15) : []);
      const value: ImageAnalysis = {
        isProduct: j.isProduct !== false,
        label: String(j.label || '').trim().slice(0, 120),
        labelEn: j.labelEn ? String(j.labelEn).trim().slice(0, 120) : null,
        category: j.category ? String(j.category).trim().slice(0, 120) : null,
        keywords: list(j.keywords),
        colors: list(j.colors),
        brand: j.brand && String(j.brand).toLowerCase() !== 'null' ? String(j.brand).trim().slice(0, 80) : null,
        description: j.description ? String(j.description).trim().slice(0, 300) : null,
      };
      this.analysisCache.set(key, { at: Date.now(), value });
      if (this.analysisCache.size > 2000) this.analysisCache.clear();
      return value;
    } catch (e: any) {
      this.logger.warn(`Reconnaissance IA indisponible (recherche visuelle seule) : ${e?.status || ''} ${e?.message}`);
      return null;
    }
  }

  private async embed(texts: string[]): Promise<number[][] | null> {
    const client = this.openai;
    if (!client || !texts.length) return null;
    try {
      const res: any = await client.embeddings.create({ model: this.embeddingModel, input: texts, dimensions: this.dims } as any);
      return (res?.data ?? []).sort((a: any, b: any) => a.index - b.index).map((d: any) => d.embedding as number[]);
    } catch (e: any) {
      this.logger.warn(`Embeddings indisponibles : ${e?.status || ''} ${e?.message}`);
      return null;
    }
  }

  private async embedQuery(text: string): Promise<Float32Array | null> {
    const key = sha256(text);
    const hit = this.embeddingCache.get(key);
    if (hit && Date.now() - hit.at < 3600000) return hit.value;
    const res = await this.embed([text]);
    if (!res?.[0]) return null;
    const vec = decodeVector(encodeVector(res[0]));
    if (!vec) return null;
    this.embeddingCache.set(key, { at: Date.now(), value: vec });
    if (this.embeddingCache.size > 2000) this.embeddingCache.clear();
    return vec;
  }

  // ============================================================
  // 3) INDEX EN MÉMOIRE
  // ============================================================
  private async ensureIndex(force = false) {
    const ttl = this.env('IMAGE_SEARCH_INDEX_TTL_SECONDS', 300, 10) * 1000;
    if (!force && this.indexLoadedAt && Date.now() - this.indexLoadedAt < ttl) return;
    if (this.indexLoading) return this.indexLoading;
    const isFirst = !this.indexLoadedAt;
    this.indexLoading = this.loadIndex().finally(() => (this.indexLoading = null));
    // Index déjà chargé : on répond avec l'ancien pendant le rechargement
    if (isFirst || force) await this.indexLoading;
  }

  private async loadIndex() {
    const started = Date.now();
    const products: any[] = await this.dataSource.query(
      'SELECT p.`id`, p.`companyId`, p.`category_id` AS `categoryId`, p.`brand_id` AS `brandId`, p.`price`, ' +
        'p.`imageHashPhash`, p.`imageHashDhash`, p.`imageHashAhash`, p.`imageColorHistogram` ' +
        'FROM `products` p WHERE p.`status` IN (?)',
      [SEARCHABLE_STATUSES],
    );
    const map = new Map<string, IndexEntry>();
    for (const p of products) {
      const sig = parseSig(p.imageHashPhash, p.imageHashDhash, p.imageHashAhash, p.imageColorHistogram);
      map.set(p.id, {
        productId: p.id,
        companyId: p.companyId ?? null,
        categoryId: p.categoryId ?? null,
        brandId: p.brandId ?? null,
        price: p.price !== null && p.price !== undefined ? Number(p.price) : null,
        sigs: sig ? [sig] : [],
        vec: null,
      });
    }

    const images: any[] = await this.dataSource.query(
      'SELECT i.`productId`, i.`imageHashPhash`, i.`imageHashDhash`, i.`imageHashAhash`, i.`imageColorHistogram` ' +
        'FROM `image_product_entity` i INNER JOIN `products` p ON p.`id` = i.`productId` ' +
        'WHERE p.`status` IN (?) AND i.`imageHashPhash` IS NOT NULL',
      [SEARCHABLE_STATUSES],
    );
    for (const i of images) {
      const e = map.get(i.productId);
      const sig = parseSig(i.imageHashPhash, i.imageHashDhash, i.imageHashAhash, i.imageColorHistogram);
      if (e && sig) e.sigs.push(sig);
    }

    try {
      const vectors: any[] = await this.dataSource.query(
        'SELECT e.`productId`, e.`vector`, e.`dims`, e.`model` FROM `product_search_embeddings` e INNER JOIN `products` p ON p.`id` = e.`productId` WHERE p.`status` IN (?)',
        [SEARCHABLE_STATUSES],
      );
      for (const v of vectors) {
        if (v.model !== this.embeddingModel || Number(v.dims) !== this.dims) continue;
        const e = map.get(v.productId);
        if (e) e.vec = decodeVector(v.vector);
      }
    } catch (e: any) {
      this.logger.warn(`Table product_search_embeddings absente : recherche visuelle seule (${e?.message})`);
    }

    this.index = [...map.values()];
    this.indexLoadedAt = Date.now();
    const withVec = this.index.filter((e) => e.vec).length;
    const withSig = this.index.filter((e) => e.sigs.length).length;
    this.logger.log(`Index chargé : ${this.index.length} produits (${withSig} avec empreinte, ${withVec} avec embedding) en ${Date.now() - started} ms`);
  }

  /** Produits complets de la page (requêtes séparées par relation) */
  private async loadProducts(ids: string[]): Promise<Product[]> {
    if (!ids.length) return [];
    return this.dataSource.getRepository(Product).find({
      where: { id: In(ids) } as any,
      relations: { company: true, category: true, brand: true, images: true, measure: true } as any,
      relationLoadStrategy: 'query',
      loadEagerRelations: false,
    });
  }

  /** Retire les données techniques lourdes de la réponse */
  private clean(p: any) {
    const out = { ...p };
    for (const k of ['imageColorHistogram', 'imageOrbDescriptors', 'imageHashPhash', 'imageHashDhash', 'imageHashAhash', 'imageHash', 'imageHashBlocks']) delete out[k];
    if (Array.isArray(out.images)) {
      out.images = out.images.map((i: any) => ({ id: i.id, url: i.url }));
    }
    return out;
  }

  // ============================================================
  // 4) INDEXATION AUTOMATIQUE (embeddings + empreintes manquantes)
  // ============================================================
  @Cron('20 */2 * * * *')
  async scheduledIndex() {
    if (String(process.env.IMAGE_SEARCH_INDEXER ?? 'true').toLowerCase() === 'false') return;
    await this.runIndexer(1);
  }

  /** Une ou plusieurs passes d'indexation (lots de 100 produits) */
  async runIndexer(passes = 1): Promise<void> {
    if (this.indexing) return;
    this.indexing = true;
    const stats = { at: new Date(), embedded: 0, hashedProducts: 0, hashedImages: 0 } as any;
    try {
      for (let i = 0; i < passes; i++) {
        const a = this.semanticEnabled ? await this.indexEmbeddings(100) : 0;
        const b = await this.hashProducts(50);
        const c = await this.hashImages(100);
        stats.embedded += a;
        stats.hashedProducts += b;
        stats.hashedImages += c;
        if (!a && !b && !c) break;
      }
      if (stats.embedded || stats.hashedProducts || stats.hashedImages) {
        this.logger.log(`Indexation : ${stats.embedded} embedding(s), ${stats.hashedProducts} produit(s) et ${stats.hashedImages} image(s) empreintés`);
        await this.ensureIndex(true);
      }
    } catch (e: any) {
      stats.error = e?.message;
      this.logger.warn(`Indexation interrompue : ${e?.message}`);
    } finally {
      this.lastIndexRun = stats;
      this.indexing = false;
    }
  }

  /** Texte décrivant le produit (ce que « voit » le moteur sémantique) */
  private productText(r: any): string {
    const desc = String(r.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
    return [r.name, r.categoryName, r.brandName, r.model, r.color, r.type, r.ingredients, desc]
      .filter((x) => !!x && String(x).trim())
      .join(' | ')
      .slice(0, 2000);
  }

  private async indexEmbeddings(batch: number): Promise<number> {
    let rows: any[];
    try {
      rows = await this.dataSource.query(
        'SELECT p.`id`, p.`name`, p.`description`, p.`model`, p.`color`, p.`type`, p.`ingredients`, p.`updatedAt`, ' +
          'c.`name` AS `categoryName`, b.`name` AS `brandName`, e.`textHash` ' +
          'FROM `products` p ' +
          'LEFT JOIN `category` c ON c.`id` = p.`category_id` ' +
          'LEFT JOIN `brands` b ON b.`id` = p.`brand_id` ' +
          'LEFT JOIN `product_search_embeddings` e ON e.`productId` = p.`id` AND e.`model` = ? AND e.`dims` = ? ' +
          'WHERE p.`status` IN (?) AND (e.`id` IS NULL OR e.`updatedAt` < p.`updatedAt`) ' +
          'ORDER BY p.`updatedAt` DESC LIMIT ?',
        [this.embeddingModel, this.dims, SEARCHABLE_STATUSES, batch],
      );
    } catch (e: any) {
      this.logger.warn(`Indexation sémantique impossible : ${e?.message}`);
      return 0;
    }
    if (!rows.length) return 0;

    const todo = rows.map((r) => ({ id: r.id, text: this.productText(r), old: r.textHash })).filter((r) => r.text);
    const changed = todo.filter((r) => sha256(r.text) !== r.old);
    const unchanged = todo.filter((r) => sha256(r.text) === r.old);
    // Texte identique (ex. seul le stock a changé) : on rafraîchit seulement la date
    if (unchanged.length) {
      await this.dataSource.query('UPDATE `product_search_embeddings` SET `updatedAt` = NOW(6) WHERE `productId` IN (?)', [unchanged.map((r) => r.id)]);
    }
    if (!changed.length) return unchanged.length;

    const vectors = await this.embed(changed.map((r) => r.text));
    if (!vectors || vectors.length !== changed.length) return 0;
    const repo = this.dataSource.getRepository(ProductSearchEmbedding);
    for (let i = 0; i < changed.length; i++) {
      const r = changed[i];
      await repo.upsert(
        { productId: r.id, model: this.embeddingModel, dims: this.dims, vector: encodeVector(vectors[i]), textHash: sha256(r.text) } as any,
        ['productId'],
      );
    }
    return changed.length + unchanged.length;
  }

  /** Lit une image (fichier local du domaine média / uploads, sinon téléchargement) */
  private async readImage(url: string): Promise<Buffer | null> {
    const rel = storedRelativePath(url);
    if (rel) {
      try {
        return await fs.readFile(join(this.uploadPath, rel));
      } catch {
        /* pas en local : téléchargement */
      }
    }
    if (!/^https?:\/\//i.test(url)) return null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.length && buf.length < 15 * 1024 * 1024 ? buf : null;
    } catch {
      return null;
    }
  }

  private async hashProducts(batch: number): Promise<number> {
    const rows: any[] = await this.dataSource.query(
      "SELECT `id`, `image` FROM `products` WHERE `status` IN (?) AND `imageHashPhash` IS NULL AND `image` IS NOT NULL AND `image` <> '' LIMIT ?",
      [SEARCHABLE_STATUSES, batch + this.failedHash.size],
    );
    let done = 0;
    for (const r of rows) {
      const key = `p:${r.id}`;
      if (this.failedHash.has(key) || done >= batch) continue;
      const buf = await this.readImage(r.image);
      try {
        if (!buf) throw new Error('image introuvable');
        const sig = await computeImageSignature(buf);
        await this.dataSource.query(
          'UPDATE `products` SET `imageHashPhash` = ?, `imageHashDhash` = ?, `imageHashAhash` = ?, `imageColorHistogram` = ? WHERE `id` = ?',
          [sig.phash, sig.dhash, sig.ahash, JSON.stringify(sig.histogram), r.id],
        );
        done++;
      } catch {
        this.failedHash.add(key);
      }
    }
    return done;
  }

  private async hashImages(batch: number): Promise<number> {
    const rows: any[] = await this.dataSource.query(
      'SELECT i.`id`, i.`url` FROM `image_product_entity` i INNER JOIN `products` p ON p.`id` = i.`productId` ' +
        "WHERE p.`status` IN (?) AND i.`imageHashPhash` IS NULL AND i.`url` IS NOT NULL AND i.`url` <> '' LIMIT ?",
      [SEARCHABLE_STATUSES, batch + this.failedHash.size],
    );
    let done = 0;
    for (const r of rows) {
      const key = `i:${r.id}`;
      if (this.failedHash.has(key) || done >= batch) continue;
      // Vidéos : pas d'empreinte image
      if (/\.(mp4|mov|webm|m4v|avi)(\?|$)/i.test(r.url)) {
        this.failedHash.add(key);
        continue;
      }
      const buf = await this.readImage(r.url);
      try {
        if (!buf) throw new Error('image introuvable');
        const sig = await computeImageSignature(buf);
        await this.dataSource.getRepository(ImageProductEntity).update(
          { id: r.id } as any,
          { imageHashPhash: sig.phash, imageHashDhash: sig.dhash, imageHashAhash: sig.ahash, imageColorHistogram: JSON.stringify(sig.histogram) } as any,
        );
        done++;
      } catch {
        this.failedHash.add(key);
      }
    }
    return done;
  }

  // ============================================================
  // 5) ADMINISTRATION
  // ============================================================
  private assertAdmin(user: UserEntity, lang: string) {
    if (user?.role !== UserRole.SUPER_ADMIN && user?.role !== UserRole.ADMIN) {
      throw new ForbiddenException(this.t('image_search.admin_only', lang));
    }
  }

  async status(user: UserEntity, lang: string) {
    this.assertAdmin(user, lang);
    const one = async (sql: string, params: any[] = []) => {
      try {
        const r = await this.dataSource.query(sql, params);
        return Number(r?.[0]?.n) || 0;
      } catch {
        return null;
      }
    };
    const [products, productsHashed, images, imagesHashed, embedded] = await Promise.all([
      one('SELECT COUNT(*) AS n FROM `products` WHERE `status` IN (?)', [SEARCHABLE_STATUSES]),
      one('SELECT COUNT(*) AS n FROM `products` WHERE `status` IN (?) AND `imageHashPhash` IS NOT NULL', [SEARCHABLE_STATUSES]),
      one('SELECT COUNT(*) AS n FROM `image_product_entity` i INNER JOIN `products` p ON p.`id` = i.`productId` WHERE p.`status` IN (?)', [SEARCHABLE_STATUSES]),
      one('SELECT COUNT(*) AS n FROM `image_product_entity` i INNER JOIN `products` p ON p.`id` = i.`productId` WHERE p.`status` IN (?) AND i.`imageHashPhash` IS NOT NULL', [SEARCHABLE_STATUSES]),
      one(
        'SELECT COUNT(*) AS n FROM `product_search_embeddings` e INNER JOIN `products` p ON p.`id` = e.`productId` WHERE p.`status` IN (?) AND e.`model` = ? AND e.`dims` = ?',
        [SEARCHABLE_STATUSES, this.embeddingModel, this.dims],
      ),
    ]);
    return {
      message: this.t('image_search.status_fetched', lang),
      data: {
        mode: this.semanticEnabled ? 'SEMANTIC' : 'VISUAL',
        openaiConfigured: !!process.env.OPENAI_API_KEY,
        visionModel: this.visionModel,
        embeddingModel: this.embeddingModel,
        dims: this.dims,
        products,
        productsWithFingerprint: productsHashed,
        images,
        imagesWithFingerprint: imagesHashed,
        productsWithEmbedding: embedded,
        embeddingTableReady: embedded !== null,
        indexInMemory: this.index.length,
        indexLoadedAt: this.indexLoadedAt ? new Date(this.indexLoadedAt) : null,
        indexing: this.indexing,
        lastIndexRun: this.lastIndexRun,
        unreadableImages: this.failedHash.size,
      },
    };
  }

  /** Lance l'indexation complète en arrière-plan (full = recalculer tous les embeddings) */
  async reindex(user: UserEntity, full: boolean, lang: string) {
    this.assertAdmin(user, lang);
    if (full) {
      await this.dataSource.query('DELETE FROM `product_search_embeddings`').catch(() => undefined);
      this.failedHash.clear();
    }
    void this.runIndexer(1000);
    return { message: this.t('image_search.reindex_started', lang), data: { full, running: true } };
  }
}
