import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Put,
  Delete,
  UsePipes,
  ValidationPipe,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { UpdateDeliveryDto } from './dto/update-delivery.dto';
import { DeliveryEntity } from './entities/delivery.entity';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize-roles.decorator';
import { UserRole } from 'src/users/enum/user-role-enum';
import { CreateTrackingDto } from 'src/tracking/dto/create-tracking.dto';
import { TrackingEntity } from 'src/tracking/entities/tracking.entity';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';

@Controller('delivery')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Post()
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  @UsePipes(new ValidationPipe({ whitelist: true }))
  create(@Body() dto: CreateDeliveryDto): Promise<{ data: DeliveryEntity }> {
    return this.deliveryService.create(dto);
  }

  // @Post('tracking/:deliveryId')
  // @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  // async addTracking(
  //   @Param('deliveryId') deliveryId: string,
  //   @Body() dto: CreateTrackingDto,
  // ): Promise<{ message: string; data: TrackingEntity }> {
  //   const tracking = await this.deliveryService.addTrackingToDelivery(deliveryId, dto);
  //   return { message: 'Traitement réussi avec succès', data: tracking };
  // }

  @Get()
  @UseGuards(AuthentificationGuard)
  async findAll(): Promise<{ data: DeliveryEntity[] }> {
    return this.deliveryService.findAll();
  }

  @Get(':id')
  @UseGuards(AuthentificationGuard)
  findOne(@Param('id') id: string): Promise<DeliveryEntity> {
    return this.deliveryService.findOne(id);
  }

  @Put(':id')
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN', 'CUSTOMER'])
  update(@Param('id') id: string, @Body() dto: UpdateDeliveryDto): Promise<DeliveryEntity> {
    return this.deliveryService.update(id, dto);
  }

  @Post('confirm/:pin')
  async confirmDelivery(
    @Param('pin') pin: string,
  ): Promise<{ message: string; data: DeliveryEntity }> {
    if (!pin || pin.length !== 6) {
      throw new BadRequestException('PIN invalide.');
    }

    return this.deliveryService.confirmDeliveryByPin(pin);
  }

  @Get('/my/deliveries')
  @UseGuards(AuthentificationGuard)
  async getMyDeliveries(@CurrentUser() user: UserEntity) {
    return this.deliveryService.findAllForUser(user);
  }
}
