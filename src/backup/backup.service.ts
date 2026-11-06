// src/backup/backup.service.ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, MoreThan, Repository } from 'typeorm';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { pipeline } from 'stream/promises';
import * as mysql from 'mysql2/promise';
import { dataSourceOptions } from 'db/data-source';
import { BackupSchedule } from './entities/backup-schedule.entity';
import { BackupRun, BackupStatus, BackupTrigger } from './entities/backup-run.entity';
import { BackupDatabase } from './entities/backup-database.entity';
import {
  BackupFilesQueryDto,
  BackupRunsQueryDto,
  CreateBackupDatabaseDto,
  CreateBackupScheduleDto,
  MysqlConnectionDto,
  UpdateBackupDatabaseDto,
  UpdateBackupScheduleDto,
} from './dto/backup.dto';
import { decryptSecret, encryptSecret } from './backup-crypto';
import { I18nService } from 'src/libs/common/src';
import { AuditService } from 'src/audit/audit.service';
import { currentAudit } from 'src/audit/context/audit-context';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { AuditCategory, AuditSeverity, AuditStatus } from 'src/audit/enum/audit.enums';

const DAY_LABELS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;
const BACKUP_EXT = ['.sql', '.sql.gz', '.tar.gz'];
const SYSTEM_DBS = ['information_schema', 'mysql', 'performance_schema', 'sys'];

type LocalParts = { date: string; time: string; weekday: number };

/** Connexion MySQL résolue (identifiants en clair, uniquement en mémoire) */
type DbConn = {
  id: string | null;
  label: string;
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  excludeTables: string[];
};

/**
 * ✅ SAUVEGARDES DES BASES MYSQL
 *  - Bases à sauvegarder : connexions MySQL enregistrées (mot de passe chiffré) ou identifiants de l'application.
 *    La base de l'application est créée automatiquement comme base par défaut.
 *  - Automatiques : programmations (heures + jours + fuseau) liées à une base, vérifiées chaque minute.
 *  - Manuelles : à la demande, pour la base choisie (super admin).
 *  - Fichiers compressés (.sql.gz) dans BACKUP_DIR, rotation (keepLast), historique (backup_runs) lié à la base.
 *  - Restauration désactivée par défaut (BACKUP_ALLOW_RESTORE=true), toujours dans la base d'origine du fichier.
 *  Le mot de passe MySQL n'apparaît jamais dans la ligne de commande (variable MYSQL_PWD) ni dans les réponses.
 */
@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger(BackupService.name);
  /** Bases en cours de sauvegarde / restauration (une seule opération à la fois par base) */
  private readonly busy = new Set<string>();

  constructor(
    @InjectRepository(BackupSchedule) private readonly schedules: Repository<BackupSchedule>,
    @InjectRepository(BackupRun) private readonly runs: Repository<BackupRun>,
    @InjectRepository(BackupDatabase) private readonly databases: Repository<BackupDatabase>,
    @Optional() private readonly i18n?: I18nService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  private t(key: string, lang = 'fr', params?: Record<string, any>): string {
    try {
      return this.i18n ? this.i18n.translate(key, lang, params) : key;
    } catch {
      return key;
    }
  }

  // ============================================================
  // CONFIGURATION (.env)
  // ============================================================
  private get dir(): string {
    return process.env.BACKUP_DIR?.trim() || path.join(process.cwd(), 'backups');
  }

  /** Identifiants MySQL de l'application */
  private get appDb() {
    const o: any = dataSourceOptions;
    return {
      host: process.env.BACKUP_DB_HOST || o.host || '127.0.0.1',
      port: String(process.env.BACKUP_DB_PORT || o.port || 3306),
      user: process.env.BACKUP_DB_USER || o.username || 'root',
      password: process.env.BACKUP_DB_PASSWORD ?? o.password ?? '',
      database: process.env.BACKUP_DB_NAME || o.database,
    };
  }

  private get defaultTimezone(): string {
    return process.env.BACKUP_TIMEZONE || 'Africa/Lubumbashi';
  }

  private get schedulerEnabled(): boolean {
    return String(process.env.BACKUP_SCHEDULER_ENABLED ?? 'true').toLowerCase() !== 'false';
  }

  private get allowRestore(): boolean {
    return String(process.env.BACKUP_ALLOW_RESTORE ?? 'false').toLowerCase() === 'true';
  }

  private get keepManual(): number {
    const n = Number(process.env.BACKUP_KEEP_MANUAL ?? 10);
    return Number.isFinite(n) && n > 0 ? n : 10;
  }

  private dumpCandidates(): string[] {
    return [
      process.env.BACKUP_MYSQLDUMP_PATH,
      'mysqldump',
      'mariadb-dump',
      'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe',
      'C:\\xampp\\mysql\\bin\\mysqldump.exe',
    ].filter(Boolean) as string[];
  }

  private mysqlCandidates(): string[] {
    return [
      process.env.BACKUP_MYSQL_PATH,
      'mysql',
      'mariadb',
      'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe',
      'C:\\xampp\\mysql\\bin\\mysql.exe',
    ].filter(Boolean) as string[];
  }

  private dumpArgs(c: DbConn): string[] {
    const extra = (process.env.BACKUP_MYSQLDUMP_ARGS ??
      '--single-transaction --quick --routines --triggers --no-tablespaces --default-character-set=utf8mb4')
      .split(/\s+/)
      .filter(Boolean);
    const ignore = (c.excludeTables ?? []).filter((t) => SAFE_NAME.test(t)).map((t) => `--ignore-table=${c.database}.${t}`);
    return ['-h', c.host, '-P', c.port, '-u', c.user, ...extra, ...ignore, c.database];
  }

  async onModuleInit() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      // Sauvegardes interrompues (redémarrage du serveur pendant la sauvegarde)
      await this.runs.update(
        { status: BackupStatus.RUNNING, startedAt: LessThan(new Date(Date.now() - 60 * 60 * 1000)) },
        { status: BackupStatus.FAILED, error: 'Interrompue (redémarrage du serveur)', finishedAt: new Date() },
      );
    } catch (e: any) {
      this.logger.warn(`Initialisation des sauvegardes : ${e?.message}`);
    }
    await this.ensureAppDatabase().catch((e) => this.logger.warn(`Base par défaut des sauvegardes : ${e?.message}`));
  }

  /** ✅ La base de l'application est enregistrée automatiquement (identifiants du .env, base par défaut) */
  private async ensureAppDatabase(): Promise<BackupDatabase | null> {
    const count = await this.databases.count();
    if (count > 0) return null;
    const app = this.appDb;
    if (!app.database) return null;
    const created = await this.databases.save(
      this.databases.create({
        name: 'Base principale',
        description: 'Base de l\'application Favor Help (identifiants du .env)',
        useAppCredentials: true,
        databaseName: app.database,
        isDefault: true,
        isActive: true,
      }),
    );
    // Anciennes sauvegardes et programmations : rattachées à la base principale
    await this.runs.createQueryBuilder().update(BackupRun).set({ databaseId: created.id, databaseLabel: this.label(created) }).where('databaseId IS NULL').execute();
    await this.schedules.createQueryBuilder().update(BackupSchedule).set({ databaseId: created.id }).where('databaseId IS NULL').execute();
    this.logger.log(`🗄️ Base « ${app.database} » enregistrée comme base sauvegardée par défaut`);
    return created;
  }

  // ============================================================
  // BASES MYSQL À SAUVEGARDER
  // ============================================================
  private label(d: BackupDatabase): string {
    const host = d.useAppCredentials ? this.appDb.host : d.host || '127.0.0.1';
    return `${d.name} — ${d.databaseName}@${host}`.slice(0, 200);
  }

  /** Vue publique : jamais de mot de passe */
  private dbView(d: BackupDatabase) {
    const { passwordEnc: _p, ...rest } = d as any;
    const app = this.appDb;
    return {
      ...rest,
      host: d.useAppCredentials ? app.host : d.host,
      port: d.useAppCredentials ? Number(app.port) : d.port,
      username: d.useAppCredentials ? app.user : d.username,
      hasPassword: d.useAppCredentials ? !!app.password : !!(d as any).passwordEnc,
      label: this.label(d),
      running: this.busy.has(d.id),
    };
  }

  private async getDatabase(id: string, withPassword = false): Promise<BackupDatabase> {
    const qb = this.databases.createQueryBuilder('d').where('d.id = :id', { id });
    if (withPassword) qb.addSelect('d.passwordEnc');
    const d = await qb.getOne();
    if (!d) throw new NotFoundException(this.t('backup.db.not_found'));
    return d;
  }

  /** Connexion à utiliser (base précisée, sinon base par défaut, sinon identifiants du .env) */
  private async resolve(databaseId?: string | null, lang = 'fr'): Promise<DbConn> {
    let d: BackupDatabase | null = null;
    if (databaseId) {
      d = await this.getDatabase(databaseId, true);
      if (!d.isActive) throw new BadRequestException(this.t('backup.db.inactive', lang, { name: d.name }));
    } else {
      d = await this.databases
        .createQueryBuilder('d')
        .addSelect('d.passwordEnc')
        .where('d.isDefault = 1 AND d.isActive = 1')
        .getOne()
        .catch(() => null);
    }
    if (!d) {
      const app = this.appDb;
      if (!app.database) throw new BadRequestException(this.t('backup.db.none', lang));
      return { id: null, label: `${app.database}@${app.host}`, ...app, excludeTables: [] };
    }
    return this.toConn(d, lang);
  }

  private toConn(d: BackupDatabase, lang = 'fr'): DbConn {
    if (d.useAppCredentials) {
      const app = this.appDb;
      return { id: d.id, label: this.label(d), host: app.host, port: app.port, user: app.user, password: app.password, database: d.databaseName, excludeTables: d.excludeTables ?? [] };
    }
    let password = '';
    try {
      password = decryptSecret((d as any).passwordEnc);
    } catch {
      throw new BadRequestException(this.t('backup.db.password_unreadable', lang, { name: d.name }));
    }
    return {
      id: d.id,
      label: this.label(d),
      host: d.host || '127.0.0.1',
      port: String(d.port || 3306),
      user: d.username || 'root',
      password,
      database: d.databaseName,
      excludeTables: d.excludeTables ?? [],
    };
  }

  /** Connexion à partir d'identifiants saisis (test / recherche) */
  private connFromDto(dto: MysqlConnectionDto, saved?: BackupDatabase | null, lang = 'fr'): DbConn {
    if (dto.useAppCredentials ?? saved?.useAppCredentials) {
      const app = this.appDb;
      return { id: saved?.id ?? null, label: '', ...app, database: dto.databaseName ?? saved?.databaseName ?? app.database ?? '', excludeTables: [] };
    }
    let password = dto.password ?? '';
    if (dto.password === undefined && saved) {
      try {
        password = decryptSecret((saved as any).passwordEnc);
      } catch {
        throw new BadRequestException(this.t('backup.db.password_unreadable', lang, { name: saved.name }));
      }
    }
    const host = dto.host ?? saved?.host;
    const user = dto.username ?? saved?.username;
    if (!host || !user) throw new BadRequestException(this.t('backup.db.credentials_required', lang));
    return {
      id: saved?.id ?? null,
      label: '',
      host,
      port: String(dto.port ?? saved?.port ?? 3306),
      user,
      password,
      database: dto.databaseName ?? saved?.databaseName ?? '',
      excludeTables: [],
    };
  }

  /** Teste la connexion : version, nombre de tables, taille (SHOW TABLE STATUS, sans information_schema) */
  private async probe(c: DbConn, lang = 'fr') {
    let conn: mysql.Connection | null = null;
    const started = Date.now();
    try {
      conn = await mysql.createConnection({
        host: c.host,
        port: Number(c.port),
        user: c.user,
        password: c.password,
        database: c.database || undefined,
        connectTimeout: 8000,
        charset: 'utf8mb4',
      });
      const [vrows]: any = await conn.query('SELECT VERSION() AS version');
      let tables = 0;
      let sizeBytes = 0;
      if (c.database) {
        const [status]: any = await conn.query('SHOW TABLE STATUS');
        tables = status.length;
        sizeBytes = status.reduce((n: number, r: any) => n + Number(r.Data_length || 0) + Number(r.Index_length || 0), 0);
      }
      return {
        ok: true,
        version: String(vrows?.[0]?.version ?? ''),
        database: c.database || null,
        tables,
        sizeBytes,
        size: this.human(sizeBytes),
        latencyMs: Date.now() - started,
        error: null as string | null,
      };
    } catch (e: any) {
      return {
        ok: false,
        version: null,
        database: c.database || null,
        tables: 0,
        sizeBytes: 0,
        size: '0 o',
        latencyMs: Date.now() - started,
        error: this.mysqlError(e, lang),
      };
    } finally {
      await conn?.end().catch(() => undefined);
    }
  }

  /** Messages MySQL compréhensibles */
  private mysqlError(e: any, lang = 'fr'): string {
    const code = e?.code;
    const map: Record<string, string> = {
      ER_ACCESS_DENIED_ERROR: 'backup.db.err_access_denied',
      ER_DBACCESS_DENIED_ERROR: 'backup.db.err_db_access_denied',
      ER_BAD_DB_ERROR: 'backup.db.err_unknown_db',
      ECONNREFUSED: 'backup.db.err_refused',
      ETIMEDOUT: 'backup.db.err_timeout',
      ENOTFOUND: 'backup.db.err_host',
      EHOSTUNREACH: 'backup.db.err_host',
    };
    const key = map[code];
    const msg = key ? this.t(key, lang) : '';
    return (msg && msg !== key ? msg : String(e?.message || e)).slice(0, 1000);
  }

  async listDatabases() {
    const list = await this.databases.find({ order: { isDefault: 'DESC', name: 'ASC' } });
    const ids = list.map((d) => d.id);
    const counts = ids.length
      ? await this.runs
          .createQueryBuilder('r')
          .select('r.databaseId', 'id')
          .addSelect('COUNT(*)', 'total')
          .addSelect("SUM(CASE WHEN r.status = 'SUCCESS' AND r.deleted = 0 THEN 1 ELSE 0 END)", 'available')
          .where('r.databaseId IN (:...ids)', { ids })
          .groupBy('r.databaseId')
          .getRawMany()
      : [];
    const schedules = ids.length ? await this.schedules.find({ where: { databaseId: In(ids) } }) : [];
    return {
      message: this.t('backup.db.list'),
      data: list.map((d) => {
        const c = counts.find((x) => x.id === d.id);
        return {
          ...this.dbView(d),
          backups: Number(c?.total ?? 0),
          availableBackups: Number(c?.available ?? 0),
          schedules: schedules.filter((s) => s.databaseId === d.id).map((s) => ({ id: s.id, name: s.name, isActive: s.isActive })),
        };
      }),
    };
  }

  async findDatabase(id: string) {
    const d = await this.getDatabase(id);
    const [last, schedules] = await Promise.all([
      this.runs.find({ where: { databaseId: id }, order: { startedAt: 'DESC' }, take: 10 }),
      this.schedules.find({ where: { databaseId: id } }),
    ]);
    return { message: this.t('backup.db.detail'), data: { ...this.dbView(d), schedules: schedules.map((s) => this.view(s)), recentRuns: last } };
  }

  private async unsetOtherDefaults(id: string) {
    await this.databases.createQueryBuilder().update(BackupDatabase).set({ isDefault: false }).where('id != :id AND isDefault = 1', { id }).execute();
  }

  async createDatabase(dto: CreateBackupDatabaseDto, userId: string, lang = 'fr') {
    if (!dto.databaseName) throw new BadRequestException(this.t('backup.db.name_required', lang));
    if (!dto.useAppCredentials && (!dto.host || !dto.username)) throw new BadRequestException(this.t('backup.db.credentials_required', lang));
    await this.assertUniqueTarget(dto, lang);
    let test: Awaited<ReturnType<BackupService['probe']>> | null = null;
    if (dto.testBeforeSave !== false) {
      test = await this.probe(this.connFromDto(dto, null, lang), lang);
      if (!test.ok) throw new BadRequestException({ message: this.t('backup.db.test_failed', lang, { error: test.error }), data: test });
    }
    const hasDefault = await this.databases.count({ where: { isDefault: true } });
    const d = await this.databases.save(
      this.databases.create({
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        useAppCredentials: !!dto.useAppCredentials,
        host: dto.useAppCredentials ? null : dto.host!.trim(),
        port: dto.useAppCredentials ? null : dto.port ?? 3306,
        username: dto.useAppCredentials ? null : dto.username!.trim(),
        passwordEnc: dto.useAppCredentials || !dto.password ? null : encryptSecret(dto.password),
        databaseName: dto.databaseName,
        excludeTables: dto.excludeTables?.length ? [...new Set(dto.excludeTables)] : null,
        isDefault: dto.isDefault ?? !hasDefault,
        isActive: dto.isActive ?? true,
        lastTestAt: test ? new Date() : null,
        lastTestOk: test ? test.ok : null,
        serverVersion: test?.version ?? null,
        createdById: userId,
      }),
    );
    if (d.isDefault) await this.unsetOtherDefaults(d.id);
    return { message: this.t('backup.db.created', lang), data: { ...this.dbView(d), test } };
  }

  /** Une même base (hôte + port + nom) ne s'enregistre qu'une fois */
  private async assertUniqueTarget(
    dto: { useAppCredentials?: boolean; host?: string | null; port?: number | null; databaseName?: string },
    lang: string,
    excludeId?: string,
  ) {
    const all = await this.databases.find();
    const app = this.appDb;
    const key = (useApp: boolean, host?: string | null, port?: number | null, db?: string) =>
      `${useApp ? app.host : (host || '').toLowerCase()}:${useApp ? app.port : port || 3306}/${db}`;
    const target = key(!!dto.useAppCredentials, dto.host, dto.port, dto.databaseName);
    const dup = all.find((d) => d.id !== excludeId && key(d.useAppCredentials, d.host, d.port, d.databaseName) === target);
    if (dup) throw new ConflictException(this.t('backup.db.exists', lang, { name: dup.name }));
  }

  async updateDatabase(id: string, dto: UpdateBackupDatabaseDto, lang = 'fr') {
    const d = await this.getDatabase(id, true);
    if (this.busy.has(id)) throw new ConflictException(this.t('backup.db.busy', lang));
    const connChanged = ['host', 'port', 'username', 'password', 'databaseName', 'useAppCredentials'].some((k) => (dto as any)[k] !== undefined) || dto.clearPassword;
    const next = {
      useAppCredentials: dto.useAppCredentials ?? d.useAppCredentials,
      host: dto.host ?? d.host,
      port: dto.port ?? d.port,
      databaseName: dto.databaseName ?? d.databaseName,
    };
    if (connChanged) await this.assertUniqueTarget(next, lang, id);

    let test: Awaited<ReturnType<BackupService['probe']>> | null = null;
    if (connChanged && dto.testBeforeSave !== false) {
      const probeDto = { ...dto, password: dto.clearPassword ? '' : dto.password };
      test = await this.probe(this.connFromDto(probeDto, d, lang), lang);
      if (!test.ok) throw new BadRequestException({ message: this.t('backup.db.test_failed', lang, { error: test.error }), data: test });
    }
    if (dto.isDefault === false && d.isDefault) throw new BadRequestException(this.t('backup.db.default_required', lang));
    if (dto.isActive === false && d.isDefault) throw new BadRequestException(this.t('backup.db.default_inactive', lang));

    if (dto.name !== undefined) d.name = dto.name.trim();
    if (dto.description !== undefined) d.description = dto.description?.trim() || null;
    if (dto.useAppCredentials !== undefined) d.useAppCredentials = dto.useAppCredentials;
    if (d.useAppCredentials) {
      d.host = null;
      d.port = null;
      d.username = null;
      (d as any).passwordEnc = null;
    } else {
      if (dto.host !== undefined) d.host = dto.host.trim();
      if (dto.port !== undefined) d.port = dto.port;
      if (dto.username !== undefined) d.username = dto.username.trim();
      if (dto.clearPassword) (d as any).passwordEnc = null;
      else if (dto.password !== undefined) (d as any).passwordEnc = dto.password ? encryptSecret(dto.password) : null;
      if (!d.host || !d.username) throw new BadRequestException(this.t('backup.db.credentials_required', lang));
    }
    if (dto.databaseName !== undefined) d.databaseName = dto.databaseName;
    if (dto.excludeTables !== undefined) d.excludeTables = dto.excludeTables.length ? [...new Set(dto.excludeTables)] : null;
    if (dto.isActive !== undefined) d.isActive = dto.isActive;
    if (dto.isDefault) {
      d.isDefault = true;
      d.isActive = true;
    }
    if (test) {
      d.lastTestAt = new Date();
      d.lastTestOk = test.ok;
      d.lastTestError = test.error;
      d.serverVersion = test.version ?? d.serverVersion;
    }
    const saved = await this.databases.save(d);
    if (saved.isDefault) await this.unsetOtherDefaults(saved.id);
    return { message: this.t('backup.db.updated', lang), data: { ...this.dbView(saved), test } };
  }

  async setDefaultDatabase(id: string, lang = 'fr') {
    const d = await this.getDatabase(id);
    d.isDefault = true;
    d.isActive = true;
    await this.databases.save(d);
    await this.unsetOtherDefaults(id);
    return { message: this.t('backup.db.default_set', lang, { name: d.name }), data: this.dbView(d) };
  }

  /** Supprime la base de la liste (désactivée si des sauvegardes existent : historique conservé) */
  async deleteDatabase(id: string, lang = 'fr') {
    const d = await this.getDatabase(id);
    if (d.isDefault) throw new BadRequestException(this.t('backup.db.default_delete', lang));
    if (this.busy.has(id)) throw new ConflictException(this.t('backup.db.busy', lang));
    const schedules = await this.schedules.find({ where: { databaseId: id } });
    if (schedules.length) {
      throw new ConflictException(this.t('backup.db.used_by_schedules', lang, { schedules: schedules.map((s) => s.name).join(', ') }));
    }
    const runs = await this.runs.count({ where: { databaseId: id } });
    if (runs) {
      d.isActive = false;
      await this.databases.save(d);
      return { message: this.t('backup.db.deactivated', lang, { count: runs }), data: this.dbView(d) };
    }
    await this.databases.delete({ id });
    return { message: this.t('backup.db.deleted', lang), data: { id } };
  }

  /** Tester une base enregistrée (met à jour le dernier test) */
  async testDatabase(id: string, lang = 'fr') {
    const d = await this.getDatabase(id, true);
    const test = await this.probe(this.toConn(d, lang), lang);
    d.lastTestAt = new Date();
    d.lastTestOk = test.ok;
    d.lastTestError = test.error;
    if (test.version) d.serverVersion = test.version;
    await this.databases.save(d);
    return { message: test.ok ? this.t('backup.db.test_ok', lang) : this.t('backup.db.test_failed', lang, { error: test.error }), data: test };
  }

  /** Tester des identifiants avant de les enregistrer */
  async testConnection(dto: MysqlConnectionDto, lang = 'fr') {
    const test = await this.probe(this.connFromDto(dto, null, lang), lang);
    return { message: test.ok ? this.t('backup.db.test_ok', lang) : this.t('backup.db.test_failed', lang, { error: test.error }), data: test };
  }

  /** Bases présentes sur un serveur MySQL (SHOW DATABASES), pour choisir celle à sauvegarder */
  async discover(dto: MysqlConnectionDto, lang = 'fr') {
    const c = this.connFromDto({ ...dto, databaseName: undefined }, null, lang);
    c.database = '';
    let conn: mysql.Connection | null = null;
    try {
      conn = await mysql.createConnection({ host: c.host, port: Number(c.port), user: c.user, password: c.password, connectTimeout: 8000 });
      const [rows]: any = await conn.query('SHOW DATABASES');
      const names = rows.map((r: any) => String(r.Database ?? Object.values(r)[0])).filter((n: string) => !SYSTEM_DBS.includes(n));
      return { message: this.t('backup.db.discovered', lang, { count: names.length }), data: names };
    } catch (e: any) {
      throw new BadRequestException(this.t('backup.db.test_failed', lang, { error: this.mysqlError(e, lang) }));
    } finally {
      await conn?.end().catch(() => undefined);
    }
  }

  // ============================================================
  // HEURES / FUSEAUX
  // ============================================================
  private validTimezone(tz: string): boolean {
    try {
      new Intl.DateTimeFormat('fr-FR', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }

  private localParts(date: Date, tz: string): LocalParts {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')) + 1;
    return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}`, weekday: wd };
  }

  /** Décalage (minutes) du fuseau par rapport à UTC à cet instant */
  private tzOffset(date: Date, tz: string): number {
    const p = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
    const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
    return Math.round((asUtc - date.getTime()) / 60000);
  }

  /** Prochaine exécution d'une programmation */
  nextRunAt(s: BackupSchedule, from = new Date()): Date | null {
    if (!s.isActive || !s.times?.length) return null;
    const tz = this.validTimezone(s.timezone) ? s.timezone : this.defaultTimezone;
    const times = [...s.times].sort();
    for (let i = 0; i <= 8; i++) {
      const day = this.localParts(new Date(from.getTime() + i * 86400000), tz).date;
      const [y, m, d] = day.split('-').map(Number);
      for (const t of times) {
        const [h, mi] = t.split(':').map(Number);
        const guess = Date.UTC(y, m - 1, d, h, mi);
        const at = new Date(guess - this.tzOffset(new Date(guess), tz) * 60000);
        if (at <= from) continue;
        if (s.days?.length && !s.days.includes(this.localParts(at, tz).weekday)) continue;
        return at;
      }
    }
    return null;
  }

  private describe(s: BackupSchedule): string {
    const days = s.days?.length && s.days.length < 7 ? [...s.days].sort().map((d) => DAY_LABELS[d]).join(', ') : 'Tous les jours';
    return `${days} à ${[...s.times].sort().join(', ')} (${s.timezone})`;
  }

  private view(s: BackupSchedule, dbs?: Map<string, BackupDatabase>) {
    const d = s.databaseId ? dbs?.get(s.databaseId) : undefined;
    return {
      ...s,
      description: this.describe(s),
      nextRunAt: this.nextRunAt(s),
      database: d ? { id: d.id, name: d.name, databaseName: d.databaseName, isActive: d.isActive, label: this.label(d) } : null,
    };
  }

  // ============================================================
  // PLANIFICATEUR : vérifie les programmations chaque minute
  // ============================================================
  @Cron('0 * * * * *')
  async tick() {
    if (!this.schedulerEnabled) return;
    let list: BackupSchedule[] = [];
    try {
      list = await this.schedules.find({ where: { isActive: true } });
    } catch {
      return; // table absente (script SQL pas encore exécuté)
    }
    const now = new Date();
    for (const s of list) {
      const tz = this.validTimezone(s.timezone) ? s.timezone : this.defaultTimezone;
      const p = this.localParts(now, tz);
      if (!s.times?.includes(p.time)) continue;
      if (s.days?.length && !s.days.includes(p.weekday)) continue;
      const slot = `${p.date} ${p.time}`;
      // Réservation atomique du créneau : une seule exécution, même avec plusieurs instances (pm2 cluster)
      const res = await this.schedules
        .createQueryBuilder()
        .update(BackupSchedule)
        .set({ lastSlot: slot })
        .where('id = :id AND (lastSlot IS NULL OR lastSlot <> :slot)', { id: s.id, slot })
        .execute();
      if (!res.affected) continue;
      this.logger.log(`⏰ Sauvegarde programmée « ${s.name} » (${slot} ${tz})`);
      void this.runBackup({ trigger: BackupTrigger.SCHEDULED, scheduleId: s.id, includeUploads: s.includeUploads, databaseId: s.databaseId })
        .then((run) => this.schedules.update({ id: s.id }, { lastRunAt: new Date(), lastStatus: run.status }))
        .catch((e) => this.logger.error(`Sauvegarde « ${s.name} » : ${e?.message}`));
    }
  }

  // ============================================================
  // EXÉCUTION D'UNE SAUVEGARDE
  // ============================================================
  async runBackup(opts: {
    trigger: BackupTrigger;
    scheduleId?: string | null;
    includeUploads?: boolean;
    userId?: string | null;
    databaseId?: string | null;
  }): Promise<BackupRun> {
    let conn: DbConn;
    try {
      conn = await this.resolve(opts.databaseId);
    } catch (e: any) {
      return this.runs.save(
        this.runs.create({
          trigger: opts.trigger,
          scheduleId: opts.scheduleId ?? null,
          databaseId: opts.databaseId ?? null,
          status: BackupStatus.FAILED,
          error: String(e?.response?.message ?? e?.message ?? e).slice(0, 2000),
          createdById: opts.userId ?? null,
          finishedAt: new Date(),
        }),
      );
    }
    const lockKey = conn.id ?? 'app';
    if (this.busy.has(lockKey)) {
      return this.runs.save(
        this.runs.create({
          trigger: opts.trigger,
          scheduleId: opts.scheduleId ?? null,
          databaseId: conn.id,
          databaseLabel: conn.label,
          status: BackupStatus.SKIPPED,
          error: 'Une sauvegarde de cette base est déjà en cours',
          createdById: opts.userId ?? null,
          finishedAt: new Date(),
        }),
      );
    }
    this.busy.add(lockKey);
    const started = Date.now();
    const run = await this.runs.save(
      this.runs.create({
        trigger: opts.trigger,
        scheduleId: opts.scheduleId ?? null,
        databaseId: conn.id,
        databaseLabel: conn.label,
        status: BackupStatus.RUNNING,
        deleted: false,
        createdById: opts.userId ?? null,
      }),
    );

    const stamp = this.fileStamp(new Date());
    const tag = opts.trigger === BackupTrigger.SCHEDULED ? 'auto' : opts.trigger === BackupTrigger.BEFORE_RESTORE ? 'avant-restauration' : 'manuel';
    const dbFile = `${this.filePrefix(conn)}_${stamp}_${tag}.sql.gz`;

    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const size = await this.dumpDatabase(conn, path.join(this.dir, dbFile));
      run.fileName = dbFile;
      run.sizeBytes = String(size);

      if (opts.includeUploads) {
        try {
          const up = await this.archiveUploads(`uploads_${stamp}_${tag}.tar.gz`);
          if (up) {
            run.uploadsFileName = up.name;
            run.uploadsSizeBytes = String(up.size);
          }
        } catch (e: any) {
          run.error = `Base sauvegardée, mais archive des fichiers impossible : ${String(e?.message).slice(0, 800)}`;
        }
      }

      run.status = BackupStatus.SUCCESS;
      this.logger.log(`✅ Sauvegarde ${dbFile} (${this.human(size)}) — ${conn.label}`);
    } catch (e: any) {
      run.status = BackupStatus.FAILED;
      run.error = String(e?.message || e).slice(0, 2000);
      this.logger.error(`❌ Sauvegarde échouée (${conn.label}) : ${run.error}`);
      fs.promises.unlink(path.join(this.dir, dbFile)).catch(() => undefined);
    } finally {
      run.finishedAt = new Date();
      run.durationMs = Date.now() - started;
      await this.runs.save(run);
      this.busy.delete(lockKey);
      if (conn.id) {
        await this.databases.update({ id: conn.id }, { lastBackupAt: new Date(), lastBackupStatus: run.status }).catch(() => undefined);
      }
    }

    // ✅ Journal d'audit : sauvegardes programmées (hors requête HTTP ; les manuelles sont journalisées par la route)
    const meta = {
      trigger: opts.trigger,
      scheduleId: opts.scheduleId ?? null,
      databaseId: conn.id,
      database: conn.label,
      fileName: run.fileName ?? null,
      sizeBytes: run.sizeBytes ?? null,
    };
    if (!currentAudit()) {
      this.audit?.record({
        userId: opts.userId ?? null,
        userName: opts.userId ? null : 'SYSTEM',
        action: ActionType.BACKUP,
        entity: 'backup_runs',
        entityId: run.id,
        category: AuditCategory.ADMIN,
        severity: run.status === BackupStatus.FAILED ? AuditSeverity.WARNING : AuditSeverity.INFO,
        status: run.status === BackupStatus.FAILED ? AuditStatus.FAILURE : AuditStatus.SUCCESS,
        errorMessage: run.error ?? null,
        durationMs: run.durationMs ?? null,
        platform: 'system',
        metadata: meta,
      });
    } else {
      this.audit?.annotate({ action: ActionType.BACKUP, entityId: run.id, metadata: meta });
    }

    if (run.status === BackupStatus.SUCCESS) {
      await this.rotate({ ...opts, databaseId: conn.id }).catch((e) => this.logger.warn(`Rotation des sauvegardes : ${e?.message}`));
    }
    return run;
  }

  /** Préfixe des fichiers : nom de la base (+ début de l'identifiant si ce n'est pas la base par défaut) */
  private filePrefix(c: DbConn): string {
    const db = String(c.database || 'favor').replace(/[^A-Za-z0-9_-]/g, '') || 'favor';
    return c.id ? `${db}-${c.id.slice(0, 6)}` : db;
  }

  private fileStamp(d: Date): string {
    const p = this.localParts(d, this.defaultTimezone);
    const sec = String(d.getSeconds()).padStart(2, '0');
    return `${p.date}_${p.time.replace(':', '-')}-${sec}`;
  }

  private human(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
    return `${(bytes / 1024 ** 3).toFixed(2)} Go`;
  }

  /** mysqldump → gzip → fichier (.part renommé à la fin) */
  private async dumpDatabase(c: DbConn, target: string): Promise<number> {
    if (!c.database) throw new Error('Nom de la base inconnu');
    const tmp = `${target}.part`;
    let lastError = '';
    for (const bin of this.dumpCandidates()) {
      if (path.isAbsolute(bin) && !fs.existsSync(bin)) continue;
      try {
        await this.spawnToFile(bin, this.dumpArgs(c), tmp, c.password);
        const size = fs.statSync(tmp).size;
        if (size < 200) throw new Error('Fichier de sauvegarde vide');
        fs.renameSync(tmp, target);
        return size;
      } catch (e: any) {
        fs.rmSync(tmp, { force: true });
        if (e?.code === 'ENOENT') {
          lastError = `${bin} introuvable`;
          continue; // essayer l'outil suivant
        }
        throw e;
      }
    }
    throw new Error(`mysqldump introuvable (${lastError}). Installez mysql-client ou renseignez BACKUP_MYSQLDUMP_PATH.`);
  }

  private spawnToFile(bin: string, args: string[], file: string, password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, {
        env: { ...process.env, MYSQL_PWD: String(password ?? '') },
        windowsHide: true,
      });
      let stderr = '';
      let failed = false;
      child.stderr.on('data', (c) => {
        if (stderr.length < 4000) stderr += c.toString();
      });
      child.on('error', (err) => {
        failed = true;
        reject(err);
      });
      const out = pipeline(child.stdout, zlib.createGzip({ level: 6 }), fs.createWriteStream(file));
      child.on('close', (code) => {
        if (failed) return;
        out
          .then(() => {
            if (code === 0) resolve();
            else reject(new Error(`mysqldump a échoué (code ${code}) : ${this.cleanStderr(stderr)}`));
          })
          .catch(reject);
      });
    });
  }

  private cleanStderr(s: string): string {
    return s
      .split('\n')
      .filter((l) => l.trim() && !/Using a password|Deprecated program name/i.test(l))
      .join(' ')
      .slice(0, 1500);
  }

  /** Archive tar.gz du dossier des fichiers envoyés (UPLOAD_PATH) */
  private archiveUploads(name: string): Promise<{ name: string; size: number } | null> {
    const src = process.env.UPLOAD_PATH?.trim();
    if (!src || !fs.existsSync(src)) return Promise.resolve(null);
    const target = path.join(this.dir, name);
    const resolvedSrc = path.resolve(src);
    if (path.resolve(this.dir).startsWith(resolvedSrc + path.sep)) {
      return Promise.reject(new Error('BACKUP_DIR ne doit pas être dans UPLOAD_PATH'));
    }
    return new Promise((resolve, reject) => {
      const child = spawn('tar', ['-czf', target, '-C', path.dirname(resolvedSrc), path.basename(resolvedSrc)], { windowsHide: true });
      let stderr = '';
      child.stderr.on('data', (c) => (stderr += c.toString().slice(0, 2000)));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0 && fs.existsSync(target)) resolve({ name, size: fs.statSync(target).size });
        else {
          fs.rmSync(target, { force: true });
          reject(new Error(`tar a échoué (code ${code}) : ${stderr.trim()}`));
        }
      });
    });
  }

  /** Garde les N dernières sauvegardes de la programmation (ou des sauvegardes manuelles de la base) */
  private async rotate(opts: { trigger: BackupTrigger; scheduleId?: string | null; databaseId?: string | null }) {
    let keep: number;
    const where: any = { status: BackupStatus.SUCCESS, deleted: false };
    if (opts.trigger === BackupTrigger.SCHEDULED && opts.scheduleId) {
      const s = await this.schedules.findOne({ where: { id: opts.scheduleId } });
      keep = s?.keepLast ?? 14;
      where.scheduleId = opts.scheduleId;
    } else if (opts.trigger === BackupTrigger.MANUAL) {
      keep = this.keepManual;
      where.trigger = BackupTrigger.MANUAL;
      if (opts.databaseId) where.databaseId = opts.databaseId;
    } else return;

    const old = await this.runs.find({ where, order: { startedAt: 'DESC' }, skip: keep, take: 500 });
    for (const r of old) {
      for (const f of [r.fileName, r.uploadsFileName]) {
        if (f && SAFE_NAME.test(f)) await fs.promises.unlink(path.join(this.dir, f)).catch(() => undefined);
      }
      await this.runs.update({ id: r.id }, { deleted: true });
    }
    if (old.length) this.logger.log(`🧹 ${old.length} ancienne(s) sauvegarde(s) supprimée(s)`);
  }

  // ============================================================
  // PROGRAMMATIONS (CRUD)
  // ============================================================
  private async dbMap(): Promise<Map<string, BackupDatabase>> {
    const list = await this.databases.find().catch(() => [] as BackupDatabase[]);
    return new Map(list.map((d) => [d.id, d]));
  }

  async listSchedules(databaseId?: string) {
    const list = await this.schedules.find({ where: databaseId ? { databaseId } : {}, order: { createdAt: 'ASC' } });
    const dbs = await this.dbMap();
    return { message: 'Programmations des sauvegardes', data: list.map((s) => this.view(s, dbs)) };
  }

  private clean(dto: Partial<CreateBackupScheduleDto>) {
    const out: any = { ...dto };
    if (dto.times) out.times = [...new Set(dto.times)].sort();
    if (dto.days) out.days = dto.days.length && dto.days.length < 7 ? [...new Set(dto.days)].sort() : null;
    if (dto.timezone !== undefined) {
      if (!this.validTimezone(dto.timezone)) throw new BadRequestException(`Fuseau horaire inconnu : ${dto.timezone}`);
    }
    return out;
  }

  /** Base d'une programmation : celle choisie (active) ou la base par défaut */
  private async scheduleDatabase(databaseId: string | null | undefined, lang = 'fr'): Promise<string | null> {
    if (databaseId) {
      const d = await this.getDatabase(databaseId);
      if (!d.isActive) throw new BadRequestException(this.t('backup.db.inactive', lang, { name: d.name }));
      return d.id;
    }
    const def = await this.databases.findOne({ where: { isDefault: true, isActive: true } });
    return def?.id ?? null;
  }

  async createSchedule(dto: CreateBackupScheduleDto, userId: string, lang = 'fr') {
    const databaseId = await this.scheduleDatabase(dto.databaseId, lang);
    const s = this.schedules.create({
      ...this.clean(dto),
      databaseId,
      timezone: dto.timezone || this.defaultTimezone,
      keepLast: dto.keepLast ?? 14,
      includeUploads: dto.includeUploads ?? false,
      isActive: dto.isActive ?? true,
      createdById: userId,
    } as Partial<BackupSchedule>);
    const saved = (await this.schedules.save(s)) as BackupSchedule;
    return { message: 'Programmation créée', data: this.view(saved, await this.dbMap()) };
  }

  async updateSchedule(id: string, dto: UpdateBackupScheduleDto, lang = 'fr') {
    const s = await this.schedules.findOne({ where: { id } });
    if (!s) throw new NotFoundException('Programmation introuvable');
    const { databaseId, ...rest } = dto;
    Object.assign(s, this.clean(rest));
    if (dto.days && (!dto.days.length || dto.days.length === 7)) s.days = null;
    if (databaseId !== undefined) s.databaseId = await this.scheduleDatabase(databaseId, lang);
    const saved = await this.schedules.save(s);
    return { message: 'Programmation modifiée', data: this.view(saved, await this.dbMap()) };
  }

  async deleteSchedule(id: string) {
    const res = await this.schedules.delete({ id });
    if (!res.affected) throw new NotFoundException('Programmation introuvable');
    return { message: 'Programmation supprimée (les fichiers déjà créés sont conservés)' };
  }

  async runScheduleNow(id: string, userId: string) {
    const s = await this.schedules.findOne({ where: { id } });
    if (!s) throw new NotFoundException('Programmation introuvable');
    if (this.busy.has(s.databaseId ?? 'app')) throw new ConflictException('Une sauvegarde de cette base est déjà en cours');
    const run = await this.runBackup({ trigger: BackupTrigger.SCHEDULED, scheduleId: s.id, includeUploads: s.includeUploads, userId, databaseId: s.databaseId });
    await this.schedules.update({ id }, { lastRunAt: new Date(), lastStatus: run.status });
    return this.runResult(run);
  }

  async manualBackup(userId: string, includeUploads = false, databaseId?: string | null, lang = 'fr') {
    if (databaseId) {
      const d = await this.getDatabase(databaseId);
      if (!d.isActive) throw new BadRequestException(this.t('backup.db.inactive', lang, { name: d.name }));
    }
    if (this.busy.has(databaseId ?? 'app')) throw new ConflictException('Une sauvegarde de cette base est déjà en cours');
    return this.runResult(await this.runBackup({ trigger: BackupTrigger.MANUAL, includeUploads, userId, databaseId }));
  }

  private runResult(run: BackupRun) {
    if (run.status !== BackupStatus.SUCCESS) {
      throw new BadRequestException({ message: run.error || 'Sauvegarde échouée', data: run });
    }
    return { message: `Sauvegarde créée : ${run.fileName}`, data: run };
  }

  // ============================================================
  // HISTORIQUE / FICHIERS
  // ============================================================
  async listRuns(q: BackupRunsQueryDto) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    const where: any = {};
    if (q.status) where.status = q.status;
    if (q.scheduleId) where.scheduleId = q.scheduleId;
    if (q.databaseId) where.databaseId = q.databaseId;
    const [rows, total] = await this.runs.findAndCount({ where, order: { startedAt: 'DESC' }, skip: (page - 1) * limit, take: limit });
    return { message: 'Historique des sauvegardes', data: rows, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async listFiles(q: BackupFilesQueryDto = {}) {
    if (!fs.existsSync(this.dir)) return [];
    const names = fs.readdirSync(this.dir).filter((f) => SAFE_NAME.test(f) && BACKUP_EXT.some((e) => f.endsWith(e)));
    // Base d'origine de chaque fichier (historique)
    const runs = names.length
      ? await this.runs
          .createQueryBuilder('r')
          .select(['r.fileName', 'r.uploadsFileName', 'r.databaseId', 'r.databaseLabel', 'r.trigger'])
          .where('r.fileName IN (:...names) OR r.uploadsFileName IN (:...names)', { names })
          .getMany()
          .catch(() => [] as BackupRun[])
      : [];
    const byFile = new Map<string, BackupRun>();
    for (const r of runs) {
      if (r.fileName) byFile.set(r.fileName, r);
      if (r.uploadsFileName) byFile.set(r.uploadsFileName, r);
    }
    return names
      .map((f) => {
        const st = fs.statSync(path.join(this.dir, f));
        const run = byFile.get(f);
        return {
          fileName: f,
          type: f.endsWith('.tar.gz') ? 'FILES' : 'DATABASE',
          sizeBytes: st.size,
          size: this.human(st.size),
          createdAt: st.mtime,
          databaseId: run?.databaseId ?? null,
          database: run?.databaseLabel ?? null,
          trigger: run?.trigger ?? null,
        };
      })
      .filter((f) => !q.databaseId || f.databaseId === q.databaseId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /** Chemin sûr d'un fichier de sauvegarde (aucun accès hors de BACKUP_DIR) */
  filePath(fileName: string): string {
    const name = path.basename(String(fileName || ''));
    if (name !== fileName || !SAFE_NAME.test(name) || !BACKUP_EXT.some((e) => name.endsWith(e))) {
      throw new BadRequestException('Nom de fichier invalide');
    }
    const full = path.join(this.dir, name);
    if (!fs.existsSync(full)) throw new NotFoundException('Fichier de sauvegarde introuvable');
    return full;
  }

  async deleteFile(fileName: string) {
    const full = this.filePath(fileName);
    await fs.promises.unlink(full);
    await this.runs.update({ fileName }, { deleted: true });
    await this.runs.update({ uploadsFileName: fileName }, { uploadsFileName: null });
    return { message: `Fichier supprimé : ${fileName}` };
  }

  async info() {
    const files = await this.listFiles();
    const last = await this.runs.findOne({ where: { status: BackupStatus.SUCCESS }, order: { startedAt: 'DESC' } }).catch(() => null);
    const lastFailed = await this.runs
      .findOne({ where: { status: BackupStatus.FAILED, startedAt: MoreThan(new Date(Date.now() - 7 * 86400000)) }, order: { startedAt: 'DESC' } })
      .catch(() => null);
    const dbs = await this.databases.find({ order: { isDefault: 'DESC', name: 'ASC' } }).catch(() => [] as BackupDatabase[]);
    const def = dbs.find((d) => d.isDefault);
    return {
      message: 'Sauvegardes',
      data: {
        database: def?.databaseName ?? this.appDb.database,
        defaultDatabase: def ? this.dbView(def) : null,
        databases: dbs.map((d) => ({
          id: d.id,
          name: d.name,
          databaseName: d.databaseName,
          label: this.label(d),
          isDefault: d.isDefault,
          isActive: d.isActive,
          lastBackupAt: d.lastBackupAt,
          lastBackupStatus: d.lastBackupStatus,
          lastTestOk: d.lastTestOk,
          running: this.busy.has(d.id),
        })),
        directory: this.dir,
        timezone: this.defaultTimezone,
        schedulerEnabled: this.schedulerEnabled,
        restoreEnabled: this.allowRestore,
        running: this.busy.size > 0,
        filesCount: files.length,
        totalSize: this.human(files.reduce((n, f) => n + f.sizeBytes, 0)),
        lastSuccess: last,
        lastFailure: lastFailed,
      },
    };
  }

  // ============================================================
  // RESTAURATION (désactivée par défaut) — toujours dans la base d'origine du fichier
  // ============================================================
  async restore(fileName: string, userId: string) {
    if (!this.allowRestore) {
      throw new ForbiddenException('Restauration désactivée sur ce serveur (BACKUP_ALLOW_RESTORE=true pour l\'activer)');
    }
    const full = this.filePath(fileName);
    if (fileName.endsWith('.tar.gz')) throw new BadRequestException('Seules les sauvegardes de la base (.sql / .sql.gz) se restaurent');

    const origin = await this.runs.findOne({ where: { fileName } }).catch(() => null);
    const conn = await this.resolve(origin?.databaseId ?? null);
    const lockKey = conn.id ?? 'app';
    if (this.busy.has(lockKey)) throw new ConflictException('Une sauvegarde de cette base est en cours, réessayez dans un instant');

    // Sécurité : sauvegarde de l'état actuel avant d'écraser la base
    const safety = await this.runBackup({ trigger: BackupTrigger.BEFORE_RESTORE, userId, databaseId: conn.id });
    if (safety.status !== BackupStatus.SUCCESS) {
      throw new BadRequestException(`Restauration annulée : la sauvegarde de sécurité a échoué (${safety.error})`);
    }

    this.busy.add(lockKey);
    try {
      let lastError = '';
      for (const bin of this.mysqlCandidates()) {
        if (path.isAbsolute(bin) && !fs.existsSync(bin)) continue;
        try {
          await this.spawnFromFile(bin, ['-h', conn.host, '-P', conn.port, '-u', conn.user, conn.database], full, conn.password);
          this.logger.warn(`♻️ Base ${conn.label} restaurée depuis ${fileName} par ${userId}`);
          this.audit?.annotate({
            action: ActionType.RESTORE,
            entity: 'backup_runs',
            severity: AuditSeverity.CRITICAL,
            metadata: { fileName, safetyBackup: safety.fileName, databaseId: conn.id, database: conn.label },
          });
          return { message: `Base ${conn.label} restaurée depuis ${fileName}. Sauvegarde de sécurité : ${safety.fileName}` };
        } catch (e: any) {
          if (e?.code === 'ENOENT') {
            lastError = `${bin} introuvable`;
            continue;
          }
          throw new BadRequestException(`Restauration échouée : ${e?.message}`);
        }
      }
      throw new BadRequestException(`Client mysql introuvable (${lastError}). Renseignez BACKUP_MYSQL_PATH.`);
    } finally {
      this.busy.delete(lockKey);
    }
  }

  private spawnFromFile(bin: string, args: string[], file: string, password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { env: { ...process.env, MYSQL_PWD: String(password ?? '') }, windowsHide: true });
      let stderr = '';
      let failed = false;
      child.stderr.on('data', (c) => {
        if (stderr.length < 4000) stderr += c.toString();
      });
      child.on('error', (err) => {
        failed = true;
        reject(err);
      });
      const input = fs.createReadStream(file);
      const src = file.endsWith('.gz') ? input.pipe(zlib.createGunzip()) : input;
      pipeline(src, child.stdin).catch(() => undefined);
      child.on('close', (code) => {
        if (failed) return;
        if (code === 0) resolve();
        else reject(new Error(`mysql a échoué (code ${code}) : ${this.cleanStderr(stderr)}`));
      });
    });
  }
}
