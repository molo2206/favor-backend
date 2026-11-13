// src/backOffice/hr/employee-documents/employee-documents.controller.ts
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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { langFrom } from 'src/backOffice/logistics/common/logistics-access';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { EmployeeDocumentsService } from './employee-documents.service';
import {
  EmployeeDocumentsQueryDto,
  ExpiringDocumentsQueryDto,
  UpdateEmployeeDocumentDto,
  UploadEmployeeDocumentsDto,
} from './employee-documents.dto';

const MAX_FILES = 10;
const upload = FilesInterceptor('files', MAX_FILES, { limits: { fileSize: 50 * 1024 * 1024 } });

/**
 * ✅ DOSSIERS DES EMPLOYÉS
 *  GET    /hr/employees/:employeeId/documents                      liste ?category&search&status=valid|expiring|expired&page&limit
 *  POST   /hr/employees/:employeeId/documents                      joindre des fichiers : multipart « files » (1 à 10)
 *                                                                  + category, title, description, documentNumber, issuedAt, expiresAt
 *  GET    /hr/employees/:employeeId/documents/:documentId          détail
 *  GET    /hr/employees/:employeeId/documents/:documentId/download ?inline=true pour afficher dans le navigateur
 *  PATCH  /hr/employees/:employeeId/documents/:documentId          modifier (titre, catégorie, numéro, dates…)
 *  DELETE /hr/employees/:employeeId/documents/:documentId          supprimer (fichier compris)
 *  GET    /hr/employee-documents/expiring?days=30&companyId        documents expirés ou qui expirent bientôt (toute l'entreprise)
 */
@ApiTags('RH — Dossiers des employés')
@ApiBearerAuth()
@Controller('hr')
@UseGuards(AuthentificationGuard)
export class EmployeeDocumentsController {
  constructor(private readonly service: EmployeeDocumentsService) {}

  @Get('employee-documents/expiring')
  expiring(@Req() req: Request, @CurrentUser() user: UserEntity, @Query() q: ExpiringDocumentsQueryDto) {
    return this.service.expiring(user, q, langFrom(req));
  }

  @Get('employees/:employeeId/documents')
  list(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query() q: EmployeeDocumentsQueryDto,
  ) {
    return this.service.list(user, employeeId, q, langFrom(req));
  }

  @Post('employees/:employeeId/documents')
  @UseInterceptors(upload)
  @AuditAction(ActionType.CREATE, 'hr_employee_documents')
  upload(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: UploadEmployeeDocumentsDto,
  ) {
    return this.service.upload(user, employeeId, files, dto, langFrom(req));
  }

  @Get('employees/:employeeId/documents/:documentId/download')
  download(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Query('inline') inline?: string,
  ) {
    return this.service.download(user, employeeId, documentId, inline === 'true' || inline === '1', langFrom(req));
  }

  @Get('employees/:employeeId/documents/:documentId')
  findOne(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.service.findOne(user, employeeId, documentId, langFrom(req));
  }

  @Patch('employees/:employeeId/documents/:documentId')
  @AuditAction(ActionType.UPDATE, 'hr_employee_documents')
  update(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: UpdateEmployeeDocumentDto,
  ) {
    return this.service.update(user, employeeId, documentId, dto, langFrom(req));
  }

  @Delete('employees/:employeeId/documents/:documentId')
  @AuditAction(ActionType.DELETE, 'hr_employee_documents')
  remove(
    @Req() req: Request,
    @CurrentUser() user: UserEntity,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.service.remove(user, employeeId, documentId, langFrom(req));
  }
}
