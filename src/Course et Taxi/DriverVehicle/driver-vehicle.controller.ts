// driver-vehicle.controller.ts
import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Patch,
  Delete,
  UseGuards,
  UploadedFiles,
  UseInterceptors,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Roles } from 'src/users/utility/decorators/roles.decorator';
import { UserRole } from 'src/users/enum/user-role-enum';
import { UpdateVehicleCommissionDto } from './dto/update-vehicle-commission.dto';
import { AdminDriverVehicleQueryDto, AdminUpdateDriverVehicleDto, ReviewVehicleKycDto } from './dto/admin-driver-vehicle.dto';
import { DriverVehicleService } from './driver-vehicle.service';
import { CreateDriverVehicleDto } from './dto/create-driver-vehicle.dto';
import { UpdateDriverVehicleDto } from './dto/update-driver-vehicle.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { RolesGuard } from 'src/users/utility/decorators/roles.guard';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { CreateDriverVehicleByAdminDto } from './dto/create-driver-vehicle-byadmin.dto';
import { FileFieldsInterceptor } from '@nestjs/platform-express';

@Controller('driver-vehicles')
export class DriverVehicleController {
  constructor(private readonly service: DriverVehicleService) {}

  @Post()
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuditAction(ActionType.CREATE, 'driver_vehicles')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'registration', maxCount: 1 },
      { name: 'assurance', maxCount: 1 },
      { name: 'permi', maxCount: 1 },
      { name: 'photos', maxCount: 10 },
    ]),
  )
  create(
    @Body() dto: CreateDriverVehicleDto,
    @UploadedFiles()
    files: {
      registration?: Express.Multer.File[];
      assurance?: Express.Multer.File[];
      permi?: Express.Multer.File[];
      photos?: Express.Multer.File[];
    },
    @CurrentUser() user: UserEntity,
  ) {
    const transformedFiles = {
      registration: files?.registration?.[0],
      assurance: files?.assurance?.[0],
      permi: files?.permi?.[0],
      photos: files?.photos,
    };
    return this.service.create(dto, user, transformedFiles);
  }

  @Post('by/admin')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN) // ✅ réservé à l'administration
  @AuditAction(ActionType.CREATE, 'driver_vehicles')
  createByadmin(@Body() dto: CreateDriverVehicleByAdminDto) {
    return this.service.createByadmin(dto);
  }

  // Tous les véhicules d’un chauffeur
  @Get('vehicles/bydriver')
  @UseGuards(AuthentificationGuard, RolesGuard)
  findByDriver(@CurrentUser() user: UserEntity) {
    return this.service.findAllByDriver(user.id);
  }

  @Post('admin')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN) // ✅ réservé à l'administration
  @AuditAction(ActionType.CREATE, 'driver_vehicles')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'registration', maxCount: 1 },
      { name: 'assurance', maxCount: 1 },
      { name: 'permi', maxCount: 1 },
      { name: 'photos', maxCount: 10 },
    ]),
  )
  async createByAdmin(
    @Body() dto: CreateDriverVehicleByAdminDto,
    @UploadedFiles()
    files: {
      registration?: Express.Multer.File[];
      assurance?: Express.Multer.File[];
      permi?: Express.Multer.File[];
      photos?: Express.Multer.File[];
    },
  ) {
    const transformedFiles = {
      registration: files?.registration?.[0],
      assurance: files?.assurance?.[0],
      permi: files?.permi?.[0],
      photos: files?.photos,
    };

    return this.service.createByadmin(dto, transformedFiles);
  }

  // ============================================================
  // ✅ ADMINISTRATION DES VÉHICULES DES CHAUFFEURS
  // ============================================================

  /** Liste : ?kycStatus=PENDING|APPROVED|REJECTED&driverId=&categoryId=&search=&active=true|false|all&page=&limit= */
  @Get('admin/list')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  adminList(@Query() query: AdminDriverVehicleQueryDto) {
    return this.service.adminList(query);
  }

  /** Véhicules + commission (filtres : driverId, categoryId) */
  @Get('admin/commissions')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  listCommissions(@Query('driverId') driverId?: string, @Query('categoryId') categoryId?: string) {
    return this.service.listWithCommission({ driverId, categoryId });
  }

  /** Fiche complète : chauffeur, catégorie, documents, photos, statut, commission */
  @Get('admin/:id')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  adminFindOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.adminFindOne(id);
  }

  /**
   * Modifier n'importe quel véhicule (multipart : registration, assurance, permi, photos + champs).
   * Champs : driverId, categoryId, model, plateNumber, color, year, isDefault, isActive, commissionRate,
   * kycStatus, kycRejectionReason, replacePhotos, removePhotos, removeDocuments.
   */
  @Patch('admin/:id')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @AuditAction(ActionType.UPDATE, 'driver_vehicles')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'registration', maxCount: 1 },
      { name: 'assurance', maxCount: 1 },
      { name: 'permi', maxCount: 1 },
      { name: 'photos', maxCount: 10 },
    ]),
  )
  adminUpdate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateDriverVehicleDto,
    @UploadedFiles()
    files: {
      registration?: Express.Multer.File[];
      assurance?: Express.Multer.File[];
      permi?: Express.Multer.File[];
      photos?: Express.Multer.File[];
    },
    @CurrentUser() admin: UserEntity,
  ) {
    return this.service.adminUpdate(id, dto, admin, {
      registration: files?.registration?.[0],
      assurance: files?.assurance?.[0],
      permi: files?.permi?.[0],
      photos: files?.photos,
    });
  }

  /** Valider / refuser les documents : { "status": "APPROVED" } ou { "status": "REJECTED", "reason": "Assurance expirée" } */
  @Patch('admin/:id/kyc')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @AuditAction(ActionType.UPDATE, 'driver_vehicles')
  reviewKyc(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewVehicleKycDto, @CurrentUser() admin: UserEntity) {
    return this.service.reviewKyc(id, dto, admin);
  }

  // ============================================================
  // ✅ COMMISSION PAR VÉHICULE (admin)
  // ============================================================

  /** Fixer la commission d'un véhicule : { "commissionRate": 15 } (null = valeur par défaut) */
  @Patch(':id/commission')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @AuditAction(ActionType.UPDATE, 'driver_vehicles')
  setCommission(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVehicleCommissionDto) {
    return this.service.setCommission(id, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @AuditAction(ActionType.UPDATE, 'driver_vehicles')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'registration', maxCount: 1 },
      { name: 'assurance', maxCount: 1 },
      { name: 'permi', maxCount: 1 },
      { name: 'photos', maxCount: 10 },
    ]),
  )
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDriverVehicleDto,
    @UploadedFiles()
    files: {
      registration?: Express.Multer.File[];
      assurance?: Express.Multer.File[];
      permi?: Express.Multer.File[];
      photos?: Express.Multer.File[];
    },
    @CurrentUser() user: UserEntity,
  ) {
    const transformedFiles = {
      registration: files?.registration?.[0],
      assurance: files?.assurance?.[0],
      permi: files?.permi?.[0],
      photos: files?.photos,
    };
    return this.service.update(id, dto, user, transformedFiles);
  }
  /** ✅ Suppression : le chauffeur propriétaire ou un admin (avant : sans connexion) */
  @Delete(':id')
  @UseGuards(AuthentificationGuard)
  @AuditAction(ActionType.DELETE, 'driver_vehicles')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.remove(id, user);
  }
}
