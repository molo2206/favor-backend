// src/storage-admin/rejected-cleanup.service.ts
import { BadRequestException, ConflictException, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { I18nService } from 'src/libs/common/src';
import { AuditService } from 'src/audit/audit.service';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { AuditCategory, AuditSeverity } from 'src/audit/enum/audit.enums';
import { storedRelativePath } from 'src/files/media-url.util';
import { FileManagerService } from './file-manager.service';
import { FileReferencesService, fileStem } from './file-references.service';
import { PurgeRejectedDto } from './file-manager.dto';
import { getRoot, human } from './storage-roots';

type Actor = { id?: string | null; fullName?: string | null };

/**
 * Tables qui empêchent la suppression (données à conserver : commandes, paiements, réservations…).
 * [table, colonne, libellé]
 */
const PRODUCT_BLOCKERS: [string, string, string][] = [
  ['order_items', 'productId', 'commandes'],
  ['sub_order_items', 'productId', 'sous-commandes'],
  ['reservations', 'productId', 'réservations'],
  ['classified_payments', 'productId', 'paiements d\'annonces'],
  ['reservations_vehicules', 'product_id', 'réservations de véhicules'],
];

const COMPANY_BLOCKERS: [string, string, string][] = [
  ['sub_orders', 'companyId', 'commandes'],
  ['company_transactions', 'companyId', 'transactions'],
  ['shipments', 'pickupCompanyId', 'colis'],
  ['lta', 'shipperId', 'LTA'],
  ['trips', 'company_id', 'voyages'],
  ['room', 'companyId', 'chambres'],
  ['vehicles', 'company_id', 'véhicules'],
  ['services', 'companyId', 'services'],
  ['hr_employees', 'companyId', 'employés'],
  ['hr_payroll_runs', 'companyId', 'paies'],
  ['bo_fleet_vehicles', 'companyId', 'véhicules de flotte'],
  ['commercial_customers', 'companyId', 'clients commerciaux'],
];

type ProductRow = { id: string; name: string; companyId: string | null; image: string | null; updatedAt: Date };
type CompanyRow = { id: string; companyName: string; logo: string | null; banner: string | null; registrationDocumentUrl: string | null; createdAt: Date | null };

/**
 * ✅ PURGE DES PRODUITS ET ENTREPRISES REJETÉS (super admin)
 *  - Produits status = REJECTED depuis au moins N jours (updatedAt) : ligne + images (image_product_entity,
 *    attributs, variations… en cascade) + fichiers des images sur le serveur (et leurs miniatures).
 *  - Entreprises status = REJECTED (créées il y a au moins N jours) : leurs produits rejetés, liens utilisateurs,
 *    paramètres… puis l'entreprise + logo, bannière, document d'immatriculation.
 *  - Jamais supprimé : produit / entreprise lié à des commandes, paiements, réservations, colis, employés…
 *    (signalé dans le rapport avec la raison).
 *  - Les fichiers vont dans la corbeille (30 jours, restaurables) sauf permanentFiles = true ;
 *    un fichier encore utilisé ailleurs en base n'est jamais supprimé.
 *  - dryRun = true par défaut : aperçu sans rien supprimer.
 */
@Injectable()
export class RejectedCleanupService {
  private readonly logger = new Logger(RejectedCleanupService.name);
  private running = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly files: FileManagerService,
    private readonly refs: FileReferencesService,
    @Optional() private readonly i18n?: I18nService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  private t(key: string, lang = 'fr', params?: Record<string, any>): string {
    try {
      return this.i18n ? this.i18n.translate(`storage_admin.${key}`, lang, params) : key;
    } catch {
      return key;
    }
  }

  private get defaultDays(): number {
    const n = Number(process.env.PURGE_REJECTED_MIN_DAYS ?? 30);
    return Number.isFinite(n) && n >= 0 ? n : 30;
  }

  // ============================================================
  // OUTILS
  // ============================================================
  /** { id → [raisons] } : lignes liées dans les tables bloquantes (tables absentes ignorées) */
  private async blockers(ids: string[], list: [string, string, string][]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (!ids.length) return out;
    for (const [table, col, label] of list) {
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        try {
          const rows: any[] = await this.dataSource.query(
            `SELECT \`${col}\` AS id, COUNT(*) AS n FROM \`${table}\` WHERE \`${col}\` IN (?) GROUP BY \`${col}\``,
            [chunk],
          );
          for (const r of rows) {
            const list2 = out.get(r.id) ?? [];
            list2.push(`${Number(r.n)} ${label}`);
            out.set(r.id, list2);
          }
        } catch {
          /* table / colonne absente */
        }
      }
    }
    return out;
  }

  private fkTable(e: any): string | null {
    const m = String(e?.sqlMessage ?? e?.message ?? '').match(/fails \(`[^`]+`\.`([^`]+)`/);
    return m?.[1] ?? null;
  }

  /** Fichier local d'une URL enregistrée : racine storage (UPLOAD_PATH) ou legacy (<projet>/uploads) */
  private locate(url: string | null | undefined): { rootId: string; rel: string } | null {
    if (!url) return null;
    const rel = storedRelativePath(url) ?? (!/^https?:\/\//i.test(url) && !url.includes('..') ? url.replace(/^\/+/, '').replace(/^uploads\//, '') : null);
    if (!rel) return null;
    for (const rootId of ['storage', 'legacy']) {
      try {
        const root = getRoot(rootId);
        if (fs.existsSync(path.join(root.path, rel))) return { rootId, rel };
      } catch {
        /* racine absente */
      }
    }
    return null;
  }

  private sizeOf(loc: { rootId: string; rel: string }): number {
    try {
      return fs.statSync(path.join(getRoot(loc.rootId).path, loc.rel)).size;
    } catch {
      return 0;
    }
  }

  private async productImages(ids: string[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    for (let i = 0; i < ids.length; i += 500) {
      const rows: any[] = await this.dataSource
        .query('SELECT `productId`, `url` FROM `image_product_entity` WHERE `productId` IN (?)', [ids.slice(i, i + 500)])
        .catch(() => []);
      for (const r of rows) {
        const l = out.get(r.productId) ?? [];
        if (r.url) l.push(r.url);
        out.set(r.productId, l);
      }
    }
    return out;
  }

  // ============================================================
  // APERÇU / PURGE
  // ============================================================
  async purge(dto: PurgeRejectedDto, user: Actor | null, lang = 'fr') {
    const dryRun = dto.dryRun !== false;
    if (!dryRun && dto.confirm !== 'SUPPRIMER') throw new BadRequestException(this.t('purge_confirm', lang));
    if (!dryRun && this.running) throw new ConflictException(this.t('purge_running', lang));
    const target = dto.target ?? 'ALL';
    const days = dto.olderThanDays ?? this.defaultDays;
    const cutoff = new Date(Date.now() - days * 86400000);
    const limit = dto.limit ?? 500;

    // ---------- Sélection ----------
    let products: ProductRow[] = [];
    if (target !== 'COMPANIES') {
      const params: any[] = ['REJECTED', cutoff];
      let sql = 'SELECT `id`, `name`, `companyId`, `image`, `updatedAt` FROM `products` WHERE `status` = ? AND `updatedAt` <= ?';
      if (dto.productIds?.length) {
        sql += ' AND `id` IN (?)';
        params.push(dto.productIds);
      }
      products = await this.dataSource.query(`${sql} ORDER BY \`updatedAt\` ASC LIMIT ${limit}`, params);
    }
    let companies: CompanyRow[] = [];
    if (target !== 'PRODUCTS') {
      const params: any[] = ['REJECTED', cutoff];
      let sql = 'SELECT `id`, `companyName`, `logo`, `banner`, `registrationDocumentUrl`, `createdAt` FROM `company` WHERE `status` = ? AND (`createdAt` IS NULL OR `createdAt` <= ?)';
      if (dto.companyIds?.length) {
        sql += ' AND `id` IN (?)';
        params.push(dto.companyIds);
      }
      companies = await this.dataSource.query(`${sql} ORDER BY \`createdAt\` ASC LIMIT ${Math.min(limit, 200)}`, params);
    }

    // ---------- Contrôles ----------
    const productBlock = await this.blockers(products.map((p) => p.id), PRODUCT_BLOCKERS);
    const companyBlock = await this.blockers(companies.map((c) => c.id), COMPANY_BLOCKERS);
    const companyProducts = new Map<string, ProductRow[]>();
    if (companies.length) {
      const all: (ProductRow & { status: string })[] = await this.dataSource.query(
        'SELECT `id`, `name`, `companyId`, `image`, `updatedAt`, `status` FROM `products` WHERE `companyId` IN (?)',
        [companies.map((c) => c.id)],
      );
      const notRejected = new Map<string, number>();
      for (const p of all) {
        if (p.status !== 'REJECTED') notRejected.set(p.companyId!, (notRejected.get(p.companyId!) ?? 0) + 1);
        else companyProducts.set(p.companyId!, [...(companyProducts.get(p.companyId!) ?? []), p]);
      }
      const cpBlock = await this.blockers(all.filter((p) => p.status === 'REJECTED').map((p) => p.id), PRODUCT_BLOCKERS);
      for (const c of companies) {
        const reasons = companyBlock.get(c.id) ?? [];
        const n = notRejected.get(c.id);
        if (n) reasons.push(`${n} produit(s) non rejeté(s)`);
        const used = (companyProducts.get(c.id) ?? []).filter((p) => cpBlock.has(p.id)).length;
        if (used) reasons.push(`${used} produit(s) rejeté(s) liés à des commandes / réservations`);
        if (reasons.length) companyBlock.set(c.id, reasons);
      }
    }

    // Images de tous les produits concernés
    const allProductIds = [...products.map((p) => p.id), ...[...companyProducts.values()].flat().map((p) => p.id)];
    const images = await this.productImages(allProductIds);
    const productFiles = (p: ProductRow) => [...new Set([p.image, ...(images.get(p.id) ?? [])].filter(Boolean) as string[])];
    const companyFiles = (c: CompanyRow) => [
      ...new Set([c.logo, c.banner, c.registrationDocumentUrl, ...(companyProducts.get(c.id) ?? []).flatMap((p) => productFiles(p))].filter(Boolean) as string[]),
    ];
    const fileSize = (urls: string[]) => urls.reduce((n, u) => n + (this.locate(u) ? this.sizeOf(this.locate(u)!) : 0), 0);

    const productPlan = products.map((p) => {
      const urls = productFiles(p);
      const reasons = productBlock.get(p.id) ?? [];
      return {
        id: p.id,
        name: p.name,
        companyId: p.companyId,
        rejectedSince: p.updatedAt,
        files: urls.length,
        filesOnServer: urls.filter((u) => this.locate(u)).length,
        sizeBytes: fileSize(urls),
        deletable: !reasons.length,
        blockedBy: reasons,
      };
    });
    // Produits d'une entreprise déjà traitée avec elle
    const inCompanies = new Set(companies.filter((c) => !companyBlock.has(c.id)).map((c) => c.id));
    const companyPlan = companies.map((c) => {
      const urls = companyFiles(c);
      const reasons = companyBlock.get(c.id) ?? [];
      return {
        id: c.id,
        name: c.companyName,
        createdAt: c.createdAt,
        rejectedProducts: (companyProducts.get(c.id) ?? []).length,
        files: urls.length,
        filesOnServer: urls.filter((u) => this.locate(u)).length,
        sizeBytes: fileSize(urls),
        deletable: !reasons.length,
        blockedBy: reasons,
      };
    });

    const summary = (deleted = false) => {
      const okP = productPlan.filter((p) => p.deletable && !(p.companyId && inCompanies.has(p.companyId)));
      const okC = companyPlan.filter((c) => c.deletable);
      const bytes = okP.reduce((n, p) => n + p.sizeBytes, 0) + okC.reduce((n, c) => n + c.sizeBytes, 0);
      return {
        dryRun: !deleted,
        olderThanDays: days,
        products: { found: productPlan.length, deletable: okP.length, blocked: productPlan.length - productPlan.filter((p) => p.deletable).length },
        companies: { found: companyPlan.length, deletable: okC.length, blocked: companyPlan.length - okC.length },
        spaceBytes: bytes,
        space: human(bytes),
      };
    };

    if (dryRun) {
      const sm = summary();
      return {
        message: this.t('purge_preview', lang, {
          products: sm.products.deletable,
          companies: sm.companies.deletable,
          blocked: sm.products.blocked + sm.companies.blocked,
          space: sm.space,
        }),
        data: { summary: sm, products: productPlan, companies: companyPlan },
      };
    }

    // ---------- Suppression ----------
    this.running = true;
    const report = {
      products: [] as { id: string; name: string; status: 'DELETED' | 'SKIPPED' | 'FAILED'; reason?: string }[],
      companies: [] as { id: string; name: string; status: 'DELETED' | 'SKIPPED' | 'FAILED'; reason?: string }[],
      filesToClean: [] as { url: string; reason: 'REJECTED_PRODUCT' | 'REJECTED_COMPANY'; context: string }[],
    };
    try {
      // 1) Entreprises rejetées (avec leurs produits rejetés)
      for (const c of companies) {
        const reasons = companyBlock.get(c.id);
        if (reasons?.length) {
          report.companies.push({ id: c.id, name: c.companyName, status: 'SKIPPED', reason: reasons.join(', ') });
          continue;
        }
        const urls = companyFiles(c);
        const prodIds = (companyProducts.get(c.id) ?? []).map((p) => p.id);
        try {
          await this.dataSource.transaction(async (m) => {
            if (prodIds.length) {
              await m.query('DELETE FROM `product_search_embeddings` WHERE `productId` IN (?)', [prodIds]).catch(() => undefined);
              await m.query('DELETE FROM `products` WHERE `id` IN (?)', [prodIds]);
            }
            await m.query('UPDATE `users` SET `activeCompanyId` = NULL WHERE `activeCompanyId` = ?', [c.id]).catch(() => undefined);
            await m.query('DELETE FROM `user_has_company` WHERE `companyId` = ?', [c.id]).catch(() => undefined);
            await m.query('DELETE FROM `company` WHERE `id` = ?', [c.id]);
          });
          report.companies.push({ id: c.id, name: c.companyName, status: 'DELETED' });
          for (const u of urls) report.filesToClean.push({ url: u, reason: 'REJECTED_COMPANY', context: `Entreprise rejetée : ${c.companyName} (${c.id})` });
        } catch (e: any) {
          const table = this.fkTable(e);
          report.companies.push({ id: c.id, name: c.companyName, status: table ? 'SKIPPED' : 'FAILED', reason: table ? `encore utilisée dans « ${table} »` : String(e?.message).slice(0, 300) });
        }
      }

      // 2) Produits rejetés
      for (const p of products) {
        if (p.companyId && inCompanies.has(p.companyId)) {
          if (report.companies.some((c) => c.id === p.companyId && c.status === 'DELETED')) {
            report.products.push({ id: p.id, name: p.name, status: 'DELETED', reason: 'supprimé avec son entreprise' });
            continue;
          }
        }
        const reasons = productBlock.get(p.id);
        if (reasons?.length) {
          report.products.push({ id: p.id, name: p.name, status: 'SKIPPED', reason: reasons.join(', ') });
          continue;
        }
        const urls = productFiles(p);
        try {
          await this.dataSource.transaction(async (m) => {
            await m.query('DELETE FROM `product_search_embeddings` WHERE `productId` = ?', [p.id]).catch(() => undefined);
            await m.query('DELETE FROM `products` WHERE `id` = ? AND `status` = ?', [p.id, 'REJECTED']);
          });
          report.products.push({ id: p.id, name: p.name, status: 'DELETED' });
          for (const u of urls) report.filesToClean.push({ url: u, reason: 'REJECTED_PRODUCT', context: `Produit rejeté : ${p.name} (${p.id})` });
        } catch (e: any) {
          const table = this.fkTable(e);
          report.products.push({ id: p.id, name: p.name, status: table ? 'SKIPPED' : 'FAILED', reason: table ? `encore utilisé dans « ${table} »` : String(e?.message).slice(0, 300) });
        }
      }

      // 3) Fichiers : seulement ceux qui ne sont plus utilisés nulle part en base
      const { stems } = await this.refs.index(true);
      let filesMoved = 0;
      let filesKept = 0;
      let freed = 0;
      const seen = new Set<string>();
      for (const f of report.filesToClean) {
        const loc = this.locate(f.url);
        if (!loc || seen.has(`${loc.rootId}:${loc.rel}`)) continue;
        seen.add(`${loc.rootId}:${loc.rel}`);
        if (stems.has(fileStem(loc.rel))) {
          filesKept++;
          continue;
        }
        const root = getRoot(loc.rootId);
        for (const rel of [loc.rel, ...this.files.thumbnailsOf(loc.rel)]) {
          const r = await this.files.toTrash(root, rel, { reason: f.reason, context: f.context, user, permanent: dto.permanentFiles }).catch(() => null);
          if (r) {
            filesMoved++;
            freed += r.sizeBytes;
          }
        }
      }
      this.refs.invalidate();

      const counts = {
        products: report.products.filter((p) => p.status === 'DELETED').length,
        companies: report.companies.filter((c) => c.status === 'DELETED').length,
        files: filesMoved,
        size: human(freed),
      };
      this.audit?.record({
        userId: user?.id ?? null,
        userName: user?.fullName ?? null,
        action: ActionType.DELETE,
        entity: 'rejected_cleanup',
        category: AuditCategory.ADMIN,
        severity: AuditSeverity.CRITICAL,
        metadata: { ...counts, filesKept, permanentFiles: !!dto.permanentFiles, olderThanDays: days },
      });
      this.logger.warn(`🧹 Purge des rejetés : ${counts.products} produit(s), ${counts.companies} entreprise(s), ${filesMoved} fichier(s) (${counts.size})`);
      return {
        message: this.t('purge_done', lang, counts),
        data: {
          summary: { ...counts, filesKept, freedBytes: freed, permanentFiles: !!dto.permanentFiles },
          products: report.products,
          companies: report.companies,
        },
      };
    } finally {
      this.running = false;
    }
  }

  /** Purge automatique chaque nuit (04:10) si PURGE_REJECTED_AUTO=true */
  @Cron('0 10 4 * * *')
  async scheduledPurge() {
    if (String(process.env.PURGE_REJECTED_AUTO ?? 'false').toLowerCase() !== 'true') return;
    try {
      await this.purge({ target: 'ALL', dryRun: false, confirm: 'SUPPRIMER', olderThanDays: this.defaultDays, limit: 500 }, { id: null, fullName: 'Purge automatique' });
    } catch (e: any) {
      this.logger.warn(`Purge automatique des rejetés : ${e?.message}`);
    }
  }
}
