import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { RolesGuard } from 'src/users/utility/decorators/roles.guard';
import { Roles } from 'src/users/utility/decorators/roles.decorator';
import { UserRole } from 'src/users/enum/user-role-enum';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { DriverAssociationService } from './driver-association.service';
import {
  AssociationDriversQueryDto,
  AssociationStatsQueryDto,
  CreateDriverAssociationDto,
  DriverAssociationQueryDto,
  SetDriverTypeDto,
  UpdateDriverAssociationDto,
} from './dto/driver-association.dto';

/**
 * ✅ Chauffeurs PRIVÉS ou MEMBRES d'une association.
 * Préfixe : /driver-associations
 */
@Controller('driver-associations')
@UseGuards(AuthentificationGuard, RolesGuard)
export class DriverAssociationController {
  constructor(private readonly service: DriverAssociationService) { }

  // ---------- Chauffeur connecté ----------
  /** Mon statut : privé ou membre (association, n° de membre, part de l'association) */
  @Get('me')
  me(@CurrentUser() user: UserEntity) {
    return this.service.me(user);
  }

  // ---------- Statistiques (admin) ----------
  /** Toutes les associations + chauffeurs privés : ?from=YYYY-MM-DD&to=YYYY-MM-DD */
  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  statsAll(@Query() query: AssociationStatsQueryDto) {
    return this.service.statsAll(query);
  }

  // ---------- Statut d'un chauffeur (admin) ----------
  @Get('drivers/:driverId')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  driverProfile(@Param('driverId', ParseUUIDPipe) driverId: string) {
    return this.service.getDriverProfile(driverId);
  }

  /** { "type": "PRIVATE" } ou { "type": "ASSOCIATION", "associationId": "...", "memberNumber": "A-012" } */
  @Patch('drivers/:driverId')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @AuditAction(ActionType.UPDATE, 'driver_profiles')
  setDriverType(@Param('driverId', ParseUUIDPipe) driverId: string, @Body() dto: SetDriverTypeDto, @CurrentUser() admin: UserEntity) {
    return this.service.setDriverType(driverId, dto, admin);
  }

  // ---------- Associations (admin) ----------
  /** ?cityId=&search=&active=true|false|all&page=&limit= */
  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  list(@Query() query: DriverAssociationQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @AuditAction(ActionType.CREATE, 'driver_associations')
  create(@Body() dto: CreateDriverAssociationDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @AuditAction(ActionType.UPDATE, 'driver_associations')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDriverAssociationDto) {
    return this.service.update(id, dto);
  }

  /** Les membres repassent privés */
  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @AuditAction(ActionType.DELETE, 'driver_associations')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  /** Membres : ?search=&page=&limit= */
  @Get(':id/members')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  members(@Param('id', ParseUUIDPipe) id: string, @Query() query: AssociationDriversQueryDto) {
    return this.service.members(id, query);
  }

  /** Courses, chiffre d'affaires, part de l'association et gains par chauffeur : ?from=&to= */
  @Get(':id/stats')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  stats(@Param('id', ParseUUIDPipe) id: string, @Query() query: AssociationStatsQueryDto) {
    return this.service.stats(id, query);
  }
}
