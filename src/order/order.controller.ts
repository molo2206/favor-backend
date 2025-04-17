import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, UsePipes, ValidationPipe, NotFoundException, Query } from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { OrderStatus } from './enum/orderstatus.enum';

@Controller('order')
export class OrderController {
  constructor(private readonly orderService: OrderService) { }

  @Post()
  @UseGuards(AuthentificationGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async create(
    @Body() orderDto: CreateOrderDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.orderService.create(orderDto, user.id, user);
  }

  @Patch(':id')
  @UseGuards(AuthentificationGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async update(
    @Param('id') id: string,
    @Body() updateOrderDto: UpdateOrderDto,
    @CurrentUser() user: UserEntity, // ✅ récupère l'utilisateur
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return this.orderService.update(id, updateOrderDto, user);
  }
  @Get()
  @UseGuards(AuthentificationGuard)
  findAll() {
    return this.orderService.findAll();
  }

  @Get('status/:status')
  @UseGuards(AuthentificationGuard)
  getUserOrdersByStatus(
    @CurrentUser() user: UserEntity,
    @Param('status') status: OrderStatus,
  ) {
    return this.orderService.findUserOrdersByStatus(user.id, status);
  }

  @Get(':id')
  @UseGuards(AuthentificationGuard)
  findOne(@Param('id') id: string) {
    return this.orderService.findOne(id);
  }

  @Get('/my-order/me')
  @UseGuards(AuthentificationGuard)
  async getUserOrders(@CurrentUser() user: UserEntity) {
    const orders = await this.orderService.findAllByUserOrder(user.id);
    if (!orders || orders.length === 0) {
      throw new NotFoundException('Aucune commande trouvée pour cet utilisateur.');
    }
    return orders;
  }

  @Get('by-company/:companyId')
  @UseGuards(AuthentificationGuard)
  getOrdersByCompany(@Param('companyId') companyId: string) {
    return this.orderService.findOrdersByCompany(companyId);
  }

  @Get('by-status-company/:companyId')
  getOrdersStatusByCompany(
    @Param('companyId') companyId: string,
    @Query('status') status?: OrderStatus,
  ) {
    return this.orderService.findOrdersStatusByCompany(companyId, status);
  }


  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.orderService.remove(id);
  }
}
