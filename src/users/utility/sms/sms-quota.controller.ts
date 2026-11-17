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

/**
 * Quotas SMS par catégorie ET par pays (table `countries`).
 * Une recharge sans pays (countryId vide) = quota commun, utilisable pour tous les pays.
 * Partout où un pays est attendu : id de `countries` (recommandé), ou son code (CD) / son nom ; GLOBAL = quota commun.
 */
@Controller('sms')
@UseGuards(AuthentificationGuard)
export class SmsQuotaController {
    constructor(private readonly quotaService: SmsQuotaService) { }

    private assertCategory(category?: string): SmsCategory {
        if (!category || !Object.values(SmsCategory).includes(category as SmsCategory)) {
            throw new BadRequestException(
                `Catégorie invalide. Valeurs autorisées : ${Object.values(SmsCategory).join(', ')}`,
            );
        }
        return category as SmsCategory;
    }

    /**
     * Recharger du quota SMS
     * POST /sms/recharges
     * Body : { category: 'ORDER' | 'SHIPMENT' | 'AUTH' | 'SERVICE_CLIENT', quantity: number,
     *          countryId?: id de countries (vide = quota commun, tous pays), paymentReference?, note? }
     */
    @Post('recharges')
    async recharge(
        @CurrentUser() user: UserEntity,
        @Body()
        body: {
            category: SmsCategory;
            quantity: number;
            countryId?: string | null;
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

        const category = this.assertCategory(body.category);
        const quantity = Number(body.quantity);
        if (!Number.isInteger(quantity) || quantity <= 0) {
            throw new BadRequestException('La quantité doit être un nombre entier > 0');
        }

        const recharge = await this.quotaService.addRecharge(
            category,
            quantity,
            user.id,
            body.paymentReference,
            body.note,
            body.countryId,
        );

        return {
            message: `Recharge de ${quantity} SMS ${category} effectuée (${recharge.country?.name ?? 'quota commun, tous pays'})`,
            data: recharge,
        };
    }

    // ============================================================
    // 🌍 PAYS
    // ============================================================

    /**
     * Pays de la table countries, avec l'indicatif SMS reconnu
     * GET /sms/countries
     * smsDetection=false : les numéros de ce pays ne sont pas reconnus (aucun country_providers correspondant)
     * → ses SMS utilisent le quota commun.
     */
    @Get('countries')
    async getCountries() {
        return {
            message: 'Pays récupérés',
            data: await this.quotaService.listCountries(),
        };
    }

    // ============================================================
    // 📊 LECTURE DES QUOTAS
    // ============================================================

    /**
     * Quotas restants : total par catégorie (comme avant) + détail par pays
     * GET /sms/quotas
     */
    @Get('quotas')
    async getQuotas() {
        const [orderRemaining, shipmentRemaining, authRemaining, serviceClientRemaining, byCountry] =
            await Promise.all([
                this.quotaService.getRemainingQuota(SmsCategory.ORDER),
                this.quotaService.getRemainingQuota(SmsCategory.SHIPMENT),
                this.quotaService.getRemainingQuota(SmsCategory.AUTH),
                this.quotaService.getRemainingQuota(SmsCategory.SERVICE_CLIENT),
                this.quotaService.getQuotasByCountry(),
            ]);

        return {
            message: 'Quotas SMS récupérés',
            data: {
                ORDER: orderRemaining,
                SHIPMENT: shipmentRemaining,
                AUTH: authRemaining,
                SERVICE_CLIENT: serviceClientRemaining,
                // ✅ Détail : [{ category, countryId (null = quota commun), countryName, countryCode, flag, remaining, recharges }]
                byCountry,
            },
        };
    }

    /**
     * Quota restant d'une catégorie
     * GET /sms/quotas/:category
     * GET /sms/quotas/:category?countryId=<id>  → quota du pays + SMS réellement disponibles (pays + commun)
     * GET /sms/quotas/:category?countryId=GLOBAL → quota commun seulement
     */
    @Get('quotas/:category')
    async getQuota(@Param('category') categoryParam: SmsCategory, @Query('countryId') countryParam?: string) {
        const category = this.assertCategory(categoryParam);

        if (countryParam) {
            const country = await this.quotaService.findRechargeCountry(countryParam);
            const countryId = country?.id ?? null;
            const [remaining, available, activeRecharge] = await Promise.all([
                this.quotaService.getRemainingQuota(category, countryId),
                this.quotaService.getAvailableForCountry(category, countryId),
                this.quotaService.getActiveRecharge(category, countryId),
            ]);
            return {
                message: `Quota ${category} (${country?.name ?? 'quota commun'}) récupéré`,
                data: {
                    category,
                    countryId,
                    country,
                    // Recharges de ce pays seulement
                    remaining,
                    // SMS réellement envoyables vers ce pays (son quota + quota commun si autorisé)
                    available,
                    activeRecharge,
                },
            };
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
     * Historique des recharges (avec le pays)
     * GET /sms/recharges
     * GET /sms/recharges?category=ORDER&countryId=<id>   (countryId=GLOBAL : quota commun)
     */
    @Get('recharges')
    async getRecharges(@Query('category') category?: SmsCategory, @Query('countryId') countryParam?: string) {
        if (category) this.assertCategory(category);
        const recharges = await this.quotaService.getAllRecharges(category, countryParam);

        return {
            message: 'Liste des recharges récupérée',
            data: recharges,
        };
    }
}
