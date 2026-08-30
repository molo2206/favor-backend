import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { DriverLocationService } from './driver-location.service';
import { UpdateDriverLocationDto } from './dto/update-driver-location.dto';
import { ChangeDriverStatusDto } from './dto/change-driver-status.dto';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { RolesGuard } from 'src/users/utility/decorators/roles.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';

// Supposé: req.user contient le driver (JWT Auth)

@Controller('driver-location')
export class DriverLocationController {
  constructor(private readonly locationService: DriverLocationService) {}

  // Mise à jour position (appel toutes les 5-10 secondes)
  @Patch('update')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuditAction(ActionType.CREATE, 'driver_locations')
  updateLocation(
    @CurrentUser() user: UserEntity,
    @Body() dto: UpdateDriverLocationDto,
  ) {
    return this.locationService.updateLocation(user, dto);
  }

  // Changer statut (Online / Busy / Offline)
  @Patch('status')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuditAction(ActionType.CREATE, 'driver_locations')
  changeStatus(@CurrentUser() user: UserEntity, @Body() dto: ChangeDriverStatusDto) {
    return this.locationService.changeStatus(user, dto);
  }

  // Liste chauffeurs disponibles (pour dispatcher)
  @Get('available')
  getAvailableDrivers() {
    return this.locationService.findAvailableDrivers();
  }

  // Position d’un chauffeur
  @Get(':driverId')
  getDriverLocation(@Param('driverId') driverId: string) {
    return this.locationService.getDriverLocation(driverId);
  }
}
