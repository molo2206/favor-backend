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
  UseGuards,
} from '@nestjs/common';
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
import {
  BackupFilesQueryDto,
  BackupRunsQueryDto,
  CreateBackupDatabaseDto,
  CreateBackupScheduleDto,
  ManualBackupDto,
  MysqlConnectionDto,
  RestoreBackupDto,
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
 *  POST   /backup/restore/:filename            { confirm: "RESTAURER" } — dans la base d'origine, si BACKUP_ALLOW_RESTORE=true
 */
@ApiTags('Sauvegardes')
@ApiBearerAuth()
@Controller('backup')
@UseGuards(AuthentificationGuard)
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

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

  @Post('restore/:filename')
  @HttpCode(HttpStatus.OK)
  restore(@Param('filename') filename: string, @Body() dto: RestoreBackupDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.backupService.restore(filename, user.id);
  }
}
