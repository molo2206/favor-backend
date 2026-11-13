// src/system-settings/system-settings.controller.ts
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
  Put,
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
import { SystemSettingsService } from './system-settings.service';
import {
  BulkSystemSettingsDto,
  ExportSystemSettingsQueryDto,
  ImportSystemSettingsDto,
  SetSystemSettingActiveDto,
  SystemSettingHistoryQueryDto,
  SystemSettingsQueryDto,
  UpsertSystemSettingDto,
} from './system-settings.dto';

/**
 * ✅ PARAMÈTRES SYSTÈME (les valeurs ne sont jamais écrites dans le journal d'audit) — clés du .env gérées en base (rôles SETTINGS_ROLES, défaut : SUPER ADMIN)
 *
 *  GET    /system-settings                      liste paginée ?category=&search=&source=&secret=&pendingRestart=&page=&limit=
 *  GET    /system-settings/status               état (table, chiffrement, préchargement, synchronisation)
 *  GET    /system-settings/categories           catégories
 *  GET    /system-settings/history              historique ?key=&action=&page=&limit=
 *  GET    /system-settings/export               fichier .env ?includeSecrets=true (super admin) &effective=true
 *  POST   /system-settings/import               { source: ENV_FILE | TEXT, content?, keys?, overwrite?, onlyCatalog?, dryRun? }
 *  POST   /system-settings/reload               recharger depuis la base (cette instance)
 *  PUT    /system-settings/bulk                 { items: [{ key, value, isSecret?, isActive? }], note? }  (tout ou rien)
 *  POST   /system-settings/history/:id/rollback remettre la valeur d'avant
 *  GET    /system-settings/:key                 détail (+ 10 dernières modifications)
 *  PUT    /system-settings/:key                 { value?, isSecret?, isActive?, category?, description?, note? }
 *  PATCH  /system-settings/:key/active          { isActive }
 *  POST   /system-settings/:key/reveal          valeur en clair (super admin, journalisé)
 *  DELETE /system-settings/:key                 supprimer de la base (retour à la valeur du .env)
 */
@ApiTags('Paramètres système')
@ApiBearerAuth()
@Controller('system-settings')
@UseGuards(AuthentificationGuard)
export class SystemSettingsController {
  constructor(private readonly service: SystemSettingsService) {}

  private role(user: UserEntity): string {
    const r: any = (user as any)?.role;
    return String(Array.isArray(r) ? r[0] : r ?? '').toUpperCase();
  }

  private assertAllowed(user: UserEntity) {
    const roles = String(process.env.SETTINGS_ROLES || 'SUPER ADMIN')
      .split(',')
      .map((r) => r.trim().toUpperCase())
      .filter(Boolean);
    if (!roles.includes(this.role(user))) throw new ForbiddenException('Accès réservé aux super administrateurs');
  }

  private assertSuperAdmin(user: UserEntity) {
    if (this.role(user) !== 'SUPER ADMIN') throw new ForbiddenException('Accès réservé aux super administrateurs');
  }

  // ---------------- Routes fixes (avant /:key) ----------------
  @Get()
  list(@Req() req: Request, @Query() q: SystemSettingsQueryDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.service.list(q, langFrom(req));
  }

  @Get('status')
  status(@Req() req: Request, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.service.status(langFrom(req));
  }

  @Get('categories')
  categories(@Req() req: Request, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.service.categories(langFrom(req));
  }

  @Get('history')
  history(@Req() req: Request, @Query() q: SystemSettingHistoryQueryDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.service.listHistory(q, langFrom(req));
  }

  @Get('export')
  @AuditAction(ActionType.EXPORT, 'system_settings', { category: AuditCategory.ADMIN, severity: AuditSeverity.CRITICAL, skipResponse: true })
  async export(@Query() q: ExportSystemSettingsQueryDto, @CurrentUser() user: UserEntity, @Res() res: Response) {
    this.assertAllowed(user);
    const out = await this.service.exportEnv(q, user as any);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${out.fileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(out.content);
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.CONFIG_CHANGE, 'system_settings', { category: AuditCategory.ADMIN, severity: AuditSeverity.CRITICAL })
  import(@Req() req: Request, @Body() dto: ImportSystemSettingsDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.service.importEnv(dto, user as any, langFrom(req));
  }

  @Post('reload')
  @HttpCode(HttpStatus.OK)
  reload(@Req() req: Request, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.service.reload(langFrom(req));
  }

  @Put('bulk')
  @AuditAction(ActionType.CONFIG_CHANGE, 'system_settings', { category: AuditCategory.ADMIN, severity: AuditSeverity.CRITICAL })
  bulk(@Req() req: Request, @Body() dto: BulkSystemSettingsDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.service.bulk(dto, user as any, langFrom(req));
  }

  @Post('history/:id/rollback')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.CONFIG_CHANGE, 'system_settings', { category: AuditCategory.ADMIN, severity: AuditSeverity.CRITICAL })
  rollback(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.service.rollback(id, user as any, langFrom(req));
  }

  // ---------------- Une clé ----------------
  @Get(':key')
  findOne(@Req() req: Request, @Param('key') key: string, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.service.findOne(key, langFrom(req));
  }

  @Put(':key')
  @AuditAction(ActionType.CONFIG_CHANGE, 'system_settings', { category: AuditCategory.ADMIN, severity: AuditSeverity.CRITICAL })
  upsert(@Req() req: Request, @Param('key') key: string, @Body() dto: UpsertSystemSettingDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.service.upsert(key, dto, user as any, langFrom(req));
  }

  @Patch(':key/active')
  @AuditAction(ActionType.CONFIG_CHANGE, 'system_settings', { category: AuditCategory.ADMIN, severity: AuditSeverity.WARNING })
  setActive(@Req() req: Request, @Param('key') key: string, @Body() dto: SetSystemSettingActiveDto, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.service.setActive(key, dto.isActive, user as any, langFrom(req));
  }

  @Post(':key/reveal')
  @HttpCode(HttpStatus.OK)
  @AuditAction(ActionType.EXPORT, 'system_settings', { category: AuditCategory.SECURITY, severity: AuditSeverity.CRITICAL, skipResponse: true })
  reveal(@Req() req: Request, @Param('key') key: string, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    this.assertSuperAdmin(user);
    return this.service.reveal(key, langFrom(req));
  }

  @Delete(':key')
  @AuditAction(ActionType.CONFIG_CHANGE, 'system_settings', { category: AuditCategory.ADMIN, severity: AuditSeverity.CRITICAL })
  remove(@Req() req: Request, @Param('key') key: string, @CurrentUser() user: UserEntity) {
    this.assertAllowed(user);
    return this.service.remove(key, user as any, langFrom(req));
  }
}
