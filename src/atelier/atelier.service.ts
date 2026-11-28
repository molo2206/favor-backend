import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { CompanyType } from 'src/company/enum/type.company.enum';
import { AtelierSizeTierEntity } from './entities/atelier-size-tier.entity';
import { AtelierCommissionEntity } from './entities/atelier-commission.entity';
import { AtelierOrderChargeEntity } from './entities/atelier-order-charge.entity';
import {
  CommissionPreviewDto,
  QuoteDto,
  QuoteItemDto,
  UpsertCommissionDto,
  UpsertSizeTierDto,
} from './dto/atelier.dto';

/** Arrondi monétaire à 2 décimales */
const money = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

@Injectable()
export class AtelierService {
  constructor(
    @InjectRepository(AtelierSizeTierEntity)
    private readonly tiers: Repository<AtelierSizeTierEntity>,
    @InjectRepository(AtelierCommissionEntity)
    private readonly commissions: Repository<AtelierCommissionEntity>,
    @InjectRepository(AtelierOrderChargeEntity)
    private readonly charges: Repository<AtelierOrderChargeEntity>,
    @InjectRepository(CompanyEntity)
    private readonly companies: Repository<CompanyEntity>,
  ) {}

  // =====================================================================
  // PALIERS DE TAILLE (propres à l'entreprise)
  // =====================================================================

  listSizeTiers(companyId: string, productId?: string) {
    const where: any = { companyId };
    if (productId) where.productId = productId;
    return this.tiers.find({ where, order: { productId: 'ASC', minValue: 'ASC', label: 'ASC' } });
  }

  async createSizeTier(companyId: string, dto: UpsertSizeTierDto) {
    this.assertTierRange(dto);
    const tier = this.tiers.create({
      companyId,
      productId: dto.productId || null,
      measureKey: dto.measureKey?.trim() || null,
      minValue: dto.minValue ?? null,
      maxValue: dto.maxValue ?? null,
      label: dto.label,
      surcharge: dto.surcharge ?? 0,
      currency: dto.currency || 'USD',
      isActive: dto.isActive ?? true,
    });
    return this.tiers.save(tier);
  }

  async updateSizeTier(companyId: string, id: string, dto: UpsertSizeTierDto) {
    const tier = await this.tiers.findOne({ where: { id, companyId } });
    if (!tier) throw new NotFoundException('Palier de taille introuvable');
    this.assertTierRange(dto);
    Object.assign(tier, {
      productId: dto.productId !== undefined ? (dto.productId || null) : tier.productId,
      measureKey: dto.measureKey !== undefined ? (dto.measureKey?.trim() || null) : tier.measureKey,
      minValue: dto.minValue !== undefined ? dto.minValue : tier.minValue,
      maxValue: dto.maxValue !== undefined ? dto.maxValue : tier.maxValue,
      label: dto.label ?? tier.label,
      surcharge: dto.surcharge ?? tier.surcharge,
      currency: dto.currency ?? tier.currency,
      isActive: dto.isActive ?? tier.isActive,
    });
    return this.tiers.save(tier);
  }

  async deleteSizeTier(companyId: string, id: string) {
    const res = await this.tiers.delete({ id, companyId });
    if (!res.affected) throw new NotFoundException('Palier de taille introuvable');
    return { deleted: true };
  }

  private assertTierRange(dto: UpsertSizeTierDto) {
    if (dto.measureKey && (dto.minValue == null && dto.maxValue == null)) {
      throw new BadRequestException(
        'Un palier automatique (measureKey renseigné) doit avoir au moins minValue ou maxValue',
      );
    }
    if (dto.minValue != null && dto.maxValue != null && Number(dto.minValue) > Number(dto.maxValue)) {
      throw new BadRequestException('minValue ne peut pas être supérieur à maxValue');
    }
  }

  // =====================================================================
  // DEVIS : prix selon la taille
  // =====================================================================

  /** Calcule le supplément de taille pour une ligne (un modèle) */
  private async surchargeForItem(companyId: string, item: QuoteItemDto): Promise<{ surcharge: number; applied: Array<{ label: string; surcharge: number }> }> {
    const tiers = await this.tiers.find({
      where: [
        { companyId, productId: item.productId, isActive: true },
        { companyId, productId: IsNull(), isActive: true },
      ],
    });

    const applied: Array<{ label: string; surcharge: number }> = [];
    const usedKeys = new Set<string>();

    // 1) Paliers AUTOMATIQUES (par mesure) : un seul palier retenu par clé de mesure
    const measures = item.measures || {};
    for (const t of tiers) {
      if (!t.measureKey) continue;
      const value = Number(measures[t.measureKey]);
      if (!Number.isFinite(value)) continue;
      if (usedKeys.has(t.measureKey)) continue;
      const minOk = t.minValue == null || value >= Number(t.minValue);
      const maxOk = t.maxValue == null || value <= Number(t.maxValue);
      if (minOk && maxOk) {
        applied.push({ label: t.label, surcharge: Number(t.surcharge) || 0 });
        usedKeys.add(t.measureKey);
      }
    }

    // 2) Paliers MANUELS (choisis par libellé)
    const labels = (item.tierLabels || []).map((l) => l.toLowerCase());
    if (labels.length) {
      for (const t of tiers) {
        if (t.measureKey) continue;
        if (labels.includes(String(t.label).toLowerCase())) {
          applied.push({ label: t.label, surcharge: Number(t.surcharge) || 0 });
        }
      }
    }

    const surcharge = applied.reduce((s, a) => s + a.surcharge, 0);
    return { surcharge: money(surcharge), applied };
  }

  /** Devis complet d'une commande (toutes les lignes) + aperçu commission */
  async quote(companyId: string, dto: QuoteDto) {
    const company = await this.companies.findOne({ where: { id: companyId } });
    const currency = dto.currency || 'USD';

    const lines: any[] = [];
    let confectionTotal = 0;

    for (const item of dto.items || []) {
      const qty = item.quantity && item.quantity > 0 ? item.quantity : 1;
      const base = money(item.basePrice);
      const { surcharge, applied } = await this.surchargeForItem(companyId, item);
      const unit = money(base + surcharge);
      const lineTotal = money(unit * qty);
      confectionTotal += lineTotal;
      lines.push({
        productId: item.productId,
        quantity: qty,
        basePrice: base,
        sizeSurcharge: surcharge,
        unitPrice: unit,
        lineTotal,
        appliedTiers: applied,
      });
    }

    confectionTotal = money(confectionTotal);
    const commission = await this.computeCommission(confectionTotal, companyId, company?.typeCompany);

    return {
      currency,
      items: lines,
      confectionAmount: confectionTotal,
      commission, // { rate, commissionAmount, atelierAmount }
    };
  }

  // =====================================================================
  // COMMISSION PLATEFORME
  // =====================================================================

  /** Résout le taux applicable : entreprise d'abord, puis type, sinon 0 */
  async resolveCommission(companyId?: string | null, companyType?: CompanyType | null) {
    if (companyId) {
      const byCompany = await this.commissions.findOne({ where: { companyId, isActive: true } });
      if (byCompany) return byCompany;
    }
    if (companyType) {
      const byType = await this.commissions.findOne({ where: { companyId: IsNull(), companyType, isActive: true } });
      if (byType) return byType;
    }
    return null;
  }

  /** Calcule la part plateforme et la part atelier pour un montant de confection */
  async computeCommission(confectionAmount: number, companyId?: string | null, companyType?: CompanyType | null) {
    const rule = await this.resolveCommission(companyId, companyType);
    const base = money(confectionAmount);
    const rate = rule ? Number(rule.ratePercent) || 0 : 0;
    let commissionAmount = money((base * rate) / 100);
    if (rule?.minFee != null && commissionAmount < Number(rule.minFee)) {
      commissionAmount = money(Number(rule.minFee));
    }
    if (commissionAmount > base) commissionAmount = base; // garde-fou
    const atelierAmount = money(base - commissionAmount);
    return { rate, commissionAmount, atelierAmount, currency: rule?.currency || 'USD' };
  }

  /** Aperçu commission (back-office / front) pour un montant donné */
  async previewCommission(companyId: string, dto: CommissionPreviewDto) {
    const company = await this.companies.findOne({ where: { id: companyId } });
    return this.computeCommission(dto.confectionAmount, companyId, company?.typeCompany);
  }

  /**
   * Enregistre la répartition d'une commande (à appeler depuis le flux commande
   * au moment du paiement). Idempotent par orderId.
   */
  async recordOrderCharge(params: {
    orderId: string;
    companyId?: string | null;
    baseAmount: number;
    sizeSurcharge: number;
    companyType?: CompanyType | null;
    currency?: string;
  }) {
    const existing = await this.charges.findOne({ where: { orderId: params.orderId } });
    const baseAmount = money(params.baseAmount);
    const sizeSurcharge = money(params.sizeSurcharge);
    const confectionAmount = money(baseAmount + sizeSurcharge);
    const { rate, commissionAmount, atelierAmount, currency } = await this.computeCommission(
      confectionAmount,
      params.companyId,
      params.companyType,
    );

    const payload = {
      orderId: params.orderId,
      companyId: params.companyId || null,
      baseAmount,
      sizeSurcharge,
      confectionAmount,
      commissionRate: rate,
      commissionAmount,
      atelierAmount,
      currency: params.currency || currency || 'USD',
    };

    if (existing) {
      Object.assign(existing, payload);
      return this.charges.save(existing);
    }
    return this.charges.save(this.charges.create(payload));
  }

  getOrderCharge(orderId: string) {
    return this.charges.findOne({ where: { orderId } });
  }

  // =====================================================================
  // COMMISSION — ADMINISTRATION (SUPER_ADMIN)
  // =====================================================================

  listCommissions() {
    return this.commissions.find({ order: { companyType: 'ASC', companyId: 'ASC' } });
  }

  async upsertCommission(dto: UpsertCommissionDto) {
    if (!dto.companyId && !dto.companyType) {
      throw new BadRequestException('Indiquez une entreprise (companyId) ou un type (companyType)');
    }
    // Clé logique : (companyId) OU (companyType avec companyId NULL)
    const where = dto.companyId
      ? { companyId: dto.companyId }
      : { companyId: IsNull(), companyType: dto.companyType };
    let rule = await this.commissions.findOne({ where: where as any });
    if (!rule) {
      rule = this.commissions.create({
        companyId: dto.companyId || null,
        companyType: dto.companyId ? null : (dto.companyType ?? null),
      });
    }
    rule.ratePercent = dto.ratePercent ?? 0;
    rule.minFee = dto.minFee ?? null;
    rule.currency = dto.currency || rule.currency || 'USD';
    rule.isActive = dto.isActive ?? true;
    return this.commissions.save(rule);
  }

  async deleteCommission(id: string) {
    const res = await this.commissions.delete({ id });
    if (!res.affected) throw new NotFoundException('Règle de commission introuvable');
    return { deleted: true };
  }
}
