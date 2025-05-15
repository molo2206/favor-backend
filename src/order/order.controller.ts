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

@ApiBearerAuth()
@Controller('orders')
@UseGuards(AuthentificationGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  async createOrder(
    @Body() createOrderDto: CreateOrderDto,
    @CurrentUser() user: UserEntity,
  ) {
    const order = await this.orderService.createOrder(createOrderDto, user);
    return {
      message: 'Order created successfully',
      data: order,
    };
  }

  @Get('my-order')
  async getMyOrders(@CurrentUser() user: UserEntity) {
    const orders = await this.orderService.getOrdersByUser(user.id);
    return {
      message: 'Orders retrieved successfully',
      data: orders,
    };
  }

  @Get(':id')
  async getOneOrder(@Param('id') id: string) {
    return this.orderService.findOne(id);
  }

  @Get()
  async getAll() {
    return this.orderService.findAll();
  }

  @Get('type/by-type')
  async getOrderByType(
    @Query('type') type?: string,
  ): Promise<{ message: string; data: OrderEntity[] }> {
    return this.orderService.findByType(type); // Retourner l'objet avec le message et les données
  }

  @Patch(':orderId/status')
  async changeStatus(
    @Param('orderId') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<{ data: OrderEntity; message: string }> {
    return this.orderService.updateOrderStatus(orderId, dto);
  }

  @Get('/transactions/all')
  async getAllTrans() {
    return this.orderService.getAllTransctions();
  }

  @Get('/transactions/me')
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
}
