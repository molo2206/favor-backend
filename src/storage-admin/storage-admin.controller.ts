// src/storage-admin/storage-admin.controller.ts
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
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
import { diskStorage } from 'multer';
import * as os from 'os';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { langFrom } from 'src/backOffice/logistics/common/logistics-access';
import { AuditAction, SkipAudit } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { AuditCategory, AuditSeverity } from 'src/audit/enum/audit.enums';
import { FileManagerService } from './file-manager.service';
import { RejectedCleanupService } from './rejected-cleanup.service';
import {
  FmCreateFolderDto,
  FmDeleteDto,
  FmDownloadQueryDto,
  FmEmptyTrashDto,
  FmListQueryDto,
  FmMoveDto,
  FmOrphanCleanDto,
  FmOrphanListDto,
  FmOrphanScanDto,
  FmPathQueryDto,
  FmRenameDto,
  FmSearchQueryDto,
  FmTrashIdsDto,
  FmTrashQueryDto,
  FmUploadDto,
  PurgeRejectedDto,
} from './file-manager.dto';

const maxUploadBytes = () => Math.max(1, Number(process.env.FILE_MANAGER_MAX_MB || 500)) * 1024 * 1024;
const upload = FilesInterceptor('files', 20, {
  storage: diskStorage({
    destination: os.tmpdir(),
    filename: (_req, _file, cb) => cb(null, `fm_${Date.now()}_${randomBytes(6).toString('hex')}.part`),
  }),
  limits: { fileSize: maxUploadBytes() },
});

/**
 * ✅ GESTIONNAIRE DE FICHIERS + PURGE DES REJETÉS (rôles FILE_MANAGER_ROLES, défaut : SUPER ADMIN)
 *
 *  Fichiers (?root=storage|legacy|hr|backups, path = chemin relatif)
 *  GET    /file-manager/roots                    dossiers racines + espace disque
 *  GET    /file-manager/list                     ?root=&path=&search=&kind=&sort=name|size|date&order=&page=&limit=
 *  GET    /file-manager/search                   ?root=&path=&q=&kind=&minSizeMb=&limit=   (récursif)
 *  GET    /file-manager/info                     ?root=&path=   (taille, où le fichier est utilisé en base)
 *  GET    /file-manager/download                 ?root=&path=&inline=true
 *  POST   /file-manager/upload                   multipart « files » (1-20) + root, path, overwrite?
 *  POST   /file-manager/folders                  { root, path, name }
 *  PATCH  /file-manager/rename                   { root, path, newName, force? }
 *  POST   /file-manager/move                     { root, paths[], destination, destinationRoot?, copy?, force? }
 *  POST   /file-manager/delete                   { root, paths[], force?, permanent? }   (corbeille par défaut)
 *  GET    /file-manager/stats                    ?root=&refresh=true   (espace par dossier / type, plus gros fichiers)
 *
 *  Corbeille (30 jours)
 *  GET    /file-manager/trash                    ?root=&reason=&search=&page=&limit=
 *  GET    /file-manager/trash/:id/file           aperçu / téléchargement
 *  POST   /file-manager/trash/restore            { ids[], overwrite? }
 *  POST   /file-manager/trash/empty              { ids? | expiredOnly?, confirm: "VIDER" }
 *
 *  Fichiers orphelins (sur le disque mais utilisés nulle part en base)
 *  POST   /file-manager/orphans/scan             { root?, olderThanDays? (7), path? }   (en arrière-plan)
 *  GET    /file-manager/orphans                  ?folder=&kind=&page=&limit=   (résultat + état du scan)
 *  POST   /file-manager/orphans/clean            { paths? | folder?, confirm: "NETTOYER" }   (→ corbeille)
 *
 *  Produits / entreprises rejetés
 *  POST   /cleanup/rejected                      { target?: PRODUCTS|COMPANIES|ALL, olderThanDays?, productIds?, companyIds?,
 *                                                  dryRun? (true par défaut), permanentFiles?, confirm: "SUPPRIMER" }
 */
@ApiTags('Gestionnaire de fichiers')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthentificationGuard)
export class StorageAdminController {
  constructor(
    private readonly files: FileManagerService,
    private readonly cleanup: RejectedCleanupService,
  ) {}

  private assertAllowed(user: UserEntity) {
    const roles = String(process.env.FILE_MANAGER_ROLES || 'SUPER ADMIN')
      .split(',')
      .map((r) => r.trim().toUpperCase())
      .filter(Boolean);
    const r: any = (user as any)?.role;
    if (!roles.includes(String(Array.isArray(r) ? r[0] : r ?? '').toUpperCase())) {
      throw new ForbiddenException('Accès réservé aux super administrateurs');
    }
  }

  // ---------------- Parcours ----------------
  @Get('file-manager/roots')
  roots(@Req() req: Request, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.files.roots(langFrom(req));
  }

  @Get('file-manager/list')
  @SkipAudit()
  list(@Req() req: Request, @Query() q: FmListQueryDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.files.list(q, langFrom(req));
  }

  @Get('file-manager/search')
  @SkipAudit()
  search(@Req() req: Request, @Query() q: FmSearchQueryDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.files.search(q, langFrom(req));
  }

  @Get('file-manager/info')
  @SkipAudit()
  info(@Req() req: Request, @Query() q: FmPathQueryDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.files.info(q, langFrom(req));
  }

  @Get('file-manager/download')
  @AuditAction(ActionType.EXPORT, 'file_manager', { category: AuditCategory.ADMIN, severity: AuditSeverity.INFO, skipResponse: true })
  download(@Req() req: Request, @Query() q: FmDownloadQueryDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.files.download(q, langFrom(req));
  }

  @Get('file-manager/stats')
  stats(@Req() req: Request, @Query('root') root: string, @Query('refresh') refresh: string, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.files.stats(root, refresh === 'true', langFrom(req));
  }

  // ---------------- Modifications ----------------
  @Post('file-manager/upload')
  @UseInterceptors(upload)
  @AuditAction(ActionType.CREATE, 'file_manager', { category: AuditCategory.ADMIN, severity: AuditSeverity.WARNING })
  upload(@Req() req: Request, @UploadedFiles() files: Express.Multer.File[], @Body() dto: FmUploadDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.files.upload(files, dto, langFrom(req));
  }

  @Post('file-manager/folders')
  @AuditAction(ActionType.CREATE, 'file_manager', { category: AuditCategory.ADMIN, severity: AuditSeverity.INFO })
  createFolder(@Req() req: Request, @Body() dto: FmCreateFolderDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.files.createFolder(dto, langFrom(req));
  }

  @Patch('file-manager/rename')
  @AuditAction(ActionType.UPDATE, 'file_manager', { category: AuditCategory.ADMIN, severity: AuditSeverity.WARNING })
  rename(@Req() req: Request, @Body() dto: FmRenameDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.files.rename(dto, langFrom(req));
  }

  @Post('file-manager/move')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.UPDATE, 'file_manager', { category: AuditCategory.ADMIN, severity: AuditSeverity.WARNING })
  move(@Req() req: Request, @Body() dto: FmMoveDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.files.move(dto, langFrom(req));
  }

  @Post('file-manager/delete')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.DELETE, 'file_manager', { category: AuditCategory.ADMIN, severity: AuditSeverity.CRITICAL })
  remove(@Req() req: Request, @Body() dto: FmDeleteDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.files.remove(dto, user as any, langFrom(req));
  }

  // ---------------- Corbeille ----------------
  @Get('file-manager/trash')
  trash(@Req() req: Request, @Query() q: FmTrashQueryDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.files.listTrash(q, langFrom(req));
  }

  @Get('file-manager/trash/:id/file')
  @SkipAudit()
  trashFile(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Query('inline') inline: string, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.files.trashFile(id, inline !== 'false', langFrom(req));
  }

  @Post('file-manager/trash/restore')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.RESTORE, 'file_manager', { category: AuditCategory.ADMIN, severity: AuditSeverity.WARNING })
  restore(@Req() req: Request, @Body() dto: FmTrashIdsDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.files.restore(dto, langFrom(req));
  }

  @Post('file-manager/trash/empty')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.DELETE, 'file_manager', { category: AuditCategory.ADMIN, severity: AuditSeverity.CRITICAL })
  emptyTrash(@Req() req: Request, @Body() dto: FmEmptyTrashDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.files.emptyTrash(dto, langFrom(req));
  }

  // ---------------- Orphelins ----------------
  @Post('file-manager/orphans/scan')
  @HttpCode(HttpStatus.OK)
  orphanScan(@Req() req: Request, @Body() dto: FmOrphanScanDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.files.startOrphanScan(dto, langFrom(req));
  }

  @Get('file-manager/orphans')
  @SkipAudit()
  orphans(@Req() req: Request, @Query() q: FmOrphanListDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.files.orphans(q, langFrom(req));
  }

  @Post('file-manager/orphans/clean')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.DELETE, 'file_manager', { category: AuditCategory.ADMIN, severity: AuditSeverity.CRITICAL })
  cleanOrphans(@Req() req: Request, @Body() dto: FmOrphanCleanDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.files.cleanOrphans(dto, user as any, langFrom(req));
  }

  // ---------------- Produits / entreprises rejetés ----------------
  @Post('cleanup/rejected')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.DELETE, 'rejected_cleanup', { category: AuditCategory.ADMIN, severity: AuditSeverity.CRITICAL, skipResponse: true })
  purgeRejected(@Req() req: Request, @Body() dto: PurgeRejectedDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.cleanup.purge(dto, user as any, langFrom(req));
  }
}
