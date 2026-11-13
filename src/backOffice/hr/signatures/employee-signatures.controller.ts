// src/backOffice/hr/signatures/employee-signatures.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { langFrom } from 'src/backOffice/logistics/common/logistics-access';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { AuditCategory } from 'src/audit/enum/audit.enums';
import { EmployeeSignaturesService } from './employee-signatures.service';

const upload = FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } });

/**
 * ✅ SIGNATURES DES EMPLOYÉS
 *  GET    /hr/employee-signatures/me?companyId           ma signature (ma fiche employé dans l'entreprise active)
 *  PUT    /hr/employee-signatures/me?companyId           enregistrer / remplacer : multipart « file » (PNG, JPG, WEBP)
 *                                                        ou JSON { image: "data:image/png;base64,…" } (signature dessinée)
 *  DELETE /hr/employee-signatures/me?companyId           supprimer ma signature
 *  GET    /hr/employee-signatures/:employeeId            signature d'un employé (collègue, propriétaire, admin)
 *  PUT    /hr/employee-signatures/:employeeId            enregistrer pour un employé (lui-même, propriétaire, admin)
 *  DELETE /hr/employee-signatures/:employeeId            supprimer
 */
@ApiTags('Signatures des employés')
@ApiBearerAuth()
@Controller('hr/employee-signatures')
@UseGuards(AuthentificationGuard)
export class EmployeeSignaturesController {
  constructor(private readonly service: EmployeeSignaturesService) {}

  @Get('me')
  getMine(@Req() req: Request, @CurrentUser() user: UserEntity, @Query('companyId') companyId?: string) {
    return this.service.getMine(user, companyId, langFrom(req));
  }

  @Put('me')
  @UseInterceptors(upload)
  @AuditAction(ActionType.UPDATE, 'hr_employee_signatures', { category: AuditCategory.SECURITY })
  saveMine(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @UploadedFile() file: Express.Multer.File,
    @Body('image') image?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.service.saveMine(user, companyId, file, image, langFrom(req));
  }

  @Delete('me')
  @AuditAction(ActionType.DELETE, 'hr_employee_signatures', { category: AuditCategory.SECURITY })
  removeMine(@Req() req: Request, @CurrentUser() user: UserEntity, @Query('companyId') companyId?: string) {
    return this.service.removeMine(user, companyId, langFrom(req));
  }

  @Get(':employeeId')
  getFor(@Req() req: Request, @CurrentUser() user: UserEntity, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.service.getForEmployee(user, employeeId, langFrom(req));
  }

  @Put(':employeeId')
  @UseInterceptors(upload)
  @AuditAction(ActionType.UPDATE, 'hr_employee_signatures', { category: AuditCategory.SECURITY })
  saveFor(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('image') image?: string,
  ) {
    return this.service.saveForEmployee(user, employeeId, file, image, langFrom(req));
  }

  @Delete(':employeeId')
  @AuditAction(ActionType.DELETE, 'hr_employee_signatures', { category: AuditCategory.SECURITY })
  removeFor(@Req() req: Request, @CurrentUser() user: UserEntity, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.service.removeForEmployee(user, employeeId, langFrom(req));
  }
}
