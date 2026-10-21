// src/sms/sms-quota.service.ts
import {
    Injectable,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SmsCategory, SmsRechargeEntity, SmsRechargeStatus } from './entity/sms-recharge.entity';
import { SmsLogEntity, SmsLogStatus } from './entity/sms-log.entity';


@Injectable()
export class SmsQuotaService {
    private readonly logger = new Logger(SmsQuotaService.name);

    constructor(
        @InjectRepository(SmsRechargeEntity)
        private readonly rechargeRepo: Repository<SmsRechargeEntity>,
        @InjectRepository(SmsLogEntity)
        private readonly logRepo: Repository<SmsLogEntity>,
        private readonly dataSource: DataSource,
    ) { }

    // ============================================================
    // 🔍 LECTURE
    // ============================================================

    async getActiveRecharge(
        category: SmsCategory,
    ): Promise<SmsRechargeEntity | null> {
        return this.rechargeRepo.findOne({
            where: {
                category,
                status: SmsRechargeStatus.ACTIVE,
            },
            order: { createdAt: 'ASC' },
        });
    }

    async getRemainingQuota(category: SmsCategory): Promise<number> {
        const result = await this.rechargeRepo
            .createQueryBuilder('r')
            .select('SUM(r.remaining)', 'total')
            .where('r.category = :category', { category })
            .andWhere('r.status = :status', { status: SmsRechargeStatus.ACTIVE })
            .getRawOne();

        return Number(result?.total ?? 0);
    }

    async getAllRecharges(category?: SmsCategory): Promise<SmsRechargeEntity[]> {
        const where = category ? { category } : {};
        return this.rechargeRepo.find({
            where,
            order: { createdAt: 'DESC' },
        });
    }

    // ============================================================
    // 💰 RECHARGE
    // ============================================================

    async addRecharge(
        category: SmsCategory,
        quantity: number,
        userId?: string,
        paymentReference?: string,
        note?: string,
    ): Promise<SmsRechargeEntity> {
        if (quantity <= 0) {
            throw new BadRequestException('Quantity must be > 0');
        }

        const recharge = this.rechargeRepo.create({
            category,
            quantity,
            used: 0,
            remaining: quantity,
            status: SmsRechargeStatus.ACTIVE,
            userId: userId ?? null,
            paymentReference: paymentReference ?? null,
            note: note ?? null,
        });

        return this.rechargeRepo.save(recharge);
    }

    // ============================================================
    // 🔻 CONSOMMER — FIFO
    // ============================================================

    async tryConsume(
        category: SmsCategory,
        count = 1,
    ): Promise<{ allowed: boolean; quotaBefore: number; quotaAfter: number }> {
        return this.dataSource.transaction(async (manager) => {
            const recharges = await manager.find(SmsRechargeEntity, {
                where: {
                    category,
                    status: SmsRechargeStatus.ACTIVE,
                },
                order: { createdAt: 'ASC' },
                lock: { mode: 'pessimistic_write' },
            });

            const totalBefore = recharges.reduce((sum, r) => sum + r.remaining, 0);

            if (totalBefore < count) {
                return {
                    allowed: false,
                    quotaBefore: totalBefore,
                    quotaAfter: totalBefore,
                };
            }

            let remainingToConsume = count;
            for (const recharge of recharges) {
                if (remainingToConsume <= 0) break;

                const consumeFromThis = Math.min(recharge.remaining, remainingToConsume);

                // ✅ Décrémenter les 3 champs
                recharge.quantity -= consumeFromThis;      // ✅ NOUVEAU
                recharge.used += consumeFromThis;
                recharge.remaining -= consumeFromThis;

                remainingToConsume -= consumeFromThis;

                // ✅ Marquer épuisé si plus rien
                if (recharge.remaining <= 0 || recharge.quantity <= 0) {
                    recharge.status = SmsRechargeStatus.EXHAUSTED;
                    recharge.remaining = 0;
                    recharge.quantity = 0;
                }

                await manager.save(recharge);
            }

            return {
                allowed: true,
                quotaBefore: totalBefore,
                quotaAfter: totalBefore - count,
            };
        });
    }
    // ============================================================
    // ♻️ REMBOURSER
    // ============================================================

    async refund(category: SmsCategory, count = 1): Promise<void> {
        await this.dataSource.transaction(async (manager) => {
            const recharge = await manager.findOne(SmsRechargeEntity, {
                where: [
                    { category, status: SmsRechargeStatus.ACTIVE },
                    { category, status: SmsRechargeStatus.EXHAUSTED },
                ],
                order: { createdAt: 'DESC' },
                lock: { mode: 'pessimistic_write' },
            });

            if (!recharge) return;

            // ✅ Rembourser les 3 champs
            recharge.quantity += count;      // ✅ Restaure la quantité
            recharge.used = Math.max(0, recharge.used - count);
            recharge.remaining += count;     // ✅ Restaure le restant

            // ✅ Réactiver si on a remboursé sur un pack épuisé
            if (
                recharge.remaining > 0 &&
                recharge.status === SmsRechargeStatus.EXHAUSTED
            ) {
                recharge.status = SmsRechargeStatus.ACTIVE;
            }

            await manager.save(recharge);
        });
    }

    // ============================================================
    // 📝 LOG
    // ============================================================

    async log(params: {
        category: SmsCategory;
        recipient: string;
        message: string;
        status: SmsLogStatus;
        quotaBefore: number;
        quotaAfter: number;
        errorMessage?: string;
        referenceId?: string;
        referenceType?: string;
    }): Promise<SmsLogEntity> {
        const entry = this.logRepo.create({
            ...params,
            errorMessage: params.errorMessage ?? null,
            referenceId: params.referenceId ?? null,
            referenceType: params.referenceType ?? null,
        });
        return this.logRepo.save(entry);
    }
}