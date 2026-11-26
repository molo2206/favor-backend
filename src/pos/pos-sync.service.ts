import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { I18nService } from 'src/libs/common/src';
import { InventoryService } from 'src/inventory/inventory.service';
import { CompanyCapabilitiesService } from 'src/inventory/capabilities/company-capabilities.service';
import { OfflineOp } from 'src/inventory/capabilities/company-capabilities';
import { StockMovementSource } from 'src/inventory/enums/inventory.enum';
import { PosService } from './pos.service';
import { PosSaleSource } from './enums/pos.enum';
import { PosTerminal } from './entities/pos-terminal.entity';
import { PosSyncOperation, SyncOpStatus } from './entities/pos-sync-operation.entity';
import { SyncBatchDto, SyncOperationDto, SyncOpType } from './dto/pos-sync.dto';

/**
 * Synchronisation d'une caisse hors-ligne : la caisse envoie par LOTS ses opérations
 * (ventes, entrées/sorties de stock) accumulées hors-ligne. Le serveur les applique :
 *  - DANS L'ORDRE de la séquence par terminal,
 *  - de façon IDEMPOTENTE (une opération n'est appliquée qu'une fois : clientOpId),
 *  - en respectant les opérations autorisées hors-ligne selon le TYPE d'entreprise,
 *  - le STOCK étant arbitré côté serveur (un manque devient un CONFLICT, pas un stock faux).
 */
@Injectable()
export class PosSyncService {
  private readonly logger = new Logger(PosSyncService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
    private readonly inventory: InventoryService,
    private readonly capabilities: CompanyCapabilitiesService,
    private readonly pos: PosService,
  ) {}

  private t(key: string, lang: string, args?: any) {
    return this.i18n.translate(key, lang, args);
  }

  async applyBatch(companyId: string, dto: SyncBatchDto, userId: string, lang: string) {
    const caps = await this.capabilities.forCompany(companyId);
    if (!caps.hasPOS) throw new ForbiddenException(this.t('pos.not_enabled_for_type', lang));
    const term = await this.pos.getTerminal(companyId, dto.terminalId, lang);

    const opsRepo = this.dataSource.getRepository(PosSyncOperation);
    const results: any[] = [];
    let maxSeq = Number(term.lastSyncSeq) || 0;

    // Appliquer dans l'ordre de séquence
    const ordered = [...dto.operations].sort((a, b) => Number(a.seq) - Number(b.seq));

    for (const op of ordered) {
      // Idempotence : déjà traitée ?
      const existing = await opsRepo.findOne({ where: { terminalId: term.id, clientOpId: op.clientOpId } });
      if (existing) {
        results.push({ clientOpId: op.clientOpId, seq: Number(op.seq), status: SyncOpStatus.DUPLICATE, data: existing.result ?? null });
        maxSeq = Math.max(maxSeq, Number(op.seq));
        continue;
      }

      // Autorisation hors-ligne selon le type d'entreprise
      const guard = this.offlineGuard(op, caps);
      if (!guard.allowed) {
        const rec = await this.record(companyId, term.id, op, SyncOpStatus.REJECTED, { reason: guard.reason });
        results.push({ clientOpId: op.clientOpId, seq: Number(op.seq), status: SyncOpStatus.REJECTED, error: guard.reason });
        maxSeq = Math.max(maxSeq, Number(op.seq));
        void rec;
        continue;
      }

      // Application
      let status: SyncOpStatus = SyncOpStatus.APPLIED;
      let data: any = null;
      let error: string | null = null;
      try {
        data = await this.applyOne(companyId, op, userId, lang);
      } catch (e: any) {
        if (e instanceof BadRequestException) {
          // Stock insuffisant / ordonnance → conflit métier (la caisse devra réconcilier)
          status = SyncOpStatus.CONFLICT;
          error = this.errMessage(e);
        } else {
          status = SyncOpStatus.FAILED;
          error = this.errMessage(e);
          this.logger.error(`Synchro op ${op.clientOpId} échouée : ${error}`);
        }
      }

      await this.record(companyId, term.id, op, status, status === SyncOpStatus.APPLIED ? data : { error });
      results.push({ clientOpId: op.clientOpId, seq: Number(op.seq), status, data: status === SyncOpStatus.APPLIED ? data : undefined, error: error ?? undefined });
      maxSeq = Math.max(maxSeq, Number(op.seq));
    }

    // Avancer la séquence du terminal
    if (maxSeq > Number(term.lastSyncSeq)) {
      await this.dataSource.getRepository(PosTerminal).update({ id: term.id }, { lastSyncSeq: maxSeq });
    }

    return {
      terminalId: term.id,
      lastSeq: maxSeq,
      applied: results.filter((r) => r.status === SyncOpStatus.APPLIED).length,
      conflicts: results.filter((r) => r.status === SyncOpStatus.CONFLICT || r.status === SyncOpStatus.REJECTED).length,
      results,
    };
  }

  /** Dernière séquence connue par le serveur (la caisse l'utilise pour reprendre) */
  async cursor(companyId: string, terminalId: string, lang: string) {
    const term = await this.pos.getTerminal(companyId, terminalId, lang);
    return { terminalId: term.id, lastSeq: Number(term.lastSyncSeq) || 0 };
  }

  // ------------------------------------------------------------
  private offlineGuard(op: SyncOperationDto, caps: { offlineEnabled: boolean; offlineAllowedOps: OfflineOp[] }): { allowed: boolean; reason?: string } {
    if (!caps.offlineEnabled) return { allowed: false, reason: 'OFFLINE_DISABLED' };
    const type = String(op.type).toUpperCase();
    const need: OfflineOp | null =
      type === SyncOpType.SALE ? OfflineOp.SALE :
      type === SyncOpType.PAYMENT ? OfflineOp.SALE : // un règlement suit l'autorisation de vente
      type === SyncOpType.PRODUCT_UPSERT ? OfflineOp.PRODUCT_MANAGE :
      type === SyncOpType.STOCK_IN ? OfflineOp.STOCK_IN :
      type === SyncOpType.STOCK_OUT ? OfflineOp.STOCK_OUT : null;
    if (!need) return { allowed: false, reason: 'UNKNOWN_OP' };
    if (!caps.offlineAllowedOps.includes(need)) return { allowed: false, reason: 'OP_NOT_ALLOWED_OFFLINE' };
    // Vente sur ordonnance hors-ligne : nécessite explicitement PRESCRIPTION_SALE
    if (type === SyncOpType.SALE && op.payload?.hasPrescription && !caps.offlineAllowedOps.includes(OfflineOp.PRESCRIPTION_SALE)) {
      return { allowed: false, reason: 'PRESCRIPTION_SALE_OFFLINE_FORBIDDEN' };
    }
    return { allowed: true };
  }

  private async applyOne(companyId: string, op: SyncOperationDto, userId: string, lang: string) {
    const type = String(op.type).toUpperCase();
    const p = op.payload || {};
    if (type === SyncOpType.SALE) {
      const res = await this.pos.createSale(companyId, { ...(p as any), clientOpId: op.clientOpId }, userId, lang, PosSaleSource.OFFLINE);
      return { saleId: (res as any)?.sale?.id ?? null, number: (res as any)?.sale?.number ?? null };
    }
    if (type === SyncOpType.PAYMENT) {
      const saleId = String(p.saleId || '');
      const res = await this.pos.addPayment(companyId, saleId, { ...(p as any), clientOpId: op.clientOpId }, userId, lang, PosSaleSource.OFFLINE);
      return { saleId, amountDue: (res as any)?.sale?.amountDue ?? null };
    }
    if (type === SyncOpType.PRODUCT_UPSERT) {
      const res = await this.pos.upsertProduct(companyId, p as any, userId, lang);
      return { productId: (res as any)?.product?.id ?? null, created: (res as any)?.created ?? false };
    }
    if (type === SyncOpType.STOCK_IN) {
      const res = await this.inventory.receive(companyId, p as any, lang, userId);
      return { balance: (res as any)?.balance ?? null };
    }
    if (type === SyncOpType.STOCK_OUT) {
      const res = await this.inventory.consume(companyId, p as any, lang, { source: StockMovementSource.SYNC, performedById: userId, reference: op.clientOpId, hasPrescription: p?.hasPrescription });
      return { balance: (res as any)?.balance ?? null };
    }
    throw new BadRequestException(this.t('pos.sync_unknown_op', lang));
  }

  private async record(companyId: string, terminalId: string, op: SyncOperationDto, status: SyncOpStatus, result: any) {
    const repo = this.dataSource.getRepository(PosSyncOperation);
    try {
      return await repo.save(repo.create({
        companyId, terminalId, clientOpId: op.clientOpId, seq: Number(op.seq), type: String(op.type).toUpperCase(), status, result: result ?? null,
      }));
    } catch (e: any) {
      // Course concurrente sur le même clientOpId : déjà enregistrée → idempotent
      if (/Duplicate|uq_pos_sync_op|ER_DUP_ENTRY/i.test(String(e?.message))) {
        return repo.findOne({ where: { terminalId, clientOpId: op.clientOpId } });
      }
      throw e;
    }
  }

  private errMessage(e: any): string {
    const r = e?.response;
    if (r && typeof r === 'object') return String(r.message || r.error || e?.message || 'error');
    return String(e?.message || 'error');
  }
}
