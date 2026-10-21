// src/sms/sms-quota.controller.ts
import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Query,
    UseGuards,
    BadRequestException,
} from '@nestjs/common';
import { SmsQuotaService } from './sms-quota.service';
import { SmsCategory } from './entity/sms-recharge.entity';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';

@Controller('sms')
@UseGuards(AuthentificationGuard)
export class SmsQuotaController {
    constructor(private readonly quotaService: SmsQuotaService) { }

    /**
 * Recharger du quota SMS
 * POST /sms/recharges
 * Body : { category: 'ORDER' | 'SHIPMENT' | 'AUTH' | 'SERVICE_CLIENT', quantity: number, ... }
 */
    @Post('recharges')
    async recharge(
        @CurrentUser() user: UserEntity,
        @Body()
        body: {
            category: SmsCategory;
            quantity: number;
            paymentReference?: string;
            note?: string;
        },
    ) {
        // Vérification rôle : SUPER ADMIN uniquement
        if (user.role !== UserRole.SUPER_ADMIN) {
            throw new BadRequestException(
                'Seul un SUPER ADMIN peut recharger du quota SMS.',
            );
        }

        if (!body.category || !Object.values(SmsCategory).includes(body.category)) {
            throw new BadRequestException(
                `Catégorie invalide. Valeurs autorisées : ${Object.values(SmsCategory).join(', ')}`,
            );
        }

        if (!body.quantity || body.quantity <= 0) {
            throw new BadRequestException('La quantité doit être > 0');
        }

        const recharge = await this.quotaService.addRecharge(
            body.category,
            body.quantity,
            user.id,
            body.paymentReference,
            body.note,
        );

        return {
            message: `Recharge de ${body.quantity} SMS ${body.category} effectuée`,
            data: recharge,
        };
    }

    // ============================================================
    // 📊 LECTURE DES QUOTAS
    // ============================================================

    /**
     * Voir les quotas restants pour toutes les catégories
     * GET /sms/quotas
     */
    @Get('quotas')
    async getQuotas() {
        const [orderRemaining, shipmentRemaining, authRemaining, serviceClientRemaining] =
            await Promise.all([
                this.quotaService.getRemainingQuota(SmsCategory.ORDER),
                this.quotaService.getRemainingQuota(SmsCategory.SHIPMENT),
                this.quotaService.getRemainingQuota(SmsCategory.AUTH),
                this.quotaService.getRemainingQuota(SmsCategory.SERVICE_CLIENT),
            ]);

        return {
            message: 'Quotas SMS récupérés',
            data: {
                ORDER: orderRemaining,
                SHIPMENT: shipmentRemaining,
                AUTH: authRemaining,
                SERVICE_CLIENT: serviceClientRemaining,
            },
        };
    }

    /**
     * Voir le quota restant d'une catégorie précise
     * GET /sms/quotas/:category
     */
    @Get('quotas/:category')
    async getQuota(@Param('category') category: SmsCategory) {
        if (!Object.values(SmsCategory).includes(category)) {
            throw new BadRequestException(
                `Catégorie invalide. Valeurs autorisées : ${Object.values(SmsCategory).join(', ')}`,
            );
        }

        const [remaining, activeRecharge] = await Promise.all([
            this.quotaService.getRemainingQuota(category),
            this.quotaService.getActiveRecharge(category),
        ]);

        return {
            message: `Quota ${category} récupéré`,
            data: {
                category,
                remaining,
                activeRecharge,
            },
        };
    }

    // ============================================================
    // 📜 HISTORIQUE DES RECHARGES
    // ============================================================

    /**
     * Historique des recharges
     * GET /sms/recharges
     * GET /sms/recharges?category=ORDER
     */
    @Get('recharges')
    async getRecharges(@Query('category') category?: SmsCategory) {
        const recharges = await this.quotaService.getAllRecharges(category);

        return {
            message: 'Liste des recharges récupérée',
            data: recharges,
        };
    }

    // ============================================================
    // 💰 RECHARGE (ADMIN ONLY)
    // ============================================================


}