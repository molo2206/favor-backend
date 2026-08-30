import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Patch,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RideService } from './ride.service';
import { CreateRideDto } from './dto/create-ride.dto';
import { UpdateRideDto } from './dto/update-ride.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { RolesGuard } from 'src/users/utility/decorators/roles.guard';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { Roles } from 'src/users/utility/decorators/roles.decorator';
import { UserRole } from 'src/users/enum/user-role-enum';

@Controller('rides')
export class RideController {
  constructor(private readonly rideService: RideService) {}

  @Post()
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuditAction(ActionType.CREATE, 'rides')
  create(@Body() dto: CreateRideDto, @CurrentUser() user: UserEntity) {
    return this.rideService.create(dto, user);
  }

  @Get()
  @UseGuards(AuthentificationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @AuditAction(ActionType.VIEW, 'rides')
  findAll() {
    return this.rideService.findAll();
  }

  @Get(':id')
  @UseGuards(AuthentificationGuard)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.rideService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuditAction(ActionType.UPDATE, 'rides')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRideDto) {
    return this.rideService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @AuditAction(ActionType.DELETE, 'rides')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rideService.remove(id);
  }

  @Post(':id/accept')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuditAction(ActionType.UPDATE, 'rides')
  async acceptRide(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserEntity,
  ) {
    return this.rideService.updateDriver(id, user.id);
  }

  @Post(':id/cancel')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuditAction(ActionType.UPDATE, 'rides')
  @HttpCode(HttpStatus.OK)
  async cancelRide(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserEntity,
    @Body() body: { cancellationReason?: string }, // Ajout du body
  ) {
    // Déterminer qui annule selon le rôle de l'utilisateur
    let cancelledBy: 'RIDER' | 'DRIVER' | 'SYSTEM' = 'SYSTEM';

    if (user.role === UserRole.CUSTOMER) {
      cancelledBy = 'RIDER';
    } else if (user.role === UserRole.DRIVER) {
      cancelledBy = 'DRIVER';
    }else if(user.role === UserRole.ADMIN){
      cancelledBy = 'SYSTEM'
    }

    // Passer la raison au service
    return this.rideService.cancelRide(
      id,
      cancelledBy,
      body.cancellationReason,
    );
  }
}
