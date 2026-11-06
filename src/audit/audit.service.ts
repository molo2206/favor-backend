// src/audit/audit.service.ts
import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { Request, Response } from 'express';
import { AuditLog } from './entity/audit-log.entity';
import { CreateAuditDto } from './dto/create-audit.dto';
import { AuditExportQueryDto, AuditQueryDto, AuditStatsQueryDto } from './dto/audit-query.dto';
import { ActionType } from './enum/action-type.enum';
import { AuditCategory, AuditSeverity, AuditStatus } from './enum/audit.enums';
import { AuditStore, currentAudit } from './context/audit-context';
import { classify, entityFromPath, isExcluded } from './audit.rules';
import { clean, idFrom, summarizeResponse, userFromResponse } from './audit-sanitize';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { buildXlsx, h, htmlToPdf } from 'src/backOffice/needs/common/needs-export';
import { I18nService } from 'src/libs/common/src';

const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SEVERITY_RANK: Record<string, number> = { INFO: 0, WARNING: 1, CRITICAL: 2 };

function cut(v: any, n: number): string | null {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v);
  return s.length > n ? s.slice(0, n) : s;
}

/** JSON canonique (clés triées) : MySQL réordonne les clés des colonnes JSON */
function stable(v: any): string {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  return `{${Object.keys(v)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
    .join(',')}}`;
}

function maxSeverity(a: string, b: string): string {
  return (SEVERITY_RANK[b] ?? 0) > (SEVERITY_RANK[a] ?? 0) ? b : a;
}

function parseDate(v?: string, endOfDay = false): Date | null {
  if (!v) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}` : v);
  return isNaN(d.getTime()) ? null : d;
}

function list(v?: string): string[] {
  return String(v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * ✅ JOURNAL D'AUDIT CENTRALISÉ
 *  - Écriture asynchrone par lots (n'alourdit pas les requêtes), jamais bloquante
 *  - Chaque ligne signée HMAC-SHA256 (AUDIT_HMAC_SECRET) → falsification détectable
 *  - Consultation filtrée / paginée, statistiques, historique d'une ressource ou d'un utilisateur, export Excel / PDF
 *  - Conservation : AUDIT_RETENTION_DAYS (730 par défaut, 0 = illimité), les lignes CRITICAL sont gardées
 */
@Injectable()
export class AuditService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Audit');
  private queue: AuditLog[] = [];
  private timer: NodeJS.Timeout | null = null;
  private flushing = false;
  private static readonly MAX_QUEUE = 5000;
  private static readonly BATCH = 100;

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly i18n: I18nService,
  ) {}

  private t(key: string, lang: string, params?: Record<string, any>): string {
    try {
      return this.i18n.translate(key, lang, params);
    } catch {
      return key;
    }
  }

  onModuleInit() {
    this.timer = setInterval(() => void this.flush(), 1000);
    this.timer.unref?.();
    if (!process.env.AUDIT_HMAC_SECRET) {
      this.logger.warn('AUDIT_HMAC_SECRET absent : les lignes du journal ne sont pas signées');
    }
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }

  // ============================================================
  // ÉCRITURE
  // ============================================================

  /** ✅ Enregistrer une opération (appel explicite depuis un service). Ne lève jamais d'erreur. */
  record(dto: CreateAuditDto): void {
    try {
      const store = currentAudit();
      const row = this.build({
        requestId: store?.requestId ?? null,
        ...dto,
        oldValue: dto.oldValue === undefined ? undefined : clean(dto.oldValue),
        newValue: dto.newValue === undefined ? undefined : clean(dto.newValue),
        changes: dto.changes === undefined ? undefined : clean(dto.changes),
        metadata: dto.metadata === undefined ? undefined : clean(dto.metadata),
      });
      this.enqueue(row);
    } catch (e: any) {
      this.logger.warn(`Audit ignoré : ${e?.message}`);
    }
  }

  /**
   * ✅ Compléter le journal de la requête en cours (ex. valeur avant modification, identifiant, métadonnées) :
   *   this.audit.annotate({ oldValue: before, entityId: id })
   */
  annotate(extra: { oldValue?: any; entityId?: string; entity?: string; action?: string; metadata?: Record<string, any>; severity?: AuditSeverity }) {
    const store = currentAudit();
    if (!store) return;
    store.extra = { ...(store.extra ?? {}), ...extra };
  }

  /** Ne pas journaliser la requête en cours */
  skipCurrent() {
    const store = currentAudit();
    if (store) store.skip = true;
  }

  /** Compatibilité : ancienne API (écriture immédiate) */
  async log(data: {
    userId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    oldValue?: any;
    newValue?: any;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<AuditLog> {
    const row = this.build({
      requestId: currentAudit()?.requestId ?? null,
      ...data,
      oldValue: clean(data.oldValue),
      newValue: clean(data.newValue),
    });
    return this.auditLogRepository.save(row);
  }

  private build(dto: CreateAuditDto): AuditLog {
    const row = new AuditLog();
    const now = new Date();
    now.setMilliseconds(0);
    Object.assign(row, {
      id: randomUUID(),
      userId: cut(dto.userId, 255),
      userName: cut(dto.userName, 150),
      userRole: cut(dto.userRole, 50),
      companyId: cut(dto.companyId, 36),
      action: cut(dto.action, 50) ?? ActionType.SYSTEM,
      entity: cut(dto.entity, 100) ?? 'unknown',
      entityId: cut(dto.entityId, 255),
      category: cut(dto.category, 20) ?? AuditCategory.BUSINESS,
      severity: cut(dto.severity, 10) ?? AuditSeverity.INFO,
      status: cut(dto.status, 10) ?? AuditStatus.SUCCESS,
      oldValue: dto.oldValue ?? null,
      newValue: dto.newValue ?? null,
      changes: dto.changes ?? null,
      metadata: dto.metadata ?? null,
      httpStatus: dto.httpStatus ?? null,
      errorMessage: cut(dto.errorMessage, 1000),
      durationMs: dto.durationMs ?? null,
      ipAddress: cut(dto.ipAddress, 45),
      userAgent: cut(dto.userAgent, 500),
      platform: cut(dto.platform, 20),
      method: cut(dto.method, 10),
      route: cut(dto.route, 255),
      url: cut(dto.url, 1000),
      requestId: cut(dto.requestId, 64),
      createdAt: now,
    });
    row.signature = this.sign(row);
    return row;
  }

  private enqueue(row: AuditLog) {
    if (this.queue.length >= AuditService.MAX_QUEUE) {
      this.queue.shift();
      this.logger.warn('File d\'audit pleine : la plus ancienne entrée est abandonnée');
    }
    this.queue.push(row);
    if (this.queue.length >= AuditService.BATCH) void this.flush();
  }

  async flush(): Promise<void> {
    if (this.flushing || !this.queue.length) return;
    this.flushing = true;
    try {
      while (this.queue.length) {
        const batch = this.queue.splice(0, AuditService.BATCH);
        try {
          await this.auditLogRepository.insert(batch);
        } catch (e: any) {
          // Une ligne invalide ne doit pas faire perdre tout le lot
          for (const row of batch) {
            await this.auditLogRepository.insert(row).catch((err) => this.logger.warn(`Audit non enregistré (${row.action} ${row.entity}) : ${err?.message}`));
          }
          if (e?.code === 'ER_BAD_FIELD_ERROR') this.logger.error('Colonnes audit_logs manquantes : exécutez db/sql/audit_logs_professionnel.sql');
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  // ============================================================
  // JOURNAL AUTOMATIQUE D'UNE REQUÊTE HTTP (appelé à la fin de la réponse)
  // ============================================================
  async fromRequest(req: Request, res: Response, store: AuditStore): Promise<void> {
    if (store.written || store.skip) return;
    store.written = true;

    const method = String(req.method || 'GET').toUpperCase();
    if (method === 'OPTIONS' || method === 'HEAD') return;
    const url = String(req.originalUrl || req.url || '');
    const path = url.split('?')[0];
    const status = res.statusCode;
    const meta = store.meta;
    const user: any = (req as any).currentUser ?? null;
    const cls = classify(path, method);

    if (!meta && isExcluded(path)) return;
    // Route inexistante (404 sans contrôleur) : bruit des robots, ignoré
    if (!store.handlerName && status === 404) return;

    const denied = status === 401 || status === 403;
    const failed = status >= 400;
    const auto = String(process.env.AUDIT_AUTO_MUTATIONS ?? 'true').toLowerCase() !== 'false';

    let write = false;
    if (meta) write = true;
    else if (status === 403 && user) write = true;
    else if (status === 401) write = cls.security;
    else if (cls.action === ActionType.TOKEN_REFRESH_FAILED) write = failed;
    else if (MUTATIONS.has(method)) write = auto;
    else if (cls.action === ActionType.EXPORT) write = !failed;
    if (cls.action === ActionType.TOKEN_REFRESH_FAILED && !failed) write = false;
    if (!write) return;

    // ---- Action ----
    let action: string = store.extra?.action ?? meta?.action ?? cls.action;
    if (cls.action === ActionType.LOGIN && failed) action = ActionType.LOGIN_FAILED;
    if (status === 403 && !meta) action = ActionType.ACCESS_DENIED;

    // ---- Statut / gravité ----
    const result = denied ? AuditStatus.DENIED : failed ? AuditStatus.FAILURE : AuditStatus.SUCCESS;
    let severity: string = meta?.severity ?? cls.severity;
    if (store.extra?.severity) severity = maxSeverity(severity, store.extra.severity);
    if (result !== AuditStatus.SUCCESS) severity = maxSeverity(severity, AuditSeverity.WARNING);
    if (action === ActionType.DELETE || action === ActionType.ACCOUNT_DELETE) severity = maxSeverity(severity, AuditSeverity.WARNING);
    const category = meta?.category ?? (status === 403 || action === ActionType.LOGIN_FAILED ? AuditCategory.SECURITY : cls.category);

    // ---- Auteur ----
    let actor: { id: string; fullName?: string; role?: string } | null = user
      ? { id: user.id, fullName: user.fullName, role: Array.isArray(user.role) ? user.role[0] : user.role }
      : null;
    if (!actor && !failed && cls.security) actor = userFromResponse(store.response);

    // ---- Ressource ----
    const entity = store.extra?.entity ?? meta?.entity ?? (store.controllerPath ? String(store.controllerPath).slice(0, 100) : entityFromPath(path));
    const params = store.params ?? {};
    const entityId =
      store.extra?.entityId ?? params.id ?? params.uuid ?? Object.values(params).find((v) => typeof v === 'string' && /^[0-9a-f-]{8,}$/i.test(v)) ?? (!failed ? idFrom(store.response) : null) ?? null;

    // ---- Avant / après ----
    const body = (req as any).body;
    const hasBody = body && typeof body === 'object' && Object.keys(body).length > 0;
    const changes = store.changes.length ? store.changes : undefined;
    let oldValue = store.extra?.oldValue;
    if (oldValue === undefined && changes) {
      const upd = changes.find((c) => c.op === 'UPDATE' && c.changes);
      if (upd?.changes) oldValue = Object.fromEntries(Object.entries(upd.changes).map(([k, v]) => [k, v[0]]));
    }
    let newValue: any = undefined;
    if (cls.security) {
      // Connexion / mot de passe : seulement l'identifiant tenté, jamais le reste
      const ident = body?.email ?? body?.phone ?? body?.username ?? body?.login ?? body?.identifier;
      newValue = ident ? { identifier: ident } : undefined;
    } else if (hasBody && MUTATIONS.has(method)) {
      newValue = body;
    } else if (!failed && meta && !meta.skipResponse) {
      newValue = summarizeResponse(store.response);
    }

    const metadata: Record<string, any> = {};
    if (req.query && Object.keys(req.query).length) metadata.query = req.query;
    if (Object.keys(params).length) metadata.params = params;
    if (store.handlerName) metadata.handler = store.handlerName;
    if (!failed && !cls.security && meta && !meta.skipResponse && MUTATIONS.has(method)) {
      const r = summarizeResponse(store.response);
      if (r !== null && r !== undefined) metadata.response = r;
    }
    if (store.extra?.metadata) Object.assign(metadata, store.extra.metadata);

    const err = (req as any).auditError ?? store.error;
    const errorMessage = failed ? (Array.isArray(err?.message) ? err.message.join(' | ') : err?.message) ?? null : null;
    if (failed && err?.code) metadata.errorCode = err.code;

    const route = store.routePath ?? (store.controllerPath ? `/${store.controllerPath}` : path);

    this.enqueue(
      this.build({
        userId: actor?.id ?? null,
        userName: actor?.fullName ?? null,
        userRole: actor?.role ?? null,
        companyId: user?.activeCompanyId ?? null,
        action,
        entity,
        entityId: entityId ? String(entityId) : null,
        category,
        severity,
        status: result,
        oldValue: oldValue === undefined ? undefined : clean(oldValue),
        newValue: newValue === undefined ? undefined : clean(newValue),
        changes: changes ? clean(changes) : undefined,
        metadata: Object.keys(metadata).length ? clean(metadata) : undefined,
        httpStatus: status,
        errorMessage,
        durationMs: Date.now() - store.startedAt,
        ipAddress: (req as any).auditIp ?? null,
        userAgent: req.headers['user-agent'] ?? null,
        platform: this.platform(req),
        method,
        route,
        url: path,
        requestId: store.requestId,
      }),
    );
  }

  private platform(req: Request): string | null {
    const p = String(req.headers['x-platform'] ?? '').trim().toLowerCase();
    if (p) return p.slice(0, 20);
    const ua = String(req.headers['user-agent'] ?? '');
    if (/okhttp|android/i.test(ua)) return 'android';
    if (/cfnetwork|darwin|iphone|ipad/i.test(ua)) return 'ios';
    if (/dart/i.test(ua)) return 'mobile';
    if (/mozilla/i.test(ua)) return 'web';
    return null;
  }

  // ============================================================
  // SIGNATURE (anti-falsification)
  // ============================================================
  private payload(row: AuditLog): string {
    const created = row.createdAt ? new Date(row.createdAt) : null;
    const ts = created ? Math.floor(created.getTime() / 1000) : 0;
    const digest = createHash('sha256')
      .update(stable([row.oldValue ?? null, row.newValue ?? null, row.changes ?? null, row.metadata ?? null]))
      .digest('hex');
    return stable([
      row.id,
      row.userId ?? null,
      row.action,
      row.entity,
      row.entityId ?? null,
      row.category ?? null,
      row.severity ?? null,
      row.status ?? null,
      row.httpStatus ?? null,
      row.ipAddress ?? null,
      row.method ?? null,
      row.url ?? null,
      row.requestId ?? null,
      ts,
      digest,
    ]);
  }

  private sign(row: AuditLog): string | null {
    const secret = process.env.AUDIT_HMAC_SECRET;
    if (!secret) return null;
    return createHmac('sha256', secret).update(this.payload(row)).digest('hex');
  }

  async verify(id: string, lang = 'fr') {
    const row = await this.auditLogRepository.findOne({ where: { id } });
    if (!row) throw new NotFoundException(this.t('audit.not_found', lang));
    if (!row.signature) return { message: this.t('audit.not_signed', lang), data: { id, signed: false, valid: null } };
    const expected = this.sign(row);
    const valid =
      !!expected &&
      expected.length === row.signature.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(row.signature));
    return {
      message: valid ? this.t('audit.intact', lang) : this.t('audit.tampered', lang),
      data: { id, signed: true, valid },
    };
  }

  // ============================================================
  // CONSULTATION
  // ============================================================
  private filtered(q: AuditQueryDto | AuditStatsQueryDto): SelectQueryBuilder<AuditLog> {
    const qb = this.auditLogRepository.createQueryBuilder('a');
    const f: any = q;
    const inOrEq = (col: string, raw?: string, key = col) => {
      const vals = list(raw);
      if (vals.length === 1) qb.andWhere(`a.${col} = :${key}`, { [key]: vals[0] });
      else if (vals.length > 1) qb.andWhere(`a.${col} IN (:...${key})`, { [key]: vals });
    };
    if (f.userId) qb.andWhere('a.userId = :userId', { userId: f.userId });
    inOrEq('action', f.action);
    if (f.entity) qb.andWhere('a.entity = :entity', { entity: f.entity });
    if (f.entityId) qb.andWhere('a.entityId = :entityId', { entityId: f.entityId });
    inOrEq('category', f.category ? String(f.category).toUpperCase() : undefined);
    inOrEq('severity', f.severity ? String(f.severity).toUpperCase() : undefined);
    inOrEq('status', f.status ? String(f.status).toUpperCase() : undefined);
    if (f.platform) qb.andWhere('a.platform = :platform', { platform: String(f.platform).toLowerCase() });
    if (f.ipAddress) qb.andWhere('a.ipAddress = :ip', { ip: f.ipAddress });
    if (f.method) qb.andWhere('a.method = :method', { method: String(f.method).toUpperCase() });
    if (f.companyId) qb.andWhere('a.companyId = :companyId', { companyId: f.companyId });
    if (f.requestId) qb.andWhere('a.requestId = :requestId', { requestId: f.requestId });
    const from = parseDate(f.from);
    const to = parseDate(f.to, true);
    if (from) qb.andWhere('a.createdAt >= :from', { from });
    if (to) qb.andWhere('a.createdAt <= :to', { to });
    if (f.search) {
      const s = `%${String(f.search).trim()}%`;
      qb.andWhere(
        new Brackets((b) =>
          b
            .where('a.userName LIKE :s', { s })
            .orWhere('a.userId LIKE :s', { s })
            .orWhere('a.entity LIKE :s', { s })
            .orWhere('a.entityId LIKE :s', { s })
            .orWhere('a.url LIKE :s', { s })
            .orWhere('a.ipAddress LIKE :s', { s })
            .orWhere('a.errorMessage LIKE :s', { s }),
        ),
      );
    }
    return qb;
  }

  async findAll(q: AuditQueryDto, lang = 'fr') {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 20));
    const order = String(q.sortOrder ?? 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const [rows, total] = await this.filtered(q)
      .orderBy('a.createdAt', order)
      .addOrderBy('a.id', order)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return {
      message: this.t('audit.list', lang),
      data: new PaginatedResponseDto<AuditLog>(rows, total, page, limit),
    };
  }

  async findOne(id: string, lang = 'fr') {
    const row = await this.auditLogRepository.findOne({ where: { id } });
    if (!row) throw new NotFoundException(this.t('audit.not_found', lang));
    return { message: this.t('audit.detail', lang), data: row };
  }

  /** Historique complet d'une ressource (ex. une commande) */
  entityHistory(entity: string, entityId: string, q: AuditQueryDto, lang = 'fr') {
    return this.findAll({ ...q, entity, entityId }, lang);
  }

  /** Activité d'un utilisateur */
  userActivity(userId: string, q: AuditQueryDto, lang = 'fr') {
    return this.findAll({ ...q, userId }, lang);
  }

  async stats(q: AuditStatsQueryDto, lang = 'fr') {
    const to = parseDate(q.to, true) ?? new Date();
    const from = parseDate(q.from) ?? new Date(to.getTime() - 30 * 24 * 3600 * 1000);
    const base = () => this.filtered({ ...q, from: from.toISOString(), to: to.toISOString() });

    const group = async (col: string, limit = 50) =>
      (
        await base()
          .select(`a.${col}`, 'key')
          .addSelect('COUNT(*)', 'count')
          .groupBy(`a.${col}`)
          .orderBy('count', 'DESC')
          .limit(limit)
          .getRawMany()
      ).map((r) => ({ key: r.key, count: Number(r.count) }));

    const [total, byCategory, byStatus, bySeverity, byAction, byPlatform, perDay, topUsers, topIps] = await Promise.all([
      base().getCount(),
      group('category'),
      group('status'),
      group('severity'),
      group('action', 15),
      group('platform'),
      base()
        .select('DATE(a.createdAt)', 'day')
        .addSelect('COUNT(*)', 'count')
        .addSelect("SUM(CASE WHEN a.status <> 'SUCCESS' THEN 1 ELSE 0 END)", 'failures')
        .groupBy('day')
        .orderBy('day', 'ASC')
        .getRawMany(),
      base()
        .andWhere('a.userId IS NOT NULL')
        .select('a.userId', 'userId')
        .addSelect('MAX(a.userName)', 'userName')
        .addSelect('COUNT(*)', 'count')
        .groupBy('a.userId')
        .orderBy('count', 'DESC')
        .limit(10)
        .getRawMany(),
      base()
        .andWhere("a.status <> 'SUCCESS'")
        .andWhere('a.ipAddress IS NOT NULL')
        .select('a.ipAddress', 'ip')
        .addSelect('COUNT(*)', 'count')
        .groupBy('a.ipAddress')
        .orderBy('count', 'DESC')
        .limit(10)
        .getRawMany(),
    ]);

    const failedLogins = byAction.find((a) => a.key === ActionType.LOGIN_FAILED)?.count ?? 0;
    return {
      message: this.t('audit.stats', lang),
      data: {
        period: { from, to },
        total,
        failedLogins,
        denied: byStatus.find((s) => s.key === AuditStatus.DENIED)?.count ?? 0,
        failures: byStatus.find((s) => s.key === AuditStatus.FAILURE)?.count ?? 0,
        critical: bySeverity.find((s) => s.key === AuditSeverity.CRITICAL)?.count ?? 0,
        byCategory,
        byStatus,
        bySeverity,
        byAction,
        byPlatform,
        perDay: perDay.map((d) => ({ day: d.day instanceof Date ? d.day.toISOString().slice(0, 10) : String(d.day).slice(0, 10), count: Number(d.count), failures: Number(d.failures) })),
        topUsers: topUsers.map((u) => ({ userId: u.userId, userName: u.userName, count: Number(u.count) })),
        suspiciousIps: topIps.map((i) => ({ ip: i.ip, count: Number(i.count) })),
      },
    };
  }

  // ============================================================
  // EXPORT (Excel / PDF) — 10 000 lignes maximum
  // ============================================================
  async export(q: AuditExportQueryDto, lang = 'fr'): Promise<{ buffer: Buffer; fileName: string; mime: string }> {
    const c = (k: string) => this.t(`audit.col.${k}`, lang);
    const rows = await this.filtered(q).orderBy('a.createdAt', 'DESC').take(10000).getMany();
    const stamp = new Date().toISOString().slice(0, 10);
    const fmt = (d: Date) => new Date(d).toISOString().replace('T', ' ').slice(0, 19);

    if (q.format === 'pdf') {
      const lines = rows
        .slice(0, 2000)
        .map(
          (r) =>
            `<tr><td>${h(fmt(r.createdAt))}</td><td>${h(r.userName ?? r.userId ?? '—')}</td><td>${h(r.action)}</td><td>${h(r.entity)}${r.entityId ? `<br><small>${h(r.entityId)}</small>` : ''}</td><td>${h(r.category ?? '')}</td><td>${h(r.status ?? '')}${r.httpStatus ? ` (${r.httpStatus})` : ''}</td><td>${h(r.ipAddress ?? '')}<br><small>${h(r.platform ?? '')}</small></td></tr>`,
        )
        .join('');
      const dir = lang === 'ar' ? ' dir="rtl"' : '';
      const html = `<html${dir}><head><meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;font-size:10px;color:#222}h1{font-size:16px;margin:0 0 4px}
        table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px;text-align:left;vertical-align:top}
        th{background:#f0f0f0}small{color:#666}</style></head><body>
        <h1>${h(this.t('audit.pdf_title', lang))}</h1><p>${h(this.t('audit.pdf_summary', lang, { date: stamp, count: rows.length }))}${rows.length > 2000 ? ` ${h(this.t('audit.pdf_truncated', lang))}` : ''}</p>
        <table><thead><tr><th>${h(c('date'))}</th><th>${h(c('author'))}</th><th>${h(c('action'))}</th><th>${h(c('resource'))}</th><th>${h(c('category'))}</th><th>${h(c('result'))}</th><th>${h(c('ip_platform'))}</th></tr></thead><tbody>${lines}</tbody></table></body></html>`;
      return { buffer: await htmlToPdf(html, true), fileName: `audit_${stamp}.pdf`, mime: 'application/pdf' };
    }

    const buffer = await buildXlsx([
      {
        name: this.t('audit.sheet', lang),
        columns: [
          { header: c('date'), width: 20 },
          { header: c('author'), width: 24 },
          { header: c('author_id'), width: 38 },
          { header: c('role'), width: 14 },
          { header: c('action'), width: 22 },
          { header: c('resource'), width: 24 },
          { header: c('resource_id'), width: 38 },
          { header: c('category'), width: 12 },
          { header: c('severity'), width: 10 },
          { header: c('result'), width: 10 },
          { header: c('http'), width: 10 },
          { header: c('error'), width: 40 },
          { header: c('method'), width: 8 },
          { header: c('url'), width: 40 },
          { header: c('ip'), width: 16 },
          { header: c('platform'), width: 10 },
          { header: c('duration'), width: 10 },
          { header: c('request'), width: 38 },
          { header: c('changes'), width: 60 },
        ],
        rows: rows.map((r) => [
          fmt(r.createdAt),
          r.userName ?? '',
          r.userId ?? '',
          r.userRole ?? '',
          r.action,
          r.entity,
          r.entityId ?? '',
          r.category ?? '',
          r.severity ?? '',
          r.status ?? '',
          r.httpStatus ?? null,
          r.errorMessage ?? '',
          r.method ?? '',
          r.url ?? '',
          r.ipAddress ?? '',
          r.platform ?? '',
          r.durationMs ?? null,
          r.requestId ?? '',
          r.changes ? JSON.stringify(r.changes).slice(0, 30000) : '',
        ]),
      },
    ]);
    return {
      buffer,
      fileName: `audit_${stamp}.xlsx`,
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  // ============================================================
  // CONSERVATION (03:30 chaque nuit)
  // ============================================================
  @Cron('30 3 * * *')
  async purge() {
    const days = Number(process.env.AUDIT_RETENTION_DAYS ?? 730);
    if (!days || days <= 0) return;
    const limit = new Date(Date.now() - days * 24 * 3600 * 1000);
    let deleted = 0;
    try {
      for (let i = 0; i < 200; i++) {
        const r: any = await this.auditLogRepository.query(
          "DELETE FROM `audit_logs` WHERE `createdAt` < ? AND (`severity` IS NULL OR `severity` <> 'CRITICAL') LIMIT 5000",
          [limit],
        );
        const n = Number(r?.affectedRows ?? 0);
        deleted += n;
        if (n < 5000) break;
      }
      if (deleted) this.logger.log(`Conservation : ${deleted} entrée(s) de plus de ${days} jours supprimée(s)`);
    } catch (e: any) {
      this.logger.warn(`Purge du journal impossible : ${e?.message}`);
    }
  }
}
