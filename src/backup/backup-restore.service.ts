// src/backup/backup-restore.service.ts
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
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { Readable, Transform, TransformCallback } from 'stream';
import { pipeline } from 'stream/promises';
import * as mysql from 'mysql2/promise';
import { I18nService } from 'src/libs/common/src';
import { AuditService } from 'src/audit/audit.service';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { AuditCategory, AuditSeverity, AuditStatus } from 'src/audit/enum/audit.enums';
import { paginated, pageParams } from 'src/common/pagination/paginate.util';
import { BackupService, DbConn } from './backup.service';
import { BackupRun, BackupStatus, BackupTrigger } from './entities/backup-run.entity';
import { BackupDatabase } from './entities/backup-database.entity';
import { BackupRestore, RestoreKind, RestorePhase, RestoreSource, RestoreStatus } from './entities/backup-restore.entity';
import { encryptSecret, decryptSecret } from './backup-crypto';
import { BackupRestoresQueryDto, ImportBackupDto, StartRestoreDto } from './dto/backup.dto';

type Actor = { id?: string | null; fullName?: string | null };

/** Analyse d'un fichier de sauvegarde (début du fichier seulement) */
export type DumpInfo = {
  fileName: string;
  sizeBytes: number;
  size: string;
  compressed: boolean;
  looksLikeSql: boolean;
  tool: string;
  serverVersion: string | null;
  sourceDatabase: string | null;
  tablesInSample: number;
  hasUseStatement: boolean;
  hasCreateDatabase: boolean;
  warnings: string[];
};

type RunCtx = {
  full: string | null;
  gz: boolean;
  source: DbConn | null;
  target: DbConn;
  server: DbConn;
  safety: boolean;
  createDb: boolean;
  register: boolean;
  force: boolean;
  lockKey: string;
  user: Actor;
};

const NEW_DB_NAME = /^[A-Za-z0-9_]{1,64}$/;
const SAMPLE_BYTES = 512 * 1024;

/**
 * ✅ Les lignes « USE `autre_base` », « CREATE DATABASE … » et « DROP DATABASE … » d'un fichier SQL
 * sont mises en commentaire : la restauration va TOUJOURS dans la base cible choisie.
 * (Seul le début de chaque ligne est examiné : aucune donnée n'est chargée en mémoire.)
 */
class StripDatabaseSwitch extends Transform {
  private head: number[] | null = [];

  private decide(buf: Buffer): Buffer {
    const s = buf.toString('latin1').replace(/^\s+/, '').toUpperCase();
    if (/^(USE[\s`]|CREATE\s+(DATABASE|SCHEMA)|DROP\s+(DATABASE|SCHEMA))/.test(s)) return Buffer.concat([Buffer.from('-- [favor] ignoré : '), buf]);
    return buf;
  }

  _transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback) {
    const parts: Buffer[] = [];
    let i = 0;
    while (i < chunk.length) {
      if (this.head) {
        const b = chunk[i++];
        this.head.push(b);
        if (b === 10 || this.head.length >= 32) {
          parts.push(this.decide(Buffer.from(this.head)));
          this.head = b === 10 ? [] : null;
        }
        continue;
      }
      const nl = chunk.indexOf(10, i);
      if (nl === -1) {
        parts.push(chunk.subarray(i));
        i = chunk.length;
      } else {
        parts.push(chunk.subarray(i, nl + 1));
        i = nl + 1;
        this.head = [];
      }
    }
    cb(null, parts.length === 1 ? parts[0] : Buffer.concat(parts));
  }

  _flush(cb: TransformCallback) {
    if (this.head?.length) this.push(this.decide(Buffer.from(this.head)));
    cb();
  }
}

/** Compte les octets lus (progression) */
class ByteCounter extends Transform {
  constructor(private readonly onBytes: (n: number) => void) {
    super();
  }
  _transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback) {
    this.onBytes(chunk.length);
    cb(null, chunk);
  }
}

/**
 * ✅ RESTAURATION, IMPORT ET COPIE DE BASES (super admin, BACKUP_ALLOW_RESTORE=true)
 *
 *  - Restaurer un fichier de sauvegarde (.sql / .sql.gz) dans la base d'origine, dans une autre base
 *    enregistrée ou dans une NOUVELLE base créée pour l'occasion.
 *  - Importer un fichier .sql / .sql.gz envoyé depuis l'administration (puis le restaurer).
 *  - Copier directement une base enregistrée vers une autre (mysqldump → mysql, sans fichier).
 *  - Restaurer l'archive des fichiers (.tar.gz) dans UPLOAD_PATH.
 *  Sécurité : confirmation « RESTAURER » + nom exact de la base cible, sauvegarde de sécurité automatique
 *  de la base écrasée (toujours pour la base de l'application), une seule opération à la fois par base,
 *  traitement en arrière-plan avec progression (GET /backup/restores/:id).
 */
@Injectable()
export class BackupRestoreService implements OnModuleInit {
  private readonly logger = new Logger(BackupRestoreService.name);
  /** Opérations en cours (progression en mémoire, même si la table est remplacée pendant la restauration) */
  private readonly live = new Map<string, BackupRestore>();
  private readonly locks = new Set<string>();
  private readonly lastPersist = new Map<string, number>();

  constructor(
    private readonly backup: BackupService,
    @InjectRepository(BackupRestore) private readonly restores: Repository<BackupRestore>,
    @InjectRepository(BackupRun) private readonly runs: Repository<BackupRun>,
    @InjectRepository(BackupDatabase) private readonly databases: Repository<BackupDatabase>,
    @Optional() private readonly i18n?: I18nService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  private t(key: string, lang = 'fr', params?: Record<string, any>): string {
    try {
      return this.i18n ? this.i18n.translate(`backup.restore.${key}`, lang, params) : key;
    } catch {
      return key;
    }
  }

  async onModuleInit() {
    try {
      await this.restores.update(
        { status: RestoreStatus.RUNNING },
        { status: RestoreStatus.FAILED, phase: RestorePhase.DONE, error: 'Interrompue (redémarrage du serveur)', finishedAt: new Date() },
      );
    } catch {
      /* table absente : exécuter db/sql/restauration_import_bases.sql */
    }
    // Envois interrompus
    try {
      const dir = this.incomingDir();
      if (fs.existsSync(dir)) {
        for (const f of fs.readdirSync(dir)) {
          const full = path.join(dir, f);
          if (Date.now() - fs.statSync(full).mtimeMs > 24 * 3600 * 1000) fs.rmSync(full, { force: true });
        }
      }
    } catch {
      /* ignore */
    }
  }

  incomingDir(): string {
    return path.join(this.backup.dir, '.incoming');
  }

  private assertEnabled(lang: string) {
    if (!this.backup.allowRestore) throw new ForbiddenException(this.t('disabled', lang));
  }

  // ============================================================
  // OUTILS
  // ============================================================
  /** Exécutable trouvé dans le PATH (ou chemin absolu existant) */
  private findBin(candidates: string[]): string | null {
    const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
    for (const c of candidates) {
      if (!c) continue;
      if (path.isAbsolute(c)) {
        if (fs.existsSync(c)) return c;
        continue;
      }
      for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
        if (!dir) continue;
        for (const ext of exts) {
          const f = path.join(dir, c + ext);
          if (fs.existsSync(f)) return f;
        }
      }
    }
    return null;
  }

  private async isGzip(file: string): Promise<boolean> {
    const fd = await fs.promises.open(file, 'r');
    try {
      const b = Buffer.alloc(2);
      await fd.read(b, 0, 2, 0);
      return b[0] === 0x1f && b[1] === 0x8b;
    } finally {
      await fd.close();
    }
  }

  private readSample(file: string, gz: boolean, limit = SAMPLE_BYTES): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let n = 0;
      let done = false;
      const input = fs.createReadStream(file);
      const src: NodeJS.ReadableStream = gz ? input.pipe(zlib.createGunzip()) : input;
      const finish = (err?: any) => {
        if (done) return;
        done = true;
        input.destroy();
        const buf = Buffer.concat(chunks).subarray(0, limit);
        if (err && !buf.length) reject(err);
        else resolve(buf);
      };
      src.on('data', (c: Buffer) => {
        chunks.push(c);
        n += c.length;
        if (n >= limit) finish();
      });
      src.on('end', () => finish());
      src.on('error', finish);
      input.on('error', finish);
    });
  }

  /** Analyse du début d'un fichier SQL : outil, version, base d'origine, nombre de tables… */
  async analyzeFile(full: string, displayName: string): Promise<DumpInfo> {
    const sizeBytes = fs.statSync(full).size;
    const gz = await this.isGzip(full);
    let sample: Buffer = Buffer.alloc(0);
    const warnings: string[] = [];
    try {
      sample = await this.readSample(full, gz);
    } catch (e: any) {
      warnings.push(`Lecture impossible : ${e?.message}`);
    }
    const text = sample.toString('utf8');
    const hasNul = sample.includes(0);
    const looksLikeSql =
      !hasNul && /(CREATE TABLE|INSERT INTO|DROP TABLE|LOCK TABLES|SET NAMES|-- MySQL dump|-- MariaDB dump|phpMyAdmin SQL Dump)/i.test(text);
    const tool = /-- MariaDB dump/i.test(text)
      ? 'mariadb-dump'
      : /-- MySQL dump/i.test(text)
        ? 'mysqldump'
        : /phpMyAdmin SQL Dump/i.test(text)
          ? 'phpMyAdmin'
          : /Adminer/i.test(text)
            ? 'Adminer'
            : 'inconnu';
    const serverVersion =
      text.match(/-- Server version\s*:?\s*([^\r\n]+)/i)?.[1]?.trim() ?? text.match(/-- Version du serveur\s*:\s*([^\r\n]+)/i)?.[1]?.trim() ?? null;
    const sourceDatabase =
      text.match(/-- Host:[^\r\n]*Database:\s*([^\s\r\n]+)/i)?.[1] ??
      text.match(/-- (?:Database|Base de données)\s*:\s*`?([^`\r\n]+)`?/i)?.[1]?.trim() ??
      null;
    const hasUseStatement = /^\s*USE[\s`]/im.test(text);
    const hasCreateDatabase = /^\s*CREATE\s+(DATABASE|SCHEMA)/im.test(text);
    if (hasUseStatement || hasCreateDatabase) warnings.push('Les instructions USE / CREATE DATABASE du fichier seront ignorées (restauration dans la base cible choisie).');
    if (!looksLikeSql) warnings.push('Ce fichier ne ressemble pas à une sauvegarde MySQL.');
    return {
      fileName: displayName,
      sizeBytes,
      size: this.backup.human(sizeBytes),
      compressed: gz,
      looksLikeSql,
      tool,
      serverVersion,
      sourceDatabase,
      tablesInSample: (text.match(/CREATE TABLE/gi) ?? []).length,
      hasUseStatement,
      hasCreateDatabase,
      warnings,
    };
  }

  async inspect(fileName: string, lang = 'fr') {
    const full = this.backup.filePath(fileName);
    if (fileName.endsWith('.tar.gz')) {
      const st = fs.statSync(full);
      return { message: this.t('inspect', lang), data: { fileName, type: 'FILES', sizeBytes: st.size, size: this.backup.human(st.size), target: process.env.UPLOAD_PATH ?? null } };
    }
    const origin = await this.runs.findOne({ where: { fileName } }).catch(() => null);
    const info = await this.analyzeFile(full, fileName);
    return {
      message: this.t('inspect', lang),
      data: { ...info, type: 'DATABASE', originDatabaseId: origin?.databaseId ?? null, originDatabase: origin?.databaseLabel ?? null, trigger: origin?.trigger ?? null },
    };
  }

  private serverConfig(c: DbConn, withDatabase = false): any {
    return {
      host: c.host,
      port: Number(c.port),
      user: c.user,
      password: c.password,
      database: withDatabase ? c.database : undefined,
      connectTimeout: 10000,
      charset: 'utf8mb4',
    };
  }

  /** La base existe-t-elle, et combien de tables contient-elle ? (SHOW, sans information_schema) */
  private async serverDatabaseState(server: DbConn, name: string): Promise<{ exists: boolean; tables: number }> {
    const conn = await mysql.createConnection(this.serverConfig(server));
    try {
      const [dbs] = await conn.query('SHOW DATABASES LIKE ?', [name]);
      if (!(dbs as any[]).length) return { exists: false, tables: 0 };
      const [tables] = await conn.query(`SHOW TABLES FROM \`${name}\``);
      return { exists: true, tables: (tables as any[]).length };
    } finally {
      await conn.end().catch(() => undefined);
    }
  }

  private async createDatabase(server: DbConn, name: string, lang: string) {
    if (!NEW_DB_NAME.test(name)) throw new BadRequestException(this.t('db_name_invalid', lang));
    const conn = await mysql.createConnection(this.serverConfig(server));
    try {
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    } catch (e: any) {
      throw new Error(this.t('create_db_failed', lang, { name, error: e?.sqlMessage ?? e?.message }));
    } finally {
      await conn.end().catch(() => undefined);
    }
  }

  private sameHost(a: string, b: string): boolean {
    const local = (h: string) => ['localhost', '127.0.0.1', '::1'].includes(String(h).toLowerCase());
    return a === b || (local(a) && local(b));
  }

  private isAppDatabase(c: DbConn): boolean {
    const app = this.backup.appDb;
    return c.database === app.database && this.sameHost(c.host, app.host) && String(c.port) === String(app.port);
  }

  private view(r: BackupRestore) {
    const live = this.live.get(r.id) ?? r;
    const total = Number(live.bytesTotal ?? 0);
    const done = Number(live.bytesDone ?? 0);
    return {
      ...live,
      running: live.status === RestoreStatus.RUNNING,
      bytesTotalHuman: total ? this.backup.human(total) : null,
      bytesDoneHuman: done ? this.backup.human(done) : null,
    };
  }

  private persistSoon(job: BackupRestore, force = false) {
    const last = this.lastPersist.get(job.id) ?? 0;
    if (!force && Date.now() - last < 3000) return;
    this.lastPersist.set(job.id, Date.now());
    // Pendant la restauration de la base de l'application, la table peut être remplacée : erreurs ignorées
    void this.restores
      .update({ id: job.id }, { phase: job.phase, progress: job.progress, bytesDone: job.bytesDone, bytesTotal: job.bytesTotal, safetyBackupFile: job.safetyBackupFile })
      .catch(() => undefined);
  }

  // ============================================================
  // LISTE / DÉTAIL
  // ============================================================
  async list(q: BackupRestoresQueryDto, lang = 'fr') {
    const { page, limit, skip } = pageParams(q, 20, 100);
    const qb = this.restores.createQueryBuilder('r').orderBy('r.startedAt', 'DESC').skip(skip).take(limit);
    if (q.status) qb.andWhere('r.status = :status', { status: q.status });
    if (q.databaseId) qb.andWhere('(r.targetDatabaseId = :db OR r.sourceDatabaseId = :db)', { db: q.databaseId });
    const [rows, total] = await qb.getManyAndCount();
    return { message: this.t('list', lang), data: paginated(rows.map((r) => this.view(r)), total, page, limit, { running: [...this.live.values()].map((r) => this.view(r)) }) };
  }

  async findOne(id: string, lang = 'fr') {
    const live = this.live.get(id);
    if (live) return { message: this.t('detail', lang), data: this.view(live) };
    const r = await this.restores.findOne({ where: { id } });
    if (!r) throw new NotFoundException(this.t('not_found', lang));
    return { message: this.t('detail', lang), data: this.view(r) };
  }

  // ============================================================
  // LANCER UNE RESTAURATION
  // ============================================================
  async start(dto: StartRestoreDto, user: Actor, lang = 'fr', sourceType?: RestoreSource) {
    this.assertEnabled(lang);
    if (dto.confirm !== 'RESTAURER') throw new BadRequestException(this.t('confirm_word', lang));
    if ((!dto.fileName && !dto.sourceDatabaseId) || (dto.fileName && dto.sourceDatabaseId)) {
      throw new BadRequestException(this.t('source_required', lang));
    }

    // Archive des fichiers envoyés → UPLOAD_PATH
    if (dto.fileName?.endsWith('.tar.gz')) return this.startFiles(dto.fileName, user, lang);

    let full: string | null = null;
    let gz = false;
    let origin: BackupRun | null = null;
    if (dto.fileName) {
      full = this.backup.filePath(dto.fileName);
      const info = await this.analyzeFile(full, dto.fileName);
      if (!info.looksLikeSql) throw new BadRequestException(this.t('not_sql', lang));
      gz = info.compressed;
      origin = await this.runs.findOne({ where: { fileName: dto.fileName } }).catch(() => null);
    }

    const source = dto.sourceDatabaseId ? await this.backup.resolve(dto.sourceDatabaseId, lang) : null;
    if (source && !dto.databaseId && !dto.newDatabaseName) throw new BadRequestException(this.t('copy_target_required', lang));

    // Base cible : choisie, sinon base d'origine du fichier, sinon base par défaut
    const targetId = dto.databaseId ?? origin?.databaseId ?? null;
    const server = await this.backup.resolve(targetId, lang);
    const target: DbConn = dto.newDatabaseName
      ? { ...server, id: null, label: `${dto.newDatabaseName}@${server.host}`, database: dto.newDatabaseName, excludeTables: [] }
      : server;

    if ((dto.confirmDatabaseName ?? '').trim() !== target.database) {
      throw new BadRequestException(this.t('confirm_name', lang, { name: target.database }));
    }
    if (source && this.sameHost(source.host, target.host) && String(source.port) === String(target.port) && source.database === target.database) {
      throw new BadRequestException(this.t('same_source_target', lang));
    }

    const lockKey = dto.newDatabaseName ? `new:${target.host}:${target.port}:${target.database}` : target.id ?? 'app';
    if (this.backup.busy.has(lockKey) || this.locks.has(lockKey) || (source && this.locks.has(source.id ?? 'app'))) {
      throw new ConflictException(this.t('busy', lang));
    }

    let createDb = false;
    if (dto.newDatabaseName) {
      let state: { exists: boolean; tables: number };
      try {
        state = await this.serverDatabaseState(server, dto.newDatabaseName);
      } catch (e: any) {
        throw new BadRequestException(this.t('server_unreachable', lang, { error: e?.sqlMessage ?? e?.message }));
      }
      if (state.tables > 0) throw new BadRequestException(this.t('db_not_empty', lang, { name: dto.newDatabaseName, count: state.tables }));
      createDb = !state.exists;
      const registered = await this.databases.findOne({ where: { databaseName: dto.newDatabaseName } }).catch(() => null);
      if (registered && this.sameHost(this.backup.label(registered).split('@').pop() || '', target.host)) {
        throw new BadRequestException(this.t('db_already_registered', lang, { name: registered.name }));
      }
    }

    const isApp = this.isAppDatabase(target);
    const safety = !dto.newDatabaseName && (isApp || dto.safetyBackup !== false);

    const job = await this.restores.save(
      this.restores.create({
        kind: RestoreKind.DATABASE,
        sourceType: sourceType ?? (source ? RestoreSource.COPY : origin?.trigger === BackupTrigger.IMPORT ? RestoreSource.IMPORT : RestoreSource.FILE),
        fileName: dto.fileName ?? null,
        sourceDatabaseId: source?.id ?? null,
        sourceLabel: source?.label?.slice(0, 200) ?? (origin?.databaseLabel ?? null),
        targetDatabaseId: dto.newDatabaseName ? null : target.id,
        targetLabel: target.label.slice(0, 200),
        targetDatabaseName: target.database,
        createdDatabase: false,
        status: RestoreStatus.RUNNING,
        phase: RestorePhase.PREPARING,
        progress: 0,
        bytesTotal: full ? String(fs.statSync(full).size) : null,
        bytesDone: '0',
        createdById: user?.id ?? null,
        createdByName: user?.fullName ? String(user.fullName).slice(0, 150) : null,
      }),
    );
    this.locks.add(lockKey);
    if (source) this.locks.add(source.id ?? 'app');
    this.live.set(job.id, job);

    const ctx: RunCtx = {
      full,
      gz,
      source,
      target,
      server,
      safety,
      createDb,
      register: !!dto.newDatabaseName && dto.registerDatabase !== false,
      force: !!dto.continueOnError,
      lockKey,
      user,
    };
    void this.execute(job, ctx);

    return { message: this.t('started', lang, { target: target.label, id: job.id }), data: this.view(job) };
  }

  /** Exécution en arrière-plan */
  private async execute(job: BackupRestore, ctx: RunCtx) {
    const started = Date.now();
    let busyTaken = false;
    try {
      if (ctx.safety) {
        job.phase = RestorePhase.SAFETY_BACKUP;
        this.persistSoon(job, true);
        const run = await this.backup.runBackup({ trigger: BackupTrigger.BEFORE_RESTORE, userId: ctx.user?.id ?? null, databaseId: ctx.target.id });
        if (run.status !== BackupStatus.SUCCESS) throw new Error(`Sauvegarde de sécurité impossible (${run.error ?? run.status}) : restauration annulée, la base n'a pas été modifiée`);
        job.safetyBackupFile = run.fileName ?? null;
      }

      // Plus aucune sauvegarde de cette base pendant la restauration
      this.backup.busy.add(ctx.lockKey);
      busyTaken = true;

      if (ctx.createDb) {
        job.phase = RestorePhase.CREATING_DATABASE;
        this.persistSoon(job, true);
        await this.createDatabase(ctx.server, ctx.target.database, 'fr');
        job.createdDatabase = true;
      }

      job.phase = RestorePhase.RESTORING;
      this.persistSoon(job, true);
      if (ctx.full) await this.restoreFromFile(job, ctx);
      else await this.restoreFromCopy(job, ctx);

      if (ctx.register) {
        const registered = await this.registerDatabase(ctx).catch((e) => {
          this.logger.warn(`Base restaurée mais non enregistrée : ${e?.message}`);
          return null;
        });
        if (registered) {
          job.targetDatabaseId = registered.id;
          job.targetLabel = this.backup.label(registered);
        }
      }

      job.status = RestoreStatus.SUCCESS;
      job.progress = 100;
      this.logger.warn(`♻️ Base ${ctx.target.label} restaurée (${ctx.full ? job.fileName : `copie de ${ctx.source?.label}`}) par ${ctx.user?.fullName ?? ctx.user?.id}`);
    } catch (e: any) {
      job.status = RestoreStatus.FAILED;
      job.error = String(e?.message ?? e).slice(0, 4000);
      this.logger.error(`Restauration ${job.id} échouée : ${job.error}`);
    } finally {
      if (busyTaken) this.backup.busy.delete(ctx.lockKey);
      this.locks.delete(ctx.lockKey);
      if (ctx.source) this.locks.delete(ctx.source.id ?? 'app');
      job.phase = RestorePhase.DONE;
      job.durationMs = Date.now() - started;
      job.finishedAt = new Date();
      // save() recrée la ligne si la table a été remplacée par la restauration
      await this.restores.save(job).catch((e) => this.logger.warn(`Historique de restauration non enregistré : ${e?.message}`));
      this.lastPersist.delete(job.id);
      setTimeout(() => this.live.delete(job.id), 60_000).unref?.();
      this.audit?.record({
        userId: ctx.user?.id ?? null,
        userName: ctx.user?.fullName ?? null,
        action: ActionType.RESTORE,
        entity: 'backup_restores',
        entityId: job.id,
        category: AuditCategory.ADMIN,
        severity: AuditSeverity.CRITICAL,
        status: job.status === RestoreStatus.SUCCESS ? AuditStatus.SUCCESS : AuditStatus.FAILURE,
        errorMessage: job.error ?? null,
        durationMs: job.durationMs,
        metadata: {
          kind: job.kind,
          sourceType: job.sourceType,
          fileName: job.fileName,
          source: job.sourceLabel,
          target: job.targetLabel,
          createdDatabase: job.createdDatabase,
          safetyBackup: job.safetyBackupFile,
        },
      });
    }
  }

  /** Lance le client mysql et y envoie le flux SQL */
  private async runMysql(target: DbConn, streams: (Readable | Transform)[], force: boolean): Promise<void> {
    const bin = this.findBin(this.backup.mysqlCandidates());
    if (!bin) throw new Error(this.t('client_missing'));
    const extra = String(process.env.BACKUP_MYSQL_ARGS ?? '--default-character-set=utf8mb4 --max-allowed-packet=1073741824')
      .split(/\s+/)
      .filter(Boolean);
    const args = ['-h', target.host, '-P', String(target.port), '-u', target.user, ...extra, ...(force ? ['--force'] : []), target.database];
    const child = spawn(bin, args, { env: { ...process.env, MYSQL_PWD: String(target.password ?? '') }, windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (c) => {
      if (stderr.length < 8000) stderr += c.toString();
    });
    const closed = new Promise<number>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) => resolve(code ?? 1));
    });
    const piped = (pipeline as any)(...streams, new StripDatabaseSwitch(), child.stdin).then(
      () => null,
      (e: any) => e,
    );
    const [code, pipeErr] = await Promise.all([closed, piped]);
    if (code !== 0) throw new Error(`mysql a échoué (code ${code}) : ${this.backup.cleanStderr(stderr) || pipeErr?.message || ''}`);
    if (pipeErr) throw new Error(`Lecture du fichier interrompue (${pipeErr.message}) : la base peut être incomplète, restaurez la sauvegarde de sécurité`);
  }

  private async restoreFromFile(job: BackupRestore, ctx: RunCtx) {
    const total = Number(job.bytesTotal ?? 0) || 1;
    let done = 0;
    const counter = new ByteCounter((n) => {
      done += n;
      job.bytesDone = String(done);
      job.progress = Math.min(99, Math.floor((done * 100) / total));
      this.persistSoon(job);
    });
    const input = fs.createReadStream(ctx.full!, { highWaterMark: 1024 * 1024 });
    const streams: (Readable | Transform)[] = [input, counter];
    if (ctx.gz) streams.push(zlib.createGunzip());
    await this.runMysql(ctx.target, streams, ctx.force);
  }

  /** Copie directe : mysqldump (source) → mysql (cible) */
  private async restoreFromCopy(job: BackupRestore, ctx: RunCtx) {
    const source = ctx.source!;
    const bin = this.findBin(this.backup.dumpCandidates());
    if (!bin) throw new Error(this.t('dump_missing'));
    const dump = spawn(bin, this.backup.dumpArgs(source), { env: { ...process.env, MYSQL_PWD: String(source.password ?? '') }, windowsHide: true });
    let dumpErr = '';
    dump.stderr.on('data', (c) => {
      if (dumpErr.length < 8000) dumpErr += c.toString();
    });
    const dumpClosed = new Promise<number>((resolve, reject) => {
      dump.on('error', reject);
      dump.on('close', (code) => resolve(code ?? 1));
    });
    let done = 0;
    const counter = new ByteCounter((n) => {
      done += n;
      job.bytesDone = String(done);
      this.persistSoon(job);
    });
    const [, code] = await Promise.all([this.runMysql(ctx.target, [dump.stdout, counter], ctx.force), dumpClosed]);
    if (code !== 0) throw new Error(`mysqldump a échoué (code ${code}) : ${this.backup.cleanStderr(dumpErr)} — la base cible peut être incomplète`);
  }

  /** Nouvelle base : ajoutée à la liste des bases sauvegardées (mêmes identifiants que le serveur cible) */
  private async registerDatabase(ctx: RunCtx): Promise<BackupDatabase> {
    const serverRow = ctx.server.id
      ? await this.databases.createQueryBuilder('d').addSelect('d.passwordEnc').where('d.id = :id', { id: ctx.server.id }).getOne()
      : null;
    const useApp = serverRow ? serverRow.useAppCredentials : true;
    let passwordEnc: string | null = null;
    if (!useApp && serverRow?.passwordEnc) {
      try {
        passwordEnc = encryptSecret(decryptSecret(serverRow.passwordEnc));
      } catch {
        passwordEnc = serverRow.passwordEnc;
      }
    }
    return this.databases.save(
      this.databases.create({
        name: `Restaurée — ${ctx.target.database}`.slice(0, 120),
        description: `Créée par restauration le ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
        useAppCredentials: useApp,
        host: useApp ? null : serverRow?.host ?? ctx.server.host,
        port: useApp ? null : serverRow?.port ?? Number(ctx.server.port),
        username: useApp ? null : serverRow?.username ?? ctx.server.user,
        passwordEnc,
        databaseName: ctx.target.database,
        isDefault: false,
        isActive: true,
        createdById: ctx.user?.id ?? null,
      } as Partial<BackupDatabase>),
    );
  }

  // ============================================================
  // ARCHIVE DES FICHIERS (.tar.gz) → UPLOAD_PATH
  // ============================================================
  private async startFiles(fileName: string, user: Actor, lang: string) {
    const full = this.backup.filePath(fileName);
    const uploads = process.env.UPLOAD_PATH?.trim();
    if (!uploads || !fs.existsSync(uploads)) throw new BadRequestException(this.t('upload_path_missing', lang));
    if (this.locks.has('files')) throw new ConflictException(this.t('busy', lang));
    const tar = this.findBin(['tar']);
    if (!tar) throw new BadRequestException(this.t('tar_missing', lang));

    const job = await this.restores.save(
      this.restores.create({
        kind: RestoreKind.FILES,
        sourceType: RestoreSource.FILE,
        fileName,
        targetLabel: uploads.slice(0, 200),
        status: RestoreStatus.RUNNING,
        phase: RestorePhase.RESTORING,
        progress: 0,
        bytesTotal: String(fs.statSync(full).size),
        bytesDone: '0',
        createdById: user?.id ?? null,
        createdByName: user?.fullName ? String(user.fullName).slice(0, 150) : null,
      }),
    );
    this.locks.add('files');
    this.live.set(job.id, job);

    void (async () => {
      const started = Date.now();
      try {
        const total = Number(job.bytesTotal) || 1;
        let done = 0;
        const counter = new ByteCounter((n) => {
          done += n;
          job.bytesDone = String(done);
          job.progress = Math.min(99, Math.floor((done * 100) / total));
          this.persistSoon(job);
        });
        // L'archive contient le dossier « favor-storage/… » : --strip-components=1 l'extrait dans UPLOAD_PATH
        const child = spawn(tar, ['-xzf', '-', '-C', path.resolve(uploads), '--strip-components=1', '--no-same-owner'], { windowsHide: true });
        let stderr = '';
        child.stderr.on('data', (c) => {
          if (stderr.length < 4000) stderr += c.toString();
        });
        const closed = new Promise<number>((resolve, reject) => {
          child.on('error', reject);
          child.on('close', (code) => resolve(code ?? 1));
        });
        const piped = pipeline(fs.createReadStream(full), counter, child.stdin).then(
          () => null,
          (e: any) => e,
        );
        const [code, pipeErr] = await Promise.all([closed, piped]);
        if (code !== 0) throw new Error(`tar a échoué (code ${code}) : ${stderr.trim() || pipeErr?.message || ''}`);
        job.status = RestoreStatus.SUCCESS;
        job.progress = 100;
      } catch (e: any) {
        job.status = RestoreStatus.FAILED;
        job.error = String(e?.message ?? e).slice(0, 4000);
      } finally {
        this.locks.delete('files');
        job.phase = RestorePhase.DONE;
        job.durationMs = Date.now() - started;
        job.finishedAt = new Date();
        await this.restores.save(job).catch(() => undefined);
        setTimeout(() => this.live.delete(job.id), 60_000).unref?.();
        this.audit?.record({
          userId: user?.id ?? null,
          userName: user?.fullName ?? null,
          action: ActionType.RESTORE,
          entity: 'backup_restores',
          entityId: job.id,
          category: AuditCategory.ADMIN,
          severity: AuditSeverity.CRITICAL,
          status: job.status === RestoreStatus.SUCCESS ? AuditStatus.SUCCESS : AuditStatus.FAILURE,
          errorMessage: job.error ?? null,
          metadata: { kind: job.kind, fileName, target: uploads },
        });
      }
    })();

    return { message: this.t('files_started', lang, { target: uploads, id: job.id }), data: this.view(job) };
  }

  // ============================================================
  // IMPORT D'UN FICHIER (.sql / .sql.gz)
  // ============================================================
  async importFile(file: Express.Multer.File | undefined, dto: ImportBackupDto, user: Actor, lang = 'fr') {
    if (!file?.path) throw new BadRequestException(this.t('import_required', lang));
    try {
      if (dto.restore) {
        this.assertEnabled(lang);
        if (dto.confirm !== 'RESTAURER') throw new BadRequestException(this.t('confirm_word', lang));
      }
      const original = String(file.originalname || 'base.sql');
      if (!/\.(sql|sql\.gz|gz)$/i.test(original)) throw new BadRequestException(this.t('import_ext', lang));
      const gz = await this.isGzip(file.path);
      if (/\.gz$/i.test(original) && !gz) throw new BadRequestException(this.t('not_sql', lang));
      const info = await this.analyzeFile(file.path, original);
      if (!info.looksLikeSql) throw new BadRequestException(this.t('not_sql', lang));

      let label = `Importé : ${original}`;
      if (dto.databaseId) {
        const d = await this.databases.findOne({ where: { id: dto.databaseId } });
        if (!d) throw new NotFoundException(this.t('database_not_found', lang));
        label = this.backup.label(d);
      }
      const base =
        original
          .replace(/\.(sql\.gz|sql|gz)$/i, '')
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/[^A-Za-z0-9_-]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 60) || 'base';
      const finalName = `import_${base}_${this.backup.fileStamp(new Date())}${gz ? '.sql.gz' : '.sql'}`;
      fs.mkdirSync(this.backup.dir, { recursive: true });
      await fs.promises.rename(file.path, path.join(this.backup.dir, finalName));

      const run = await this.runs.save(
        this.runs.create({
          trigger: BackupTrigger.IMPORT,
          databaseId: dto.databaseId ?? null,
          databaseLabel: label.slice(0, 200),
          status: BackupStatus.SUCCESS,
          fileName: finalName,
          sizeBytes: String(info.sizeBytes),
          deleted: false,
          durationMs: 0,
          createdById: user?.id ?? null,
          finishedAt: new Date(),
        }),
      );

      const data: Record<string, any> = { fileName: finalName, originalName: original, run, info: { ...info, fileName: finalName } };
      let message = this.t('imported', lang, { fileName: finalName, size: info.size });
      if (dto.restore) {
        try {
          const r = await this.start(
            {
              fileName: finalName,
              databaseId: dto.targetDatabaseId,
              newDatabaseName: dto.newDatabaseName,
              registerDatabase: dto.registerDatabase,
              safetyBackup: dto.safetyBackup,
              continueOnError: dto.continueOnError,
              confirm: dto.confirm!,
              confirmDatabaseName: dto.confirmDatabaseName,
            },
            user,
            lang,
            RestoreSource.IMPORT,
          );
          data.restore = r.data;
          message = `${message} ${r.message}`;
        } catch (e: any) {
          // Le fichier reste importé : la restauration pourra être relancée
          data.restoreError = e?.response?.message ?? e?.message;
          message = `${message} ${this.t('import_restore_failed', lang, { error: data.restoreError })}`;
        }
      }
      return { message, data };
    } finally {
      if (file.path && fs.existsSync(file.path)) fs.rmSync(file.path, { force: true });
    }
  }
}
