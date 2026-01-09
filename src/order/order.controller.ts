import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Param,
  Query,
  Patch,
  ParseIntPipe,
  BadRequestException,
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
import { Res } from '@nestjs/common';
import { CompanyType } from 'src/company/enum/type.company.enum';

@ApiBearerAuth()
@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @UseGuards(AuthentificationGuard)
  async createOrder(@Body() createOrderDto: CreateOrderDto, @CurrentUser() user: UserEntity) {
    const order = await this.orderService.createOrder(createOrderDto, user);
    return {
      message: 'Order created successfully',
      data: order,
    };
  }

  @Get('my-order')
  @UseGuards(AuthentificationGuard)
  async getMyOrders(@CurrentUser() user: UserEntity) {
    const orders = await this.orderService.getOrdersByUser(user.id);
    return {
      message: 'Orders retrieved successfully',
      data: orders,
    };
  }

  @Get('invoice/pdf/:invoiceNumber')
  async getInvoicePdf(@Param('invoiceNumber') invoiceNumber: string, @Res() res: Response) {
    const { pdfBuffer } = await this.orderService.generateInvoiceByInvoiceNumber(invoiceNumber);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoiceNumber}.pdf`);
    return res.send(pdfBuffer);
  }

  @Get(':id')
  @UseGuards(AuthentificationGuard)
  async getOneOrder(@Param('id') id: string) {
    return this.orderService.findOne(id);
  }

  @Get()
  @UseGuards(AuthentificationGuard)
  async getAll() {
    return this.orderService.findAll();
  }

  @Get('type/by-type')
  @UseGuards(AuthentificationGuard)
  async getOrderByType(
    @Query('type') type?: string,
  ): Promise<{ message: string; data: OrderEntity[] }> {
    return this.orderService.findByType(type); 
  }

  @Patch(':orderId/status')
  @UseGuards(AuthentificationGuard)
  async changeStatus(
    @Param('orderId') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: UserEntity,
  ): Promise<{ data: OrderEntity; message: string }> {
    return this.orderService.updateOrderStatus(orderId, dto, user);
  }

  @Get('/transactions/all')
  @UseGuards(AuthentificationGuard)
  async getAllTrans() {
    return this.orderService.getAllTransctions();
  }

  @Get('/transactions/me')
  @UseGuards(AuthentificationGuard)
  async getMyTransactions(@CurrentUser() user: UserEntity) {
    return this.orderService.getTransactionsByUser(user.id);
  }

  @Get('sub-orders/bycompany/active')
  @UseGuards(AuthentificationGuard)
  async getSubOrdersByCompany(@CurrentUser() user: UserEntity) {
    if (!user.activeCompanyId) {
      throw new BadRequestException("L'entreprise active est requise.");
    }

    return this.orderService.findSubOrdersByCompanys(user.activeCompanyId);
  }

  @Get('all/dashboard/favor')
  async getDashboard(
    @Query('type') type?: CompanyType | 'ALL',
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const dateDebut = start ? new Date(start) : new Date('2025-01-01');
    const dateFin = end ? new Date(end) : new Date();

    return this.orderService.getDashboardData(type || 'ALL', dateDebut, dateFin);
  }
}
