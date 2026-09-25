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
    Headers,
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
import { JwtService } from '@nestjs/jwt';
import { UserSettingsEntity } from 'src/users/entities/user-settings.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Controller('exchange-rates')
export class ExchangeRateController {
    constructor(
        private readonly exchangeRateService: ExchangeRateService,
        private readonly i18n: I18nService,
        private readonly jwtService: JwtService,
        @InjectRepository(UserSettingsEntity)
        private readonly userSettingsRepo: Repository<UserSettingsEntity>,
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
        @Headers('authorization') authHeader?: string,
    ) {
        try {
            // ✅ Récupérer l'IP du client depuis différents headers
            let ip = req.headers['x-forwarded-for'] as string ||
                req.headers['x-real-ip'] as string ||
                req.headers['cf-connecting-ip'] as string ||
                req.connection?.remoteAddress ||
                req.socket?.remoteAddress ||
                req.ip ||
                '127.0.0.1';

            // ✅ Si plusieurs IPs (proxy), prendre la première (celle du client)
            if (ip && ip.includes(',')) {
                ip = ip.split(',')[0].trim();
            }

            // ✅ Enlever le préfixe IPv6 si présent
            ip = ip.replace(/^::ffff:/, '');

            // ✅ Nettoyer l'IP (enlever le port si présent)
            if (ip && ip.includes(':')) {
                ip = ip.split(':')[0];
            }

            const host = req.get('host');
            const protocol = req.protocol;
            const baseUrl = `${protocol}://${host}`;

            console.log(`🌍 Domaine: ${baseUrl}`);
            console.log(`🌍 IP brute reçue: ${ip}`);

            // ✅ 1. Extraire le token JWT et récupérer l'utilisateur
            let userId: string | undefined;
            let userCurrency: string | undefined;

            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.substring(7);
                try {
                    const decoded = this.jwtService.decode(token) as any;
                    if (decoded && decoded.id) {
                        userId = decoded.id;
                        console.log(`👤 Utilisateur connecté: ${userId}`);

                        const userSettings = await this.userSettingsRepo.findOne({
                            where: { userId: userId },
                            select: ['currency'],
                        });
                        if (userSettings?.currency) {
                            userCurrency = userSettings.currency;
                            console.log(`💱 Devise de l'utilisateur: ${userCurrency}`);
                        }
                    }
                } catch (error) {
                    console.log('⚠️ Token invalide ou expiré, utilisation par défaut');
                }
            } else {
                console.log('👤 Utilisateur non connecté');
            }

            // ✅ 2. Vérifier si c'est une requête locale
            const isLocalRequest = ip === '127.0.0.1' ||
                ip === '::1' ||
                ip === 'localhost' ||
                ip === '0:0:0:0:0:0:0:1' ||
                ip.startsWith('192.168') ||
                ip.startsWith('10.') ||
                ip.startsWith('172.');

            let result;
            if (isLocalRequest) {
                console.log('📍 Requête locale détectée, utilisation de l\'IP du serveur');
                result = await this.exchangeRateService.getCurrencyByIp('server', countryId, userId);
            } else {
                console.log(`🌍 Requête distante avec IP: ${ip}`);
                result = await this.exchangeRateService.getCurrencyByIp(ip, countryId, userId);
            }

            // ✅ 3. Si l'utilisateur a une devise et qu'elle est disponible, la mettre par défaut
            let defaultCurrency = result.data.defaultCurrency;
            if (userCurrency && result.data.currencies.some(c => c.currency === userCurrency)) {
                defaultCurrency = userCurrency;
                console.log(`💱 Devise par défaut = devise de l'utilisateur: ${defaultCurrency}`);
            }

            return {
                message: 'Devises récupérées avec succès',
                data: {
                    ...result.data,
                    defaultCurrency,
                    server: baseUrl,
                    environment: process.env.NODE_ENV || 'development',
                    isAuthenticated: !!userId,
                }
            };
        } catch (error) {
            console.error('❌ Erreur:', error);

            return {
                message: 'Erreur lors de la récupération de la devise, valeur par défaut',
                data: {
                    defaultCurrency: 'USD',
                    currencies: [{ currency: 'USD', value: 1, status: true }],
                    countryCode: 'US',
                    countryName: 'États-Unis (défaut)',
                    ip: req.ip || '127.0.0.1',
                    server: `${req.protocol}://${req.get('host')}`,
                    environment: process.env.NODE_ENV || 'development',
                    isAuthenticated: false,
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