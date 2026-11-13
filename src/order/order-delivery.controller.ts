import {
    Controller,
    Post,
    Get,
    Body,
    Param,
    Query,
    Req,
    UseGuards,
    HttpCode,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Request } from 'express';

import { AssignDeliveryDto } from './dto/assign-delivery.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { StartTrackingDto } from './enum/start-tracking.dto';
import { UpdateStatusDto } from './enum/update-status.dto';
import { UpdateLocationDto } from './enum/update-location.dto';
import { OrderDeliveryService } from './order-delivery.service';
import { BranchDeliveryService } from './branch-delivery.service';

@Controller('delivery')
export class DeliveryController {
    private readonly logger = new Logger(DeliveryController.name);

    constructor(
        private readonly orderDeliveryService: OrderDeliveryService,
        private readonly branchDelivery: BranchDeliveryService,
    ) { }

    // ============================================================
    // 🚚 LIVREUR PAR BRANCHE (commandes RESTAURANT)
    // ============================================================
    /** Mes branches et mes droits (lecture / traitement) */
    @Get('branch/scope')
    @UseGuards(AuthentificationGuard)
    async branchScope(@CurrentUser() user: UserEntity) {
        return { message: 'OK', data: await this.branchDelivery.scope(user.id) };
    }

    /**
     * Commandes de MA branche : ?scope=available (à prendre, défaut) | assigned (les miennes en cours) | all
     * &status=VALIDATED&page=1&limit=20
     */
    @Get('branch/orders')
    @UseGuards(AuthentificationGuard)
    async branchOrders(
        @Req() req: Request,
        @CurrentUser() user: UserEntity,
        @Query('scope') scope?: string,
        @Query('status') status?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const lang = (user as any).preferredLanguage || this.extractLanguage(req);
        return this.branchDelivery.branchOrders(user, { scope, status, page: Number(page), limit: Number(limit) }, lang);
    }

    /** Prendre la commande : elle m'est affectée (le premier qui la prend la garde) */
    @Post('orders/:orderId/take')
    @UseGuards(AuthentificationGuard)
    @HttpCode(HttpStatus.OK)
    async takeOrder(@Req() req: Request, @Param('orderId') orderId: string, @CurrentUser() user: UserEntity) {
        const lang = (user as any).preferredLanguage || this.extractLanguage(req);
        return this.branchDelivery.takeOrder(orderId, user, lang);
    }

    /** Historique de toutes les commandes qui m'ont été affectées : ?status=DELIVERED&from=2026-10-01&to=2026-10-31 */
    @Get('my-history')
    @UseGuards(AuthentificationGuard)
    async myHistory(
        @Req() req: Request,
        @CurrentUser() user: UserEntity,
        @Query('status') status?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const lang = (user as any).preferredLanguage || this.extractLanguage(req);
        return this.branchDelivery.history(user, { status, from, to, page: Number(page), limit: Number(limit) }, lang);
    }

    // ============================================================
    // 👨‍💼 ADMIN — AFFECTER UN LIVREUR À UNE COMMANDE
    // ============================================================
    /**
     * ✅ Livreurs à proposer pour cette commande : seulement ceux rattachés à une branche
     * de la ville de la commande. ?search=nom ou téléphone ; admin : &companyId= (collaborateurs d'une entreprise).
     */
    @Get('orders/:orderId/deliverers')
    @UseGuards(AuthentificationGuard)
    async eligibleDeliverers(
        @Req() req: Request,
        @Param('orderId') orderId: string,
        @CurrentUser() user: UserEntity,
        @Query('search') search?: string,
        @Query('companyId') companyId?: string,
    ) {
        const lang = (user as any).preferredLanguage || this.extractLanguage(req);
        return this.branchDelivery.eligibleDeliverers(orderId, user, { search, companyId }, lang);
    }

    @Post('orders/:orderId/assign')
    @UseGuards(AuthentificationGuard)
    @HttpCode(HttpStatus.OK)
    async assignDelivery(
        @Req() req: Request,
        @Param('orderId') orderId: string,
        @Body() dto: AssignDeliveryDto,
        @CurrentUser() user: UserEntity,
    ) {
        const lang = (user as any).preferredLanguage || this.extractLanguage(req);
        this.logger.log(
            `📥 POST /delivery/orders/${orderId}/assign by ${user.id}`,
        );
        return this.orderDeliveryService.assignDeliveryToOrder(
            orderId,
            dto.deliverId,
            user.id,
            lang,
        );
    }

    // ============================================================
    // 1️⃣ LIVREUR — CONNECTER À LA ROOM (REST → info WebSocket)
    // ============================================================
    @Post('orders/:orderId/connect')
    @UseGuards(AuthentificationGuard)
    @HttpCode(HttpStatus.OK)
    async connectToRoom(
        @Req() req: Request,
        @Param('orderId') orderId: string,
        @CurrentUser() user: UserEntity,
    ) {
        const lang = (user as any).preferredLanguage || this.extractLanguage(req);
        this.logger.log(
            `🔌 POST /delivery/orders/${orderId}/connect by deliver ${user.id}`,
        );
        return this.orderDeliveryService.connectToOrderRoom(
            orderId,
            user.id,
            lang,
        );
    }

    // ============================================================
    // 2️⃣ LIVREUR — DÉMARRER / ARRÊTER LE TRACKING
    // ============================================================
    @Post('orders/:orderId/tracking')
    @UseGuards(AuthentificationGuard)
    @HttpCode(HttpStatus.OK)
    async toggleTracking(
        @Req() req: Request,
        @Param('orderId') orderId: string,
        @Body() dto: StartTrackingDto,
        @CurrentUser() user: UserEntity,
    ) {
        const lang = (user as any).preferredLanguage || this.extractLanguage(req);
        this.logger.log(
            `🚚 POST /delivery/orders/${orderId}/tracking [${dto.action}] by deliver ${user.id}`,
        );
        return this.orderDeliveryService.toggleTracking(
            orderId,
            user.id,
            dto.action,
            lang,
        );
    }

    // ============================================================
    // 3️⃣ LIVREUR — ENVOYER SA POSITION (REST fallback)
    // ============================================================
    @Post('orders/:orderId/position')
    @UseGuards(AuthentificationGuard)
    @HttpCode(HttpStatus.OK)
    async sendPosition(
        @Req() req: Request,
        @Param('orderId') orderId: string,
        @Body() dto: UpdateLocationDto,
        @CurrentUser() user: UserEntity,
    ) {
        const lang = (user as any).preferredLanguage || this.extractLanguage(req);
        this.logger.log(
            `📍 POST /delivery/orders/${orderId}/position by deliver ${user.id}`,
        );
        return this.orderDeliveryService.sendPosition(
            orderId,
            user.id,
            {
                latitude: dto.latitude,
                longitude: dto.longitude,
            },
            lang,
        );
    }

    // ============================================================
    // 🚚 LIVREUR — CHANGER LE STATUT (PIN)
    // ============================================================
    @Post('orders/:orderId/status')
    @UseGuards(AuthentificationGuard)
    @HttpCode(HttpStatus.OK)
    async updateStatus(
        @Req() req: Request,
        @Param('orderId') orderId: string,
        @Body() dto: UpdateStatusDto,
        @CurrentUser() user: UserEntity,
    ) {
        this.logger.log(
            `✅ POST /delivery/orders/${orderId}/status (PIN) by deliver ${user.id}`,
        );
        return this.orderDeliveryService.updateStatus(
            orderId,
            dto.pin,
            dto.note,
        );
    }

    // ============================================================
    // 📍 TOUS — DERNIÈRE POSITION
    // ============================================================
    @Get('orders/:orderId/location')
    async getLastLocation(@Param('orderId') orderId: string) {
        return this.orderDeliveryService.getLastLocation(orderId);
    }

    // ============================================================
    // 🚚 LIVREUR — MES AFFECTATIONS ACTIVES
    // ============================================================
    @Get('my-assignments')
    @UseGuards(AuthentificationGuard)
    async getMyAssignments(@CurrentUser() user: UserEntity) {
        this.logger.log(`📋 GET /delivery/my-assignments for ${user.id}`);
        return this.orderDeliveryService.getDeliverAssignments(user.id);
    }

    // ============================================================
    // 🌐 LANGUE
    // ============================================================
    private extractLanguage(req: Request): string {
        const acceptLanguage = req.headers['accept-language'];
        if (!acceptLanguage) return 'fr';
        const primary = acceptLanguage.split(',')[0].split(';')[0].trim();
        const supported = ['fr', 'en', 'sw', 'es', 'ar'];
        return supported.includes(primary) ? primary : 'fr';
    }
}