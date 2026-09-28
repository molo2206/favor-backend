import {
    Controller,
    Post,
    Get,
    Body,
    Param,
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

@Controller('delivery')
export class DeliveryController {
    private readonly logger = new Logger(DeliveryController.name);

    constructor(
        private readonly orderDeliveryService: OrderDeliveryService,
    ) { }

    // ============================================================
    // 👨‍💼 ADMIN — AFFECTER UN LIVREUR À UNE COMMANDE
    // ============================================================
    @Post('orders/:orderId/assign')
    @UseGuards(AuthentificationGuard)
    @HttpCode(HttpStatus.OK)
    async assignDelivery(
        @Req() req: Request,
        @Param('orderId') orderId: string,
        @Body() dto: AssignDeliveryDto,
        @CurrentUser() user: UserEntity,
    ) {
        const lang = this.extractLanguage(req);
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
        const lang = this.extractLanguage(req);
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
        const lang = this.extractLanguage(req);
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
        const lang = this.extractLanguage(req);
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