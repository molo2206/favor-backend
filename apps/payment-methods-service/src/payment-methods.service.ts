import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@favor/database';
import { I18nService } from '@favor/rpc';
import { CreateUserPaymentMethodDto, RpcEnvelope, UpdateUserPaymentMethodDto, UserPaymentMethodType } from '@favor/contracts';

/** Nombre maximum de moyens de paiement par utilisateur */
const MAX_METHODS = 10;

type MethodRow = {
  id: string;
  userId: string;
  type: string;
  label: string | null;
  provider: string | null;
  phone: string | null;
  fpayAccount: string | null;
  currency: string | null;
  isDefault: boolean | number;
  isActive: boolean | number;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * ✅ Moyens de paiement des utilisateurs — version microservice (Prisma).
 * Mêmes règles, mêmes messages et même format de réponse que l'application actuelle
 * (src/users/payment-methods/user-payment-methods.service.ts).
 */
@Injectable()
export class PaymentMethodsService {
  private readonly logger = new Logger(PaymentMethodsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) { }

  private t(key: string, lang: string, params?: Record<string, any>) {
    return this.i18n.translate(key, lang, params);
  }

  /** L'utilisateur transmis par la gateway (route protégée) */
  userIdOf(m: RpcEnvelope): string {
    if (!m?.user?.id) throw new UnauthorizedException('Accès non autorisé. Veuillez vous connecter.');
    return m.user.id;
  }

  /** Même contrôle que l'application actuelle : compte existant et actif */
  private async assertActiveUser(userId: string) {
    const u = await this.prisma.users.findUnique({ where: { id: userId }, select: { id: true, isActive: true } });
    if (!u) throw new UnauthorizedException('Accès non autorisé. Veuillez vous connecter.');
    if (!u.isActive) throw new ForbiddenException('Votre compte est désactivé');
  }

  private view(m: MethodRow) {
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

  private async findOwned(userId: string, id: string, lang: string): Promise<MethodRow> {
    const m = await this.prisma.user_payment_methods.findFirst({ where: { id, userId, isActive: true } });
    if (!m) throw new NotFoundException(this.t('payment_method.not_found', lang));
    return m as MethodRow;
  }

  private normalize(type: string, data: Partial<MethodRow>, lang: string) {
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

  private async assertNoDuplicate(userId: string, type: string, data: Partial<MethodRow>, lang: string, exceptId?: string) {
    const where: any = { userId, isActive: true, type, ...(exceptId ? { NOT: { id: exceptId } } : {}) };
    if (type === UserPaymentMethodType.MOBILE_MONEY) where.phone = data.phone;
    else if (type === UserPaymentMethodType.FPAY) where.fpayAccount = data.fpayAccount ?? null;
    if (await this.prisma.user_payment_methods.count({ where })) {
      throw new ConflictException(this.t('payment_method.already_exists', lang));
    }
  }

  private async makeDefault(userId: string, id: string) {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user_payment_methods.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false, updatedAt: now } }),
      this.prisma.user_payment_methods.updateMany({ where: { id, userId }, data: { isDefault: true, updatedAt: now } }),
    ]);
  }

  // ============================================================
  // GESTION
  // ============================================================
  async list(userId: string, lang = 'fr') {
    await this.assertActiveUser(userId);
    const methods = (await this.prisma.user_payment_methods.findMany({
      where: { userId, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { lastUsedAt: 'desc' }, { createdAt: 'desc' }],
    })) as MethodRow[];
    const def = methods.find((m) => !!m.isDefault) ?? null;
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
    await this.assertActiveUser(userId);
    const count = await this.prisma.user_payment_methods.count({ where: { userId, isActive: true } });
    if (count >= MAX_METHODS) throw new BadRequestException(this.t('payment_method.max_reached', lang, { max: MAX_METHODS }));

    const data = this.normalize(dto.type, {
      label: dto.label?.trim() || null,
      provider: dto.provider ?? null,
      phone: dto.phone ?? null,
      fpayAccount: dto.fpayAccount?.trim() || null,
      currency: dto.currency ?? null,
    }, lang);
    await this.assertNoDuplicate(userId, dto.type, data, lang);

    const now = new Date();
    const id = randomUUID();
    await this.prisma.user_payment_methods.create({
      data: {
        id,
        userId,
        type: dto.type,
        label: data.label ?? null,
        provider: data.provider ?? null,
        phone: data.phone ?? null,
        fpayAccount: data.fpayAccount ?? null,
        currency: data.currency ?? null,
        isDefault: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      } as any,
    });
    if (dto.isDefault || count === 0) await this.makeDefault(userId, id);
    return { message: this.t('payment_method.created', lang), data: this.view(await this.findOwned(userId, id, lang)) };
  }

  async update(userId: string, id: string, dto: UpdateUserPaymentMethodDto, lang = 'fr') {
    await this.assertActiveUser(userId);
    const m = await this.findOwned(userId, id, lang);
    const data = this.normalize(m.type, {
      label: dto.label !== undefined ? dto.label?.trim() || null : m.label,
      provider: dto.provider ?? m.provider,
      phone: dto.phone ?? m.phone,
      fpayAccount: dto.fpayAccount !== undefined ? dto.fpayAccount?.trim() || null : m.fpayAccount,
      currency: dto.currency ?? m.currency,
    }, lang);
    await this.assertNoDuplicate(userId, m.type, data, lang, m.id);
    await this.prisma.user_payment_methods.update({
      where: { id: m.id },
      data: {
        label: data.label ?? null,
        provider: data.provider ?? null,
        phone: data.phone ?? null,
        fpayAccount: data.fpayAccount ?? null,
        currency: data.currency ?? null,
        updatedAt: new Date(),
      },
    });
    if (dto.isDefault) await this.makeDefault(userId, m.id);
    return { message: this.t('payment_method.updated', lang), data: this.view(await this.findOwned(userId, m.id, lang)) };
  }

  async setDefault(userId: string, id: string, lang = 'fr') {
    await this.assertActiveUser(userId);
    const m = await this.findOwned(userId, id, lang);
    await this.makeDefault(userId, m.id);
    return { message: this.t('payment_method.default_set', lang), data: this.view(await this.findOwned(userId, m.id, lang)) };
  }

  async remove(userId: string, id: string, lang = 'fr') {
    await this.assertActiveUser(userId);
    const m = await this.findOwned(userId, id, lang);
    await this.prisma.user_payment_methods.delete({ where: { id: m.id } });
    if (m.isDefault) {
      const next = await this.prisma.user_payment_methods.findFirst({
        where: { userId, isActive: true },
        orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
      });
      if (next) await this.makeDefault(userId, next.id);
    }
    return { message: this.t('payment_method.deleted', lang), data: { id: m.id } };
  }

  /** Moyen enregistré → mode, opérateur, numéro (utilisé par les futurs services commandes / courses / annonces) */
  async resolve(userId: string, id: string, lang = 'fr') {
    const m = await this.findOwned(userId, id, lang);
    this.prisma.user_payment_methods
      .update({ where: { id: m.id }, data: { lastUsedAt: new Date() } })
      .catch((e) => this.logger.warn(`lastUsedAt ${m.id} : ${e?.message}`));
    return {
      id: m.id,
      paymentMethod: m.type,
      provider: m.provider ?? undefined,
      phone: m.phone ?? undefined,
      currency: m.currency ?? undefined,
    };
  }
}
