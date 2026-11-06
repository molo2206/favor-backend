import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { VehicleRegistrationService } from './vehicle-registration.service';
import { VEHICLE_DOCUMENTS, VEHICLE_MAX_IMAGES } from './enums/vehicle-registration.enum';
import {
  CreateVehicleRegistrationDto,
  UpdateVehicleRegistrationDto,
  UpdateVehicleRegistrationStatusDto,
  VehicleRegistrationQueryDto,
} from './dto/vehicle-registration.dto';

const SUPPORTED_LANGS = ['fr', 'en', 'es', 'sw', 'ar'];

/**
 * Enregistrement des véhicules (vente / location) : véhicule + propriétaire + commissionnaire + images.
 * Préfixe : /vehicle-registrations — multipart/form-data, images dans le champ « images » (20 max).
 */
@Controller('vehicle-registrations')
@UseGuards(AuthentificationGuard)
export class VehicleRegistrationController {
  constructor(private readonly service: VehicleRegistrationService) { }

  private lang(req: Request): string {
    const raw = String(req.headers['accept-language'] || 'fr').split(',')[0].split(';')[0].trim().slice(0, 2);
    return SUPPORTED_LANGS.includes(raw) ? raw : 'fr';
  }

  /** Enregistrer un véhicule */
  @Post()
  @AuditAction(ActionType.CREATE, 'vehicle_registrations')
  @UseInterceptors(FilesInterceptor('images', VEHICLE_MAX_IMAGES))
  create(
    @Req() req: Request,
    @Body() dto: CreateVehicleRegistrationDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.create(dto, files, user, this.lang(req));
  }

  /** Liste (filtres, recherche, pagination). Utilisateur simple : seulement ses enregistrements */
  @Get()
  findAll(@Req() req: Request, @Query() query: VehicleRegistrationQueryDto, @CurrentUser() user: UserEntity) {
    return this.service.findAll(query, user, this.lang(req));
  }

  /** Valeurs proposées au front (documents, états, statuts…) */
  @Get('options')
  options() {
    return {
      message: 'OK',
      data: {
        registrationTypes: ['SALE', 'RENTAL'],
        transmissions: ['MANUAL', 'AUTOMATIC', 'SEMI_AUTOMATIQUE'],
        engineConditions: ['EXCELLENT', 'GOOD', 'AVERAGE', 'NEEDS_REPAIR', 'NOT_WORKING'],
        originalities: ['ORIGINAL', 'MODIFIED', 'ACCIDENTED', 'MODIFIED_AND_ACCIDENTED'],
        statuses: ['AVAILABLE', 'RESERVED', 'SOLD', 'RENTED', 'WITHDRAWN'],
        documents: VEHICLE_DOCUMENTS,
        maxImages: VEHICLE_MAX_IMAGES,
      },
    };
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.findOne(id, user, this.lang(req));
  }

  /** Modifier (+ nouvelles images dans « images », images à retirer dans « removeImages ») */
  @Patch(':id')
  @AuditAction(ActionType.UPDATE, 'vehicle_registrations')
  @UseInterceptors(FilesInterceptor('images', VEHICLE_MAX_IMAGES))
  update(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleRegistrationDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.update(id, dto, files, user, this.lang(req));
  }

  /** Changer la situation : disponible, réservé, vendu, loué, retiré */
  @Patch(':id/status')
  @AuditAction(ActionType.UPDATE, 'vehicle_registrations')
  updateStatus(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleRegistrationStatusDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.updateStatus(id, dto, user, this.lang(req));
  }

  /** Supprimer (suppression douce) */
  @Delete(':id')
  @AuditAction(ActionType.DELETE, 'vehicle_registrations')
  remove(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.remove(id, user, this.lang(req));
  }
}
