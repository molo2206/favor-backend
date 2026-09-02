// exchange-rate.controller.ts
import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    UsePipes,
    ValidationPipe,
    Req,
    ForbiddenException,
} from '@nestjs/common';
import { ExchangeRateService } from './exchange-rate.service';
import { UserRole } from 'src/users/enum/user-role-enum';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { I18nService } from 'src/libs/common/src';
import { Request } from 'express';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';
import { UpdateExchangeRateDto } from './dto/update-exchange-rate.dto';

@Controller('exchange-rates')
export class ExchangeRateController {
    constructor(
        private readonly exchangeRateService: ExchangeRateService,
        private readonly i18n: I18nService,
    ) { }

    private extractLanguage(req: Request): string {
        const acceptLanguage = req.headers['accept-language'];

        if (!acceptLanguage) return 'fr';

        const primary = acceptLanguage
            .split(',')[0]
            .split(';')[0]
            .trim()
            .split('-')[0]
            .toLowerCase();

        const supported = ['fr', 'en', 'sw', 'es', 'ar'];

        return supported.includes(primary) ? primary : 'fr';
    }

    // exchange-rate.controller.ts
    @Get('currency/by-ip')
    async getCurrencyByIp(
        @Req() req: Request,
        @Query('countryId') countryId?: string,
    ) {
        try {
            const lang = this.extractLanguage(req);

            // ✅ Récupérer l'IP du serveur/client
            let ip = req.headers['x-forwarded-for'] as string ||
                req.headers['x-real-ip'] as string ||
                req.headers['cf-connecting-ip'] as string || // Cloudflare
                req.connection?.remoteAddress ||
                req.socket?.remoteAddress ||
                req.ip ||
                '127.0.0.1';

            // ✅ Si plusieurs IPs (proxy), prendre la première
            if (ip && ip.includes(',')) {
                ip = ip.split(',')[0].trim();
            }

            // ✅ Enlever le préfixe IPv6 si présent
            ip = ip.replace(/^::ffff:/, '');

            console.log(`🌍 IP détectée: ${ip}`);

            const result = await this.exchangeRateService.getCurrencyByIp(ip, countryId);

            return {
                message: await this.i18n.translate('currency_retrieved', lang),
                data: result.data
            };
        } catch (error) {
            console.error('❌ Erreur:', error);
            return {
                message: 'Erreur lors de la récupération de la devise',
                data: {
                    defaultCurrency: 'USD',
                    currencies: [{ currency: 'USD', value: 1, status: true }],
                    countryCode: 'US',
                    countryName: 'États-Unis (défaut)',
                    ip: req.ip || '127.0.0.1'
                }
            };
        }
    }
    /**
     * Créer un taux de change
     */
    @Post()
    @UseGuards(AuthentificationGuard)
    @AuditAction(ActionType.CREATE, 'exchange_rate')
    @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    async create(
        @Req() req: Request,
        @Body() dto: CreateExchangeRateDto,
        @CurrentUser() user: UserEntity,
    ) {
        const lang = this.extractLanguage(req);

        if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
            throw new ForbiddenException(
                await this.i18n.translate('exchange_rate_not_authorized', lang),
            );
        }

        return this.exchangeRateService.create(dto);
    }

    /**
     * Récupérer tous les taux de change
     */
    @Get()
    @UseGuards(AuthentificationGuard)
    @AuditAction(ActionType.VIEW, 'exchange_rate')
    async findAll(
        @Req() req: Request,
        @Query('page') page = 1,
        @Query('limit') limit = 10,
    ) {
        const lang = this.extractLanguage(req);
        return this.exchangeRateService.findAll();
    }

    /**
     * Récupérer les taux actifs
     */
    @Get('active')
    @UseGuards(AuthentificationGuard)
    @AuditAction(ActionType.VIEW, 'exchange_rate')
    async findActive(@Req() req: Request) {
        const lang = this.extractLanguage(req);
        return {
            message: await this.i18n.translate('exchange_rate_retrieved', lang),
            data: await this.exchangeRateService.findActive(),
        };
    }

    /**
     * Récupérer un taux de change par ID
     */
    @Get(':id')
    @UseGuards(AuthentificationGuard)
    @AuditAction(ActionType.VIEW, 'exchange_rate')
    async findOne(
        @Req() req: Request,
        @Param('id') id: string,
    ) {
        const lang = this.extractLanguage(req);
        const rate = await this.exchangeRateService.findOne(id);
        return {
            message: await this.i18n.translate('exchange_rate_retrieved', lang),
            data: rate,
        };
    }

    /**
     * Récupérer un taux de change par devise
     */
    @Get('currency/:currency')
    @UseGuards(AuthentificationGuard)
    @AuditAction(ActionType.VIEW, 'exchange_rate')
    async findByCurrency(
        @Req() req: Request,
        @Param('currency') currency: string,
    ) {
        const lang = this.extractLanguage(req);
        const rate = await this.exchangeRateService.findByCurrency(currency);
        return {
            message: await this.i18n.translate('exchange_rate_retrieved', lang),
            data: rate,
        };
    }

    /**
     * Mettre à jour un taux de change
     */
    @Put(':id')
    @UseGuards(AuthentificationGuard)
    @AuditAction(ActionType.UPDATE, 'exchange_rate')
    @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    async update(
        @Req() req: Request,
        @Param('id') id: string,
        @Body() dto: UpdateExchangeRateDto,
        @CurrentUser() user: UserEntity,
    ) {
        const lang = this.extractLanguage(req);

        if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
            throw new ForbiddenException(
                await this.i18n.translate('exchange_rate_not_authorized', lang),
            );
        }

        return this.exchangeRateService.update(id, dto);
    }

    /**
     * Supprimer un taux de change (soft delete)
     */
    @Delete(':id')
    @UseGuards(AuthentificationGuard)
    @AuditAction(ActionType.DELETE, 'exchange_rate')
    async delete(
        @Req() req: Request,
        @Param('id') id: string,
        @CurrentUser() user: UserEntity,
    ) {
        const lang = this.extractLanguage(req);

        if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
            throw new ForbiddenException(
                await this.i18n.translate('exchange_rate_not_authorized', lang),
            );
        }

        return this.exchangeRateService.delete(id);
    }

    /**
     * Supprimer définitivement un taux de change (hard delete)
     */
    @Delete(':id/hard')
    @UseGuards(AuthentificationGuard)
    @AuditAction(ActionType.DELETE, 'exchange_rate')
    async hardDelete(
        @Req() req: Request,
        @Param('id') id: string,
        @CurrentUser() user: UserEntity,
    ) {
        const lang = this.extractLanguage(req);

        if (user.role !== UserRole.SUPER_ADMIN) {
            throw new ForbiddenException(
                await this.i18n.translate('exchange_rate_not_authorized', lang),
            );
        }

        return this.exchangeRateService.hardDelete(id);
    }
}