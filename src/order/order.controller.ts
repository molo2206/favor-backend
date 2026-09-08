import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Param,
  Query,
  Patch,
  BadRequestException,
  Req,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { UserEntity } from 'src/users/entities/user.entity';
import { OrderEntity } from './entities/order.entity';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { Response } from 'express';
import { CompanyType } from 'src/company/enum/type.company.enum';
import { Request } from 'express';
import { IncomingMessage } from 'http';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { PaginatedResponseDto } from './dto/paginated-response.dto';
import { Permissions } from 'src/users/utility/guards/permissions.guard';
import { I18nService } from 'src/libs/common/src';
import { CancelOrderDto } from './dto/create-cancel-order.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayOrderDto } from './dto/pay-order.dto';

@ApiBearerAuth()
@Controller('orders')
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly i18nService: I18nService,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) { }

  private extractLanguage(req: Request): string {
    const acceptLanguage = req.headers['accept-language'];
    if (!acceptLanguage) return 'fr';
    const primary = acceptLanguage.split(',')[0].split(';')[0].trim();
    const supported = ['fr', 'en', 'sw', 'es', 'ar'];
    return supported.includes(primary) ? primary : 'fr';
  }

  private getUserLanguage(user: UserEntity, req: Request): string {
    const headerLang = this.extractLanguage(req);
    const userLang = user.settings?.language;   // ✅ safe, vaut undefined si settings absent
    if (userLang && ['fr', 'en', 'sw', 'es', 'ar'].includes(userLang)) {
      return userLang;
    }
    return headerLang;
  }


  @Post()
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.CREATE, 'Order')
  async createOrder(
    @Body() createOrderDto: CreateOrderDto,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    const abortController = new AbortController();
    (req as unknown as IncomingMessage).on('aborted', () => {
      console.warn('[Controller] Requête annulée par le client.');
      abortController.abort();
    });

    const lang = this.getUserLanguage(user, req);

    // ✅ RECHARGER L'UTILISATEUR POUR AVOIR userIdFpay
    const fullUser = await this.userRepo.findOne({
      where: { id: user.id },
    });

    if (!fullUser) {
      throw new NotFoundException(
        this.i18nService.translate('order.user_not_found', lang)
      );
    }

    const order = await this.orderService.createOrder(
      createOrderDto,
      fullUser,
      abortController.signal,
      lang,
    );

    return {
      message: this.i18nService.translate('order.order_created_success', lang),
      data: order,
    };
  }

  @Post('pay')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.UPDATE, 'Order')
  async payPendingOrder(
    @Body() payOrderDto: PayOrderDto,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    const abortController = new AbortController();
    (req as unknown as IncomingMessage).on('aborted', () => {
      console.warn('[Controller] Requête annulée par le client.');
      abortController.abort();
    });

    const lang = this.getUserLanguage(user, req);

    // ✅ RECHARGER L'UTILISATEUR POUR AVOIR userIdFpay
    const fullUser = await this.userRepo.findOne({
      where: { id: user.id },
    });

    if (!fullUser) {
      throw new NotFoundException(
        this.i18nService.translate('order.user_not_found', lang)
      );
    }

    const order = await this.orderService.payPendingOrder(
      payOrderDto,
      fullUser,
      abortController.signal,
      lang,
    );

    return {
      message: this.i18nService.translate('order.payment_success', lang),
      data: order,
    };
  }

  @Patch(':id/shipping-cost')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.UPDATE, 'Order')
  async updateShippingCost(
    @Param('id') orderId: string,
    @Body() body: { shippingCost: number },
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.getUserLanguage(user, req);

    // ✅ Vérifier que le shippingCost est fourni
    if (body.shippingCost === undefined || body.shippingCost === null) {
      throw new BadRequestException(
        this.i18nService.translate('order.shipping_cost_required', lang)
      );
    }

    // ✅ RECHARGER L'UTILISATEUR POUR AVOIR userIdFpay (comme dans createOrder)
    const fullUser = await this.userRepo.findOne({
      where: { id: user.id },
    });

    if (!fullUser) {
      throw new NotFoundException(
        this.i18nService.translate('order.user_not_found', lang)
      );
    }

    // ✅ Appeler le service
    const result = await this.orderService.updateOrderShippingCost(
      orderId,
      body.shippingCost,
      fullUser,
      lang,
    );

    return {
      message: result.message,
      data: result.data,
    };
  }

  @Post(':id/cancel')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.UPDATE, 'Order')
  async cancelOrder(
    @Param('id') id: string,
    @CurrentUser() user: UserEntity,
    @Body() cancelDto: CancelOrderDto,
    @Req() req: Request,
  ) {
    const lang = this.getUserLanguage(user, req);
    const result = await this.orderService.cancelOrder(id, user, cancelDto, lang);
    return {
      message: this.i18nService.translate('order.order_cancelled_success', lang, {
        orderId: result.data.invoiceNumber,
      }),
      data: result.data,
    };
  }

  @Get('my-order')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.VIEW, 'Order')
  async getMyOrders(
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    const orders = await this.orderService.getOrdersByUser(user.id);
    const lang = this.getUserLanguage(user, req);
    return {
      message: this.i18nService.translate('order.orders_retrieved_success', lang),
      data: orders,
    };
  }

  //   @Get('my-order')
  // @UseGuards(AuthentificationGuard)
  // @AuditAction(ActionType.VIEW, 'Order')
  // async getMyOrders(
  //   @CurrentUser() user: UserEntity,
  //   @Req() req: Request,
  //   @Query('page') page?: string,
  //   @Query('limit') limit?: string,
  // ) {
  //   const lang = this.getUserLanguage(user, req);

  //   // Convertir et valider les paramètres avec valeurs par défaut
  //   const pageNumber = page ? parseInt(page, 10) : 1;
  //   const limitNumber = limit ? parseInt(limit, 10) : 10;

  //   const paginatedOrders = await this.orderService.getOrdersByUser(
  //     user.id,
  //     pageNumber,
  //     limitNumber,
  //   );

  //   return {
  //     message: this.i18nService.translate('order.orders_retrieved_success', lang),
  //     data: paginatedOrders,
  //   };
  // }

  @Get('invoice/pdf/:invoiceNumber')
  async getInvoicePdf(
    @Param('invoiceNumber') invoiceNumber: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const lang = this.extractLanguage(req);
    const { pdfBuffer } = await this.orderService.generateInvoiceByInvoiceNumber(
      invoiceNumber,
      lang,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=invoice-${invoiceNumber}.pdf`,
    );
    return res.send(pdfBuffer);
  }

  @Get(':id')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.VIEW, 'Order')
  async getOneOrder(
    @Param('id') id: string,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    const result = await this.orderService.findOne(id);
    const lang = this.getUserLanguage(user, req);
    return {
      message: this.i18nService.translate('order.order_found_success', lang),
      data: result.data,
    };
  }

  @Get()
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.VIEW, 'Order')
  async getAll(
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    const result = await this.orderService.findAll();
    const lang = this.getUserLanguage(user, req);
    return {
      message: this.i18nService.translate('order.orders_found_success', lang),
      data: result.data,
    };
  }

  @Get('type/by-type')
  @UseGuards(AuthentificationGuard)
  @Permissions({ resource: 'PRODUCTS', action: 'canUpdate' })
  @AuditAction(ActionType.VIEW, 'Order')
  async getOrderByType(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Query('type') type?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ): Promise<{ message: string; data: PaginatedResponseDto<OrderEntity> }> {
    const lang = this.getUserLanguage(user, req);

    // 🔥 RECHARGER l'utilisateur avec ses relations (activeBranch et city)
    const userWithRelations = await this.userRepo.findOne({
      where: { id: user.id },
      relations: ['activeBranch', 'activeBranch.city']
    });

    if (!userWithRelations) {
      throw new NotFoundException(
        this.i18nService.translate('user.not_found', lang)
      );
    }

    // 🔥 PASSER l'utilisateur rechargé au service
    return this.orderService.findByType(
      userWithRelations,
      type,
      page,
      limit,
      lang
    );
  }


  @Patch(':orderId/status')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.VIEW, 'Order')
  async changeStatus(
    @Param('orderId') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ): Promise<{ data: OrderEntity; message: string }> {
    const lang = this.getUserLanguage(user, req);
    return this.orderService.updateOrderStatus(orderId, dto, user, lang);
  }

  @Get('/transactions/all')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.VIEW, 'Order')
  async getAllTrans(
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    const result = await this.orderService.getAllTransctions();
    const lang = this.getUserLanguage(user, req);
    return {
      message: this.i18nService.translate('order.transactions_found_success', lang),
      data: result.data,
    };
  }

  @Get('/transactions/me')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.VIEW, 'Order')
  async getMyTransactions(
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    const lang = this.getUserLanguage(user, req);
    const result = await this.orderService.getTransactionsByUser(user.id, lang);
    return {
      message: this.i18nService.translate('order.transactions_retrieved_success', lang),
      data: result.data,
    };
  }

  @Get('sub-orders/bycompany/active')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.VIEW, 'Order')
  async getSubOrdersByCompany(
    @CurrentUser() user: UserEntity,
    @Req() req: Request,
  ) {
    if (!user.activeCompanyId) {
      const lang = this.getUserLanguage(user, req);
      throw new BadRequestException(
        this.i18nService.translate('order.active_company_required', lang),
      );
    }
    return this.orderService.findSubOrdersByCompanys(user.activeCompanyId);
  }

  @Get('all/dashboard/favor')
  async getDashboard(
    @Req() req: Request,
    @Query('type') type?: CompanyType | 'ALL',
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const dateDebut = start ? new Date(start) : new Date('2025-01-01');
    const dateFin = end ? new Date(end) : new Date();
    const lang = this.extractLanguage(req);
    return this.orderService.getDashboardData(
      type || 'ALL',
      dateDebut,
      dateFin,
      lang,
    );
  }
}