import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { I18nService } from 'src/libs/common/src';
import { UserPaymentMethodEntity, UserPaymentMethodType } from './entities/user-payment-method.entity';
import { CreateUserPaymentMethodDto, UpdateUserPaymentMethodDto } from './dto/user-payment-method.dto';

/** Nombre maximum de moyens de paiement par utilisateur */
const MAX_METHODS = 10;

/** Ce qu'un moyen enregistré fournit au paiement */
export interface ResolvedPaymentMethod {
  id: string;
  paymentMethod: UserPaymentMethodType;
  provider?: string;
  phone?: string;
  currency?: string;
}

/**
 * ✅ Moyens de paiement de chaque utilisateur : Mobile Money, FPay, Cash.
 * Utilisés par les commandes, les courses taxi et les annonces (champ `paymentMethodId`).
 */
@Injectable()
export class UserPaymentMethodsService {
  private readonly logger = new Logger(UserPaymentMethodsService.name);

  constructor(
    @InjectRepository(UserPaymentMethodEntity)
    private readonly repo: Repository<UserPaymentMethodEntity>,
    private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
  ) { }

  private t(key: string, lang: string, params?: Record<string, any>) {
    return this.i18n.translate(key, lang, params);
  }

  private view(m: UserPaymentMethodEntity) {
    return {
      id: m.id,
      type: m.type,
      label: m.label ?? null,
      provider: m.provider ?? null,
      phone: m.phone ?? null,
      /** Numéro masqué pour l'affichage (2439*****000) */
      maskedPhone: m.phone ? `${m.phone.slice(0, 4)}${'*'.repeat(Math.max(0, m.phone.length - 7))}${m.phone.slice(-3)}` : null,
      fpayAccount: m.fpayAccount ?? null,
      currency: m.currency ?? null,
      isDefault: !!m.isDefault,
      lastUsedAt: m.lastUsedAt ?? null,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
  }

  private async findOwned(userId: string, id: string, lang: string) {
    const m = await this.repo.findOne({ where: { id, userId, isActive: true } });
    if (!m) throw new NotFoundException(this.t('payment_method.not_found', lang));
    return m;
  }

  /** Règles par type (champs obligatoires / inutiles) */
  private normalize(type: UserPaymentMethodType, data: Partial<UserPaymentMethodEntity>, lang: string) {
    if (type === UserPaymentMethodType.MOBILE_MONEY) {
      if (!data.provider || !data.phone) throw new BadRequestException(this.t('payment_method.mobile_money_required', lang));
      data.fpayAccount = null;
    } else if (type === UserPaymentMethodType.FPAY) {
      data.provider = null;
      data.phone = null;
    } else {
      data.provider = null;
      data.phone = null;
      data.fpayAccount = null;
    }
    return data;
  }

  /** Doublon : même numéro Mobile Money, même compte FPay, un seul Cash */
  private async assertNoDuplicate(userId: string, type: UserPaymentMethodType, data: Partial<UserPaymentMethodEntity>, lang: string, exceptId?: string) {
    const qb = this.repo
      .createQueryBuilder('m')
      .where('m.userId = :userId AND m.isActive = 1 AND m.type = :type', { userId, type });
    if (exceptId) qb.andWhere('m.id <> :exceptId', { exceptId });
    if (type === UserPaymentMethodType.MOBILE_MONEY) qb.andWhere('m.phone = :phone', { phone: data.phone });
    else if (type === UserPaymentMethodType.FPAY) {
      if (data.fpayAccount) qb.andWhere('m.fpayAccount = :acc', { acc: data.fpayAccount });
      else qb.andWhere('m.fpayAccount IS NULL');
    }
    if (await qb.getCount()) throw new ConflictException(this.t('payment_method.already_exists', lang));
  }

  /** Un seul moyen par défaut */
  private async makeDefault(userId: string, id: string) {
    await this.dataSource.transaction(async (m) => {
      await m.update(UserPaymentMethodEntity, { userId, isDefault: true }, { isDefault: false });
      await m.update(UserPaymentMethodEntity, { id, userId }, { isDefault: true });
    });
  }

  // ============================================================
  // GESTION (utilisateur)
  // ============================================================
  async list(userId: string, lang = 'fr') {
    const methods = await this.repo.find({
      where: { userId, isActive: true },
      order: { isDefault: 'DESC', lastUsedAt: 'DESC', createdAt: 'DESC' },
    });
    const def = methods.find((m) => m.isDefault) ?? null;
    return {
      message: this.t('payment_method.list', lang),
      data: {
        types: Object.values(UserPaymentMethodType),
        defaultMethodId: def?.id ?? null,
        methods: methods.map((m) => this.view(m)),
      },
    };
  }

  async create(userId: string, dto: CreateUserPaymentMethodDto, lang = 'fr') {
    const count = await this.repo.count({ where: { userId, isActive: true } });
    if (count >= MAX_METHODS) throw new BadRequestException(this.t('payment_method.max_reached', lang, { max: MAX_METHODS }));

    const data = this.normalize(dto.type, {
      label: dto.label?.trim() || null,
      provider: dto.provider ?? null,
      phone: dto.phone ?? null,
      fpayAccount: dto.fpayAccount?.trim() || null,
      currency: dto.currency ?? null,
    }, lang);
    await this.assertNoDuplicate(userId, dto.type, data, lang);

    const saved = await this.repo.save(this.repo.create({ ...data, userId, type: dto.type, isDefault: false, isActive: true }));
    // Premier moyen ou demandé : par défaut
    if (dto.isDefault || count === 0) await this.makeDefault(userId, saved.id);
    return { message: this.t('payment_method.created', lang), data: this.view(await this.findOwned(userId, saved.id, lang)) };
  }

  async update(userId: string, id: string, dto: UpdateUserPaymentMethodDto, lang = 'fr') {
    const m = await this.findOwned(userId, id, lang);
    const data = this.normalize(m.type, {
      label: dto.label !== undefined ? dto.label?.trim() || null : m.label,
      provider: dto.provider ?? m.provider,
      phone: dto.phone ?? m.phone,
      fpayAccount: dto.fpayAccount !== undefined ? dto.fpayAccount?.trim() || null : m.fpayAccount,
      currency: dto.currency ?? m.currency,
    }, lang);
    await this.assertNoDuplicate(userId, m.type, data, lang, m.id);
    await this.repo.update({ id: m.id }, data);
    if (dto.isDefault) await this.makeDefault(userId, m.id);
    return { message: this.t('payment_method.updated', lang), data: this.view(await this.findOwned(userId, m.id, lang)) };
  }

  async setDefault(userId: string, id: string, lang = 'fr') {
    const m = await this.findOwned(userId, id, lang);
    await this.makeDefault(userId, m.id);
    return { message: this.t('payment_method.default_set', lang), data: this.view(await this.findOwned(userId, m.id, lang)) };
  }

  async remove(userId: string, id: string, lang = 'fr') {
    const m = await this.findOwned(userId, id, lang);
    await this.repo.delete({ id: m.id });
    // Le défaut supprimé : le plus récent devient le défaut
    if (m.isDefault) {
      const next = await this.repo.findOne({ where: { userId, isActive: true }, order: { lastUsedAt: 'DESC', createdAt: 'DESC' } });
      if (next) await this.makeDefault(userId, next.id);
    }
    return { message: this.t('payment_method.deleted', lang), data: { id: m.id } };
  }

  // ============================================================
  // UTILISATION AU PAIEMENT (commandes, courses, annonces)
  // ============================================================
  /** Moyen enregistré → mode, opérateur, numéro. Erreur si le moyen n'appartient pas à l'utilisateur. */
  async resolve(userId: string, id: string, lang = 'fr'): Promise<ResolvedPaymentMethod> {
    const m = await this.findOwned(userId, id, lang);
    this.repo.update({ id: m.id }, { lastUsedAt: new Date() }).catch((e) => this.logger.warn(`lastUsedAt ${m.id} : ${e?.message}`));
    return {
      id: m.id,
      paymentMethod: m.type,
      provider: m.provider ?? undefined,
      phone: m.phone ?? undefined,
      currency: m.currency ?? undefined,
    };
  }

  /**
   * Complète un DTO de paiement à partir de `paymentMethodId` (sans écraser ce que l'app a envoyé
   * explicitement pour provider / phone / currency). Le mode du moyen enregistré s'applique.
   */
  async applyTo<T extends { paymentMethodId?: string; paymentMethod?: any; provider?: string; phone?: string; currency?: string }>(
    dto: T,
    userId: string,
    lang = 'fr',
    options: { allowed?: string[]; setCurrency?: boolean } = {},
  ): Promise<T> {
    if (!dto?.paymentMethodId) return dto;
    const r = await this.resolve(userId, dto.paymentMethodId, lang);
    if (options.allowed && !options.allowed.includes(r.paymentMethod)) {
      throw new BadRequestException(this.t('payment_method.not_allowed_here', lang, { method: r.paymentMethod }));
    }
    dto.paymentMethod = r.paymentMethod as any;
    if (r.paymentMethod === UserPaymentMethodType.MOBILE_MONEY) {
      if (!dto.provider) dto.provider = r.provider;
      if (!dto.phone) dto.phone = r.phone;
    }
    if (options.setCurrency && !dto.currency && r.currency) dto.currency = r.currency;
    return dto;
  }
}
