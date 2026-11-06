import { Controller, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { RolesGuard } from 'src/users/utility/decorators/roles.guard';
import { Roles } from 'src/users/utility/decorators/roles.decorator';
import { AuditService } from './audit.service';
import { AuditExportQueryDto, AuditQueryDto, AuditStatsQueryDto } from './dto/audit-query.dto';
import { SkipAudit } from './decorator/audit.decorator';

const LANGS = ['fr', 'en', 'es', 'sw', 'ar'];

/** Langue : ?lang, en-tête x-lang, Accept-Language, langue de l'utilisateur, sinon fr */
function langOf(req: Request): string {
  const candidates = [
    (req.query as any)?.lang,
    req.headers['x-lang'],
    req.headers['accept-language'],
    (req as any).currentUser?.preferredLanguage,
  ];
  for (const c of candidates) {
    const l = String(c ?? '').split(',')[0].split(';')[0].trim().toLowerCase().slice(0, 2);
    if (LANGS.includes(l)) return l;
  }
  return 'fr';
}

/**
 * ✅ Consultation du journal d'audit (ADMIN / SUPER ADMIN).
 * Lecture seule : aucune route ne modifie ni ne supprime une entrée. Messages et exports traduits (fr, en, es, sw, ar).
 */
@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit-logs')
@UseGuards(AuthentificationGuard, RolesGuard)
@Roles('ADMIN')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** Liste filtrée et paginée */
  @Get()
  @SkipAudit()
  findAll(@Query() q: AuditQueryDto, @Req() req: Request) {
    return this.audit.findAll(q, langOf(req));
  }

  /** Tableau de bord : totaux, répartition, échecs de connexion, IP suspectes, activité par jour */
  @Get('stats')
  @SkipAudit()
  stats(@Query() q: AuditStatsQueryDto, @Req() req: Request) {
    return this.audit.stats(q, langOf(req));
  }

  /** Export Excel (défaut) ou PDF avec les mêmes filtres que la liste — l'export lui-même est journalisé */
  @Get('export')
  async export(@Query() q: AuditExportQueryDto, @Req() req: Request, @Res() res: Response) {
    this.audit.annotate({ entity: 'audit_logs', metadata: { format: q.format ?? 'xlsx' } });
    const file = await this.audit.export(q, langOf(req));
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.send(file.buffer);
  }

  /** Historique d'une ressource : GET /audit-logs/entity/orders/<id> */
  @Get('entity/:entity/:entityId')
  @SkipAudit()
  entityHistory(@Param('entity') entity: string, @Param('entityId') entityId: string, @Query() q: AuditQueryDto, @Req() req: Request) {
    return this.audit.entityHistory(entity, entityId, q, langOf(req));
  }

  /** Activité d'un utilisateur */
  @Get('user/:userId')
  @SkipAudit()
  userActivity(@Param('userId') userId: string, @Query() q: AuditQueryDto, @Req() req: Request) {
    return this.audit.userActivity(userId, q, langOf(req));
  }

  /** Vérifier qu'une entrée n'a pas été modifiée (signature HMAC) */
  @Get(':id/verify')
  @SkipAudit()
  verify(@Param('id') id: string, @Req() req: Request) {
    return this.audit.verify(id, langOf(req));
  }

  @Get(':id')
  @SkipAudit()
  findOne(@Param('id') id: string, @Req() req: Request) {
    return this.audit.findOne(id, langOf(req));
  }
}
