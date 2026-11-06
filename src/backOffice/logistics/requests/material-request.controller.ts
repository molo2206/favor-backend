import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { langFrom } from '../common/logistics-access';
import { MaterialRequestService } from './material-request.service';
import {
  AddLogisticsManagerDto,
  ApproveMaterialRequestDto,
  CreateMaterialRequestDto,
  IssueMaterialRequestDto,
  MaterialRequestQueryDto,
  RejectMaterialRequestDto,
} from './dto/material-request.dto';

/**
 * BackOffice — Logistique : demandes de matériel (employé → logisticien → sortie) et logisticiens désignés.
 * Préfixe : /backoffice/logistics
 */
@Controller('backoffice/logistics')
@UseGuards(AuthentificationGuard)
export class MaterialRequestController {
  constructor(private readonly service: MaterialRequestService) { }

  // ---------- Logisticiens désignés ----------
  @Get('managers')
  managers(@Req() req: Request, @CurrentUser() user: UserEntity, @Query('companyId') companyId?: string) {
    return this.service.listManagers(user, langFrom(req), companyId);
  }

  /** Propriétaire : désigner un logisticien */
  @Post('managers')
  @AuditAction(ActionType.CREATE, 'logistics_manager')
  addManager(@Req() req: Request, @Body() dto: AddLogisticsManagerDto, @CurrentUser() user: UserEntity) {
    return this.service.addManager(dto, user, langFrom(req));
  }

  @Delete('managers/:id')
  @AuditAction(ActionType.DELETE, 'logistics_manager')
  removeManager(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.removeManager(id, user, langFrom(req));
  }

  // ---------- Demandes ----------
  /** Employé : nouvelle demande (multipart possible : `image` + `items` en JSON) */
  @Post('requests')
  @AuditAction(ActionType.CREATE, 'material_request')
  @UseInterceptors(FileInterceptor('image'))
  create(@Req() req: Request, @Body() dto: CreateMaterialRequestDto, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: UserEntity) {
    return this.service.create(dto, file, user, langFrom(req));
  }

  /** Logisticien : toutes les demandes ; employé : les siennes */
  @Get('requests')
  list(@Req() req: Request, @Query() query: MaterialRequestQueryDto, @CurrentUser() user: UserEntity) {
    return this.service.list(query, user, langFrom(req));
  }

  @Get('requests/:id')
  findOne(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.findOne(id, user, langFrom(req));
  }

  @Patch('requests/:id/approve')
  @AuditAction(ActionType.UPDATE, 'material_request')
  approve(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveMaterialRequestDto, @CurrentUser() user: UserEntity) {
    return this.service.approve(id, dto ?? {}, user, langFrom(req));
  }

  @Patch('requests/:id/reject')
  @AuditAction(ActionType.UPDATE, 'material_request')
  reject(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectMaterialRequestDto, @CurrentUser() user: UserEntity) {
    return this.service.reject(id, dto, user, langFrom(req));
  }

  @Patch('requests/:id/cancel')
  @AuditAction(ActionType.UPDATE, 'material_request')
  cancel(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.cancel(id, user, langFrom(req));
  }

  /** Logisticien : sortie du matériel accordé → remises à l'employé + bon de sortie */
  @Post('requests/:id/issue')
  @AuditAction(ActionType.UPDATE, 'material_request')
  @UseInterceptors(FileInterceptor('image'))
  issue(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IssueMaterialRequestDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: UserEntity,
  ) {
    return this.service.issue(id, dto, file, user, langFrom(req));
  }

  @Get('requests/:id/delivery-note')
  deliveryNote(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.service.deliveryNote(id, user, langFrom(req));
  }
}
