// src/backup/backup.controller.ts
import {
  Body,
  Controller,
  Delete,
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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { langFrom } from 'src/backOffice/logistics/common/logistics-access';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { AuditCategory, AuditSeverity } from 'src/audit/enum/audit.enums';
import { BackupService } from './backup.service';
import { BackupRestoreService } from './backup-restore.service';
import {
  BackupFilesQueryDto,
  BackupRestoresQueryDto,
  ImportBackupDto,
  RestoreFileDto,
  StartRestoreDto,
  BackupRunsQueryDto,
  CreateBackupDatabaseDto,
  CreateBackupScheduleDto,
  ManualBackupDto,
  MysqlConnectionDto,
  UpdateBackupDatabaseDto,
  UpdateBackupScheduleDto,
} from './dto/backup.dto';

/**
 * ✅ SAUVEGARDES — réservé aux rôles BACKUP_ROLES (défaut : SUPER ADMIN)
 *
 *  GET    /backup                              état (bases, dernière sauvegarde, dossier, taille…)
 *
 *  Bases MySQL à sauvegarder
 *  GET    /backup/databases                    liste (sans mot de passe)
 *  POST   /backup/databases                    { name, databaseName, host, port, username, password | useAppCredentials, excludeTables?, isDefault? }
 *  POST   /backup/databases/test               tester des identifiants avant d'enregistrer
 *  POST   /backup/databases/discover           bases présentes sur un serveur MySQL (SHOW DATABASES)
 *  GET    /backup/databases/:id                détail (+ programmations, dernières sauvegardes)
 *  PATCH  /backup/databases/:id                modifier (password vide = inchangé, clearPassword pour l'effacer)
 *  POST   /backup/databases/:id/test           tester la connexion enregistrée
 *  PATCH  /backup/databases/:id/default        définir comme base par défaut
 *  POST   /backup/databases/:id/backup         sauvegarder cette base maintenant { includeUploads? }
 *  DELETE /backup/databases/:id                supprimer (ou désactiver si des sauvegardes existent)
 *
 *  GET    /backup/schedules?databaseId=        programmations (+ base, prochaine exécution)
 *  POST   /backup/schedules                    { name, times:["02:00"], days?, timezone?, keepLast?, includeUploads?, isActive?, databaseId? }
 *  PATCH  /backup/schedules/:id                modifier / activer / désactiver / changer de base
 *  DELETE /backup/schedules/:id
 *  POST   /backup/schedules/:id/run            lancer maintenant
 *  POST   /backup/create                       sauvegarde manuelle { includeUploads?, databaseId? }
 *  GET    /backup/runs                         historique ?status=&scheduleId=&databaseId=&page=&limit=
 *  GET    /backup/list?databaseId=             fichiers présents (avec leur base d'origine)
 *  GET    /backup/download/:filename           télécharger
 *  DELETE /backup/files/:filename              supprimer un fichier
 *
 *  ✅ Restauration / import / copie (super admin, BACKUP_ALLOW_RESTORE=true) — en arrière-plan, suivre la progression
 *  GET    /backup/files/:filename/inspect      analyse du fichier (outil, version, base d'origine, tables…)
 *  POST   /backup/restores                     { fileName | sourceDatabaseId, databaseId?, newDatabaseName?, registerDatabase?,
 *                                                safetyBackup?, continueOnError?, confirm: "RESTAURER", confirmDatabaseName }
 *  POST   /backup/restore/:filename            même chose, fichier dans l'URL (ancienne route)
 *  POST   /backup/import                       multipart « file » (.sql / .sql.gz) + databaseId? ; restore=true + mêmes champs pour restaurer
 *  GET    /backup/restores                     historique ?status=&databaseId=&page=&limit=
 *  GET    /backup/restores/:id                 détail / progression (phase, progress, bytesDone…)
 */
const importMaxBytes = () => Math.max(1, Number(process.env.BACKUP_IMPORT_MAX_MB || 2048)) * 1024 * 1024;
const backupDir = () => process.env.BACKUP_DIR?.trim() || path.join(process.cwd(), 'backups');
const importStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(backupDir(), '.incoming');
    try {
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (e: any) {
      cb(e, dir);
    }
  },
  filename: (_req, _file, cb) => cb(null, `${Date.now()}_${randomBytes(6).toString('hex')}.part`),
});

@ApiTags('Sauvegardes')
@ApiBearerAuth()
@Controller('backup')
@UseGuards(AuthentificationGuard)
export class BackupController {
  constructor(
    private readonly backupService: BackupService,
    private readonly restoreService: BackupRestoreService,
  ) {}

  /** Restauration / import : super administrateur uniquement */
  private assertSuperAdmin(user: UserEntity) {
    const r: any = (user as any)?.role;
    if (String(Array.isArray(r) ? r[0] : r ?? '').toUpperCase() !== 'SUPER ADMIN') {
      throw new ForbiddenException('Seul un super administrateur peut restaurer ou importer une base');
    }
  }

  private assertAllowed(user: UserEntity) {
    const roles = String(process.env.BACKUP_ROLES || 'SUPER ADMIN')
      .split(',')
      .map((r) => r.trim().toUpperCase())
      .filter(Boolean);
    const role = String((user as any)?.role || '').toUpperCase();
    if (!roles.includes(role)) throw new ForbiddenException('Accès réservé aux super administrateurs');
  }

  @Get()
  info(@CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.backupService.info();
  }

  // ---------------- Bases MySQL ----------------
  @Get('databases')
  databases(@CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.backupService.listDatabases();
  }

  @Post('databases')
  @AuditAction(ActionType.CONFIG_CHANGE, 'backup_databases', { category: AuditCategory.ADMIN, severity: AuditSeverity.WARNING })
  createDatabase(@Req() req: Request, @Body() dto: CreateBackupDatabaseDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.backupService.createDatabase(dto, user.id, langFrom(req));
  }

  @Post('databases/test')
  @HttpCode(HttpStatus.OK)
  testConnection(@Req() req: Request, @Body() dto: MysqlConnectionDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.backupService.testConnection(dto, langFrom(req));
  }

  @Post('databases/discover')
  @HttpCode(HttpStatus.OK)
  discover(@Req() req: Request, @Body() dto: MysqlConnectionDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.backupService.discover(dto, langFrom(req));
  }

  @Get('databases/:id')
  database(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.backupService.findDatabase(id);
  }

  @Patch('databases/:id')
  @AuditAction(ActionType.CONFIG_CHANGE, 'backup_databases', { category: AuditCategory.ADMIN, severity: AuditSeverity.WARNING })
  updateDatabase(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBackupDatabaseDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.backupService.updateDatabase(id, dto, langFrom(req));
  }

  @Post('databases/:id/test')
  @HttpCode(HttpStatus.OK)
  testDatabase(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.backupService.testDatabase(id, langFrom(req));
  }

  @Patch('databases/:id/default')
  @AuditAction(ActionType.CONFIG_CHANGE, 'backup_databases', { category: AuditCategory.ADMIN, severity: AuditSeverity.WARNING })
  setDefault(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.backupService.setDefaultDatabase(id, langFrom(req));
  }

  @Post('databases/:id/backup')
  backupDatabase(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ManualBackupDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.backupService.manualBackup(user.id, !!dto?.includeUploads, id, langFrom(req));
  }

  @Delete('databases/:id')
  @AuditAction(ActionType.CONFIG_CHANGE, 'backup_databases', { category: AuditCategory.ADMIN, severity: AuditSeverity.WARNING })
  deleteDatabase(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.backupService.deleteDatabase(id, langFrom(req));
  }

  // ---------------- Programmations ----------------
  @Get('schedules')
  schedules(@CurrentUser() user: UserEntity, @Query('databaseId') databaseId?: string) {
    this.assertAllowed(user);
    return this.backupService.listSchedules(databaseId || undefined);
  }

  @Post('schedules')
  createSchedule(@Req() req: Request, @Body() dto: CreateBackupScheduleDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.backupService.createSchedule(dto, user.id, langFrom(req));
  }

  @Patch('schedules/:id')
  updateSchedule(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBackupScheduleDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.backupService.updateSchedule(id, dto, langFrom(req));
  }

  @Delete('schedules/:id')
  deleteSchedule(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.backupService.deleteSchedule(id);
  }

  @Post('schedules/:id/run')
  @HttpCode(HttpStatus.OK)
  runSchedule(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.backupService.runScheduleNow(id, user.id);
  }

  // ---------------- Sauvegarde manuelle / historique ----------------
  @Post('create')
  createBackup(@Req() req: Request, @Body() dto: ManualBackupDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.backupService.manualBackup(user.id, !!dto?.includeUploads, dto?.databaseId ?? null, langFrom(req));
  }

  @Get('runs')
  runs(@Query() q: BackupRunsQueryDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.backupService.listRuns(q);
  }

  // ---------------- Fichiers ----------------
  @Get('list')
  async list(@Query() q: BackupFilesQueryDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    const files = await this.backupService.listFiles(q);
    return { success: true, message: 'Fichiers de sauvegarde', data: files, backups: files.map((f) => f.fileName) };
  }

  @Get('download/:filename')
  download(@Param('filename') filename: string, @CurrentUser() user: UserEntity, @Res() res: Response) {
    this.assertAllowed(user);
    const full = this.backupService.filePath(filename);
    return res.download(full, filename);
  }

  @Delete('files/:filename')
  deleteFile(@Param('filename') filename: string, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.backupService.deleteFile(filename);
  }

  // ---------------- ✅ Restauration / import / copie ----------------
  @Get('files/:filename/inspect')
  inspect(@Req() req: Request, @Param('filename') filename: string, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.restoreService.inspect(filename, langFrom(req));
  }

  @Post('restores')
  @AuditAction(ActionType.RESTORE, 'backup_restores', { category: AuditCategory.ADMIN, severity: AuditSeverity.CRITICAL })
  startRestore(@Req() req: Request, @Body() dto: StartRestoreDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    this.assertSuperAdmin(user);
    return this.restoreService.start(dto, user as any, langFrom(req));
  }

  @Post('restore/:filename')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.RESTORE, 'backup_restores', { category: AuditCategory.ADMIN, severity: AuditSeverity.CRITICAL })
  restore(@Req() req: Request, @Param('filename') filename: string, @Body() dto: RestoreFileDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    this.assertSuperAdmin(user);
    return this.restoreService.start({ ...dto, fileName: filename, sourceDatabaseId: undefined }, user as any, langFrom(req));
  }

  @Post('import')
  @AuditAction(ActionType.RESTORE, 'backup_runs', { category: AuditCategory.ADMIN, severity: AuditSeverity.CRITICAL })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: importStorage,
      limits: { fileSize: importMaxBytes(), files: 1 },
    }),
  )
  importBackup(@Req() req: Request, @UploadedFile() file: Express.Multer.File, @Body() dto: ImportBackupDto, @CurrentUser() user: UserEntity) {
    try {
      this.assertAllowed(user);
      this.assertSuperAdmin(user);
    } catch (e) {
      if (file?.path) fs.rmSync(file.path, { force: true });
      throw e;
    }
    return this.restoreService.importFile(file, dto, user as any, langFrom(req));
  }

  @Get('restores')
  restores(@Req() req: Request, @Query() q: BackupRestoresQueryDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.restoreService.list(q, langFrom(req));
  }

  @Get('restores/:id')
  restoreDetail(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.restoreService.findOne(id, langFrom(req));
  }
}
