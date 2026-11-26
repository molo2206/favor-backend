// src/storage-admin/file-manager.service.ts
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional, StreamableFile } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { In, LessThan, Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { I18nService } from 'src/libs/common/src';
import { paginated, pageParams } from 'src/common/pagination/paginate.util';
import { FileTrash } from './file-trash.entity';
import { FileReferencesService, fileStem } from './file-references.service';
import {
  StorageRoot,
  assertWritable,
  freeName,
  getRoot,
  human,
  kindOf,
  mimeOf,
  moveAny,
  publicUrl,
  resolveIn,
  safeName,
  storageRoots,
  trashRoot,
} from './storage-roots';
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
} from './file-manager.dto';

type Actor = { id?: string | null; fullName?: string | null };
type WalkEntry = { rel: string; size: number; mtimeMs: number };
type OrphanEntry = { path: string; size: number; modifiedAt: Date; kind: string; url: string | null };

/**
 * ✅ Fichiers jamais considérés comme orphelins :
 *  - dossiers techniques et dossiers de fichiers STATIQUES (icônes, images par défaut, assets de l'app…),
 *    à n'importe quel niveau : static/, assets/, icons/, default/… (FILE_ORPHAN_STATIC_DIRS pour en ajouter)
 *  - chemins précis à garder : FILE_ORPHAN_EXCLUDE="banners,promo/2026,logo.png"
 *  - fichiers statiques par nom : favicon, robots.txt, manifest, logo*, placeholder*, default*, no-image*…
 */
const ORPHAN_TECH_DIRS = ['.well-known', 'tmp', 'temp', '.incoming', '.trash'];
const ORPHAN_STATIC_DIRS = ['static', 'statics', 'assets', 'asset', 'icons', 'icon', 'default', 'defaults', 'public', 'fonts', 'templates', 'emails', 'email', 'img', 'placeholders'];
const STATIC_FILE = /^(favicon[^/]*|robots\.txt|sitemap[^/]*\.xml|manifest[^/]*|apple-touch-icon[^/]*|logo[^/]*|placeholder[^/]*|default[^/]*|no[-_]?image[^/]*|avatar[-_]?default[^/]*|\.htaccess|index\.html?)$/i;

function orphanExclusions() {
  const dirs = new Set(
    [...ORPHAN_TECH_DIRS, ...ORPHAN_STATIC_DIRS, ...String(process.env.FILE_ORPHAN_STATIC_DIRS || '').split(',')]
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  );
  const paths = String(process.env.FILE_ORPHAN_EXCLUDE || '')
    .split(',')
    .map((p) => p.trim().replace(/^\/+|\/+$/g, ''))
    .filter(Boolean);
  return { dirs, paths };
}

/** Fichier statique / technique : ignoré par la recherche d'orphelins */
function isStaticFile(rel: string, ex = orphanExclusions()): boolean {
  const parts = rel.split('/');
  const name = parts[parts.length - 1];
  if (parts.slice(0, -1).some((p) => ex.dirs.has(p.toLowerCase()))) return true;
  if (ex.paths.some((p) => rel === p || rel.startsWith(`${p}/`))) return true;
  return STATIC_FILE.test(name);
}

/**
 * ✅ GESTIONNAIRE DE FICHIERS DU SERVEUR (super admin)
 *  Parcourir, rechercher, voir, télécharger, envoyer, créer des dossiers, renommer, déplacer, copier,
 *  supprimer (corbeille restaurable), statistiques d'espace, fichiers orphelins.
 *  Protection : un fichier encore utilisé en base n'est ni supprimé, ni renommé, ni déplacé sans force=true.
 */
@Injectable()
export class FileManagerService {
  private readonly logger = new Logger(FileManagerService.name);
  private statsCache = new Map<string, { at: number; data: any }>();
  private statsRunning = new Set<string>();
  private orphanScan: {
    rootId: string;
    status: 'RUNNING' | 'DONE' | 'FAILED';
    startedAt: Date;
    finishedAt?: Date;
    scanned: number;
    staticSkipped: number;
    olderThanDays: number;
    items: OrphanEntry[];
    totalSize: number;
    truncated: boolean;
    error?: string;
  } | null = null;

  constructor(
    @InjectRepository(FileTrash) private readonly trash: Repository<FileTrash>,
    private readonly refs: FileReferencesService,
    @Optional() private readonly i18n?: I18nService,
  ) {}

  private t(key: string, lang = 'fr', params?: Record<string, any>): string {
    try {
      return this.i18n ? this.i18n.translate(`storage_admin.${key}`, lang, params) : key;
    } catch {
      return key;
    }
  }

  private get trashDays(): number {
    const n = Number(process.env.FILE_TRASH_DAYS ?? 30);
    return Number.isFinite(n) && n >= 1 ? n : 30;
  }

  private checksReferences(root: StorageRoot): boolean {
    return root.id === 'storage' || root.id === 'legacy';
  }

  // ============================================================
  // PARCOURS
  // ============================================================
  async roots(lang = 'fr') {
    const data = await Promise.all(
      storageRoots().map(async (r) => {
        const exists = fs.existsSync(r.path);
        let disk: any = null;
        if (exists) {
          try {
            const s: any = await (fs.promises as any).statfs(r.path);
            const total = Number(s.blocks) * Number(s.bsize);
            const free = Number(s.bavail) * Number(s.bsize);
            disk = { total, free, used: total - free, totalHuman: human(total), freeHuman: human(free), usedPercent: total ? Math.round(((total - free) * 100) / total) : null };
          } catch {
            disk = null;
          }
        }
        return { id: r.id, label: r.label, path: r.path, writable: r.writable, public: !!r.publicBase, exists, disk, stats: this.statsCache.get(r.id)?.data ?? null };
      }),
    );
    return { message: this.t('roots', lang), data };
  }

  private entryView(root: StorageRoot, rel: string, name: string, st: fs.Stats) {
    const isDir = st.isDirectory();
    return {
      name,
      path: rel,
      type: isDir ? 'dir' : 'file',
      kind: isDir ? 'dir' : kindOf(name),
      mimeType: isDir ? null : mimeOf(name),
      sizeBytes: isDir ? null : st.size,
      size: isDir ? null : human(st.size),
      modifiedAt: st.mtime,
      url: isDir ? null : publicUrl(root, rel),
    };
  }

  async list(q: FmListQueryDto, lang = 'fr') {
    const root = getRoot(q.root);
    const { abs, rel } = resolveIn(root, q.path);
    if (!fs.existsSync(abs)) throw new NotFoundException(this.t('not_found', lang));
    if (!fs.statSync(abs).isDirectory()) throw new BadRequestException(this.t('not_a_folder', lang));

    let dirents = await fs.promises.readdir(abs, { withFileTypes: true });
    const search = (q.search ?? '').trim().toLowerCase();
    if (search) dirents = dirents.filter((d) => d.name.toLowerCase().includes(search));
    if (q.kind) dirents = dirents.filter((d) => (q.kind === 'dir' ? d.isDirectory() : !d.isDirectory() && kindOf(d.name) === q.kind));

    const sort = q.sort ?? 'name';
    const dir = q.order === 'desc' ? -1 : 1;
    const { page, limit, skip } = pageParams(q, 100, 500);
    let selected: { d: fs.Dirent; st: fs.Stats | null }[];
    const counts = { dirs: dirents.filter((d) => d.isDirectory()).length, files: dirents.filter((d) => !d.isDirectory()).length };

    if (sort === 'name') {
      // Tri par nom : dossiers d'abord, puis seulement la page demandée est lue sur le disque
      dirents.sort((a, b) => (a.isDirectory() !== b.isDirectory() ? (a.isDirectory() ? -1 : 1) : a.name.localeCompare(b.name, 'fr', { numeric: true }) * dir));
      selected = await Promise.all(dirents.slice(skip, skip + limit).map(async (d) => ({ d, st: await fs.promises.lstat(path.join(abs, d.name)).catch(() => null) })));
    } else {
      const all = await Promise.all(dirents.map(async (d) => ({ d, st: await fs.promises.lstat(path.join(abs, d.name)).catch(() => null) })));
      all.sort((a, b) => {
        if (a.d.isDirectory() !== b.d.isDirectory()) return a.d.isDirectory() ? -1 : 1;
        const va = sort === 'size' ? a.st?.size ?? 0 : a.st?.mtimeMs ?? 0;
        const vb = sort === 'size' ? b.st?.size ?? 0 : b.st?.mtimeMs ?? 0;
        return (va - vb) * dir;
      });
      selected = all.slice(skip, skip + limit);
    }

    const rows = selected.filter((x) => x.st).map((x) => this.entryView(root, rel ? `${rel}/${x.d.name}` : x.d.name, x.d.name, x.st!));
    const parts = rel ? rel.split('/') : [];
    return {
      message: this.t('list', lang),
      data: paginated(rows, dirents.length, page, limit, {
        root: { id: root.id, label: root.label, writable: root.writable },
        path: rel,
        parent: parts.length ? parts.slice(0, -1).join('/') : null,
        breadcrumb: [{ name: root.label, path: '' }, ...parts.map((p, i) => ({ name: p, path: parts.slice(0, i + 1).join('/') }))],
        counts,
      }),
    };
  }

  /** Parcours récursif (sans suivre les liens symboliques) */
  private async *walk(base: string, rel = '', stopAt = Infinity, counter = { n: 0 }): AsyncGenerator<WalkEntry> {
    let dir: fs.Dir;
    try {
      dir = await fs.promises.opendir(path.join(base, rel));
    } catch {
      return;
    }
    for await (const d of dir) {
      if (counter.n >= stopAt) return;
      const childRel = rel ? `${rel}/${d.name}` : d.name;
      if (d.isSymbolicLink()) continue;
      if (d.isDirectory()) {
        yield* this.walk(base, childRel, stopAt, counter);
      } else if (d.isFile()) {
        counter.n++;
        try {
          const st = await fs.promises.stat(path.join(base, childRel));
          yield { rel: childRel, size: st.size, mtimeMs: st.mtimeMs };
        } catch {
          /* supprimé entre-temps */
        }
      }
    }
  }

  async search(q: FmSearchQueryDto, lang = 'fr') {
    const root = getRoot(q.root);
    const { abs, rel } = resolveIn(root, q.path);
    const term = q.q.trim().toLowerCase();
    if (term.length < 2) throw new BadRequestException(this.t('search_too_short', lang));
    const limit = Math.min(500, q.limit ?? 100);
    const minSize = (q.minSizeMb ?? 0) * 1024 * 1024;
    const out: any[] = [];
    let scanned = 0;
    const maxScan = Number(process.env.FILE_MANAGER_SEARCH_MAX ?? 300000);
    for await (const e of this.walk(abs, '', maxScan)) {
      scanned++;
      const name = path.basename(e.rel);
      if (!name.toLowerCase().includes(term)) continue;
      if (q.kind && kindOf(name) !== q.kind) continue;
      if (e.size < minSize) continue;
      const full = rel ? `${rel}/${e.rel}` : e.rel;
      out.push({ name, path: full, type: 'file', kind: kindOf(name), mimeType: mimeOf(name), sizeBytes: e.size, size: human(e.size), modifiedAt: new Date(e.mtimeMs), url: publicUrl(root, full) });
      if (out.length >= limit) break;
    }
    return { message: this.t('search', lang, { count: out.length }), data: { items: out, scanned, truncated: out.length >= limit || scanned >= maxScan } };
  }

  async info(q: FmPathQueryDto, lang = 'fr') {
    const root = getRoot(q.root);
    const { abs, rel } = resolveIn(root, q.path);
    const st = await fs.promises.lstat(abs).catch(() => null);
    if (!st) throw new NotFoundException(this.t('not_found', lang));
    const view: any = this.entryView(root, rel, path.basename(abs) || root.label, st);
    view.createdAt = st.birthtime;
    if (st.isDirectory()) {
      let files = 0;
      let size = 0;
      for await (const e of this.walk(abs, '', 200000)) {
        files++;
        size += e.size;
      }
      view.filesCount = files;
      view.totalSizeBytes = size;
      view.totalSize = human(size);
    } else if (this.checksReferences(root)) {
      view.usedIn = await this.refs.whereUsed(rel);
      view.isUsed = view.usedIn.length > 0;
    }
    return { message: this.t('info', lang), data: view };
  }

  async download(q: FmDownloadQueryDto, lang = 'fr'): Promise<StreamableFile> {
    const root = getRoot(q.root);
    const { abs } = resolveIn(root, q.path);
    const st = await fs.promises.stat(abs).catch(() => null);
    if (!st || !st.isFile()) throw new NotFoundException(this.t('not_found', lang));
    const name = path.basename(abs);
    return new StreamableFile(fs.createReadStream(abs), {
      type: mimeOf(name),
      length: st.size,
      disposition: `${q.inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    });
  }

  // ============================================================
  // MODIFICATIONS
  // ============================================================
  async upload(files: Express.Multer.File[] | undefined, dto: FmUploadDto, lang = 'fr') {
    const root = getRoot(dto.root);
    assertWritable(root);
    const { abs, rel } = resolveIn(root, dto.path);
    try {
      if (!files?.length) throw new BadRequestException(this.t('files_required', lang));
      await fs.promises.mkdir(abs, { recursive: true });
      const saved: any[] = [];
      for (const f of files) {
        const original = safeName(Buffer.from(f.originalname || 'fichier', 'latin1').toString('utf8'));
        const name = dto.overwrite ? original : freeName(abs, original);
        const target = path.join(abs, name);
        await moveAny(f.path, target);
        const st = await fs.promises.stat(target);
        const fileRel = rel ? `${rel}/${name}` : name;
        saved.push(this.entryView(root, fileRel, name, st));
      }
      this.statsCache.delete(root.id);
      return { message: this.t('uploaded', lang, { count: saved.length }), data: saved };
    } finally {
      for (const f of files ?? []) if (f?.path && fs.existsSync(f.path)) fs.rmSync(f.path, { force: true });
    }
  }

  async createFolder(dto: FmCreateFolderDto, lang = 'fr') {
    const root = getRoot(dto.root);
    assertWritable(root);
    const { abs, rel } = resolveIn(root, dto.path);
    const name = safeName(dto.name);
    const target = path.join(abs, name);
    if (fs.existsSync(target)) throw new ConflictException(this.t('exists', lang, { name }));
    await fs.promises.mkdir(target, { recursive: true });
    const r = rel ? `${rel}/${name}` : name;
    return { message: this.t('folder_created', lang, { name }), data: this.entryView(root, r, name, fs.statSync(target)) };
  }

  /** Refuse de toucher un fichier encore utilisé en base (liens cassés) */
  private async assertUnused(root: StorageRoot, abs: string, rel: string, force: boolean | undefined, lang: string) {
    if (force || !this.checksReferences(root)) return;
    const st = await fs.promises.lstat(abs).catch(() => null);
    if (!st) return;
    if (st.isFile()) {
      if (await this.refs.isUsed(rel)) {
        const where = await this.refs.whereUsed(rel);
        throw new ConflictException({
          message: this.t('in_use', lang, { name: path.basename(rel), where: where.map((w) => `${w.table}.${w.column}`).join(', ') || '?' }),
          usedIn: where,
        });
      }
      return;
    }
    if (st.isDirectory()) {
      const used: string[] = [];
      for await (const e of this.walk(abs, '', 100000)) {
        if (await this.refs.isUsed(e.rel)) used.push(e.rel);
        if (used.length >= 20) break;
      }
      if (used.length) throw new ConflictException({ message: this.t('folder_in_use', lang, { count: used.length }), usedFiles: used });
    }
  }

  async rename(dto: FmRenameDto, lang = 'fr') {
    const root = getRoot(dto.root);
    assertWritable(root);
    const { abs, rel } = resolveIn(root, dto.path);
    if (!rel) throw new BadRequestException(this.t('root_protected', lang));
    if (!fs.existsSync(abs)) throw new NotFoundException(this.t('not_found', lang));
    const name = safeName(dto.newName);
    const target = path.join(path.dirname(abs), name);
    if (target === abs) return { message: this.t('renamed', lang, { name }), data: null };
    if (fs.existsSync(target)) throw new ConflictException(this.t('exists', lang, { name }));
    await this.assertUnused(root, abs, rel, dto.force, lang);
    await fs.promises.rename(abs, target);
    this.refs.invalidate();
    const newRel = [...rel.split('/').slice(0, -1), name].join('/');
    return { message: this.t('renamed', lang, { name }), data: this.entryView(root, newRel, name, fs.statSync(target)) };
  }

  async move(dto: FmMoveDto, lang = 'fr') {
    const root = getRoot(dto.root);
    const destRoot = getRoot(dto.destinationRoot ?? root.id);
    assertWritable(destRoot);
    if (!dto.copy) assertWritable(root);
    const dest = resolveIn(destRoot, dto.destination);
    await fs.promises.mkdir(dest.abs, { recursive: true });
    const done: string[] = [];
    const failed: { path: string; error: string }[] = [];
    for (const p of dto.paths) {
      try {
        const src = resolveIn(root, p);
        if (!src.rel) throw new BadRequestException(this.t('root_protected', lang));
        if (!fs.existsSync(src.abs)) throw new NotFoundException(this.t('not_found', lang));
        if (dest.abs === src.abs || dest.abs.startsWith(src.abs + path.sep)) throw new BadRequestException(this.t('move_into_itself', lang));
        if (!dto.copy) await this.assertUnused(root, src.abs, src.rel, dto.force, lang);
        const name = freeName(dest.abs, path.basename(src.abs));
        const target = path.join(dest.abs, name);
        if (dto.copy) await fs.promises.cp(src.abs, target, { recursive: true, errorOnExist: true, force: false });
        else await moveAny(src.abs, target);
        done.push(dest.rel ? `${dest.rel}/${name}` : name);
      } catch (e: any) {
        failed.push({ path: p, error: e?.response?.message ?? e?.message });
      }
    }
    this.statsCache.delete(root.id);
    this.statsCache.delete(destRoot.id);
    this.refs.invalidate();
    return { message: this.t(dto.copy ? 'copied' : 'moved', lang, { count: done.length, failed: failed.length }), data: { done, failed } };
  }

  // ============================================================
  // CORBEILLE
  // ============================================================
  private async sizeOf(abs: string): Promise<{ size: number; dir: boolean }> {
    const st = await fs.promises.lstat(abs);
    if (!st.isDirectory()) return { size: st.size, dir: false };
    let size = 0;
    for await (const e of this.walk(abs, '', 500000)) size += e.size;
    return { size, dir: true };
  }

  /** Met un fichier / dossier à la corbeille (ou le supprime définitivement) */
  async toTrash(
    root: StorageRoot,
    rel: string,
    opts: { reason: string; context?: string | null; user?: Actor | null; permanent?: boolean },
  ): Promise<{ path: string; sizeBytes: number; trashId: string | null } | null> {
    const { abs } = resolveIn(root, rel);
    if (!fs.existsSync(abs)) return null;
    const { size, dir } = await this.sizeOf(abs);
    if (opts.permanent) {
      await fs.promises.rm(abs, { recursive: true, force: true });
      return { path: rel, sizeBytes: size, trashId: null };
    }
    const id = randomUUID();
    const trashRel = `${new Date().toISOString().slice(0, 10)}/${id}/${path.basename(abs)}`;
    await moveAny(abs, path.join(trashRoot(), trashRel));
    await this.trash.save(
      this.trash.create({
        id,
        rootId: root.id,
        originalPath: rel.slice(0, 700),
        trashPath: trashRel.slice(0, 700),
        isDirectory: dir,
        sizeBytes: String(size),
        reason: opts.reason,
        context: opts.context ? String(opts.context).slice(0, 300) : null,
        deletedById: opts.user?.id ?? null,
        deletedByName: opts.user?.fullName ? String(opts.user.fullName).slice(0, 150) : null,
        expiresAt: new Date(Date.now() + this.trashDays * 86400000),
      }),
    );
    return { path: rel, sizeBytes: size, trashId: id };
  }

  /** Miniatures liées (« nom_thumb.webp / .jpg ») */
  thumbnailsOf(rel: string): string[] {
    if (/_thumb\.[a-z0-9]+$/i.test(rel)) return [];
    const base = rel.replace(/\.[^./]+$/, '');
    return [`${base}_thumb.webp`, `${base}_thumb.jpg`];
  }

  async remove(dto: FmDeleteDto, user: Actor, lang = 'fr') {
    const root = getRoot(dto.root);
    assertWritable(root);
    const done: any[] = [];
    const failed: { path: string; error: string; usedIn?: any }[] = [];
    for (const p of dto.paths) {
      try {
        const { abs, rel } = resolveIn(root, p);
        if (!rel) throw new BadRequestException(this.t('root_protected', lang));
        if (!fs.existsSync(abs)) throw new NotFoundException(this.t('not_found', lang));
        await this.assertUnused(root, abs, rel, dto.force, lang);
        const isFile = fs.lstatSync(abs).isFile();
        const r = await this.toTrash(root, rel, { reason: 'MANUAL', user, permanent: dto.permanent });
        if (r) done.push(r);
        if (isFile) {
          for (const th of this.thumbnailsOf(rel)) {
            const t = await this.toTrash(root, th, { reason: 'MANUAL', context: `Miniature de ${rel}`, user, permanent: dto.permanent }).catch(() => null);
            if (t) done.push(t);
          }
        }
      } catch (e: any) {
        failed.push({ path: p, error: e?.response?.message ?? e?.message, usedIn: e?.response?.usedIn ?? e?.response?.usedFiles });
      }
    }
    this.statsCache.delete(root.id);
    const freed = done.reduce((n, d) => n + d.sizeBytes, 0);
    return {
      message: this.t(dto.permanent ? 'deleted_permanent' : 'deleted_trash', lang, { count: done.length, size: human(freed), failed: failed.length }),
      data: { done, failed, freedBytes: freed, freed: human(freed) },
    };
  }

  async listTrash(q: FmTrashQueryDto, lang = 'fr') {
    const { page, limit, skip } = pageParams(q, 50, 200);
    const qb = this.trash.createQueryBuilder('t').orderBy('t.createdAt', 'DESC').skip(skip).take(limit);
    if (q.root) qb.andWhere('t.rootId = :root', { root: q.root });
    if (q.reason) qb.andWhere('t.reason = :reason', { reason: q.reason });
    if (q.search?.trim()) qb.andWhere('(t.originalPath LIKE :s OR t.context LIKE :s)', { s: `%${q.search.trim()}%` });
    const [rows, total] = await qb.getManyAndCount();
    const sum: any[] = await this.trash.query('SELECT COUNT(*) AS n, COALESCE(SUM(`sizeBytes`), 0) AS s FROM `file_trash`');
    const totalBytes = Number(sum?.[0]?.s ?? 0);
    return {
      message: this.t('trash', lang),
      data: paginated(
        rows.map((r) => ({ ...r, size: human(Number(r.sizeBytes)), kind: r.isDirectory ? 'dir' : kindOf(r.originalPath), previewable: !r.isDirectory && kindOf(r.originalPath) === 'image' })),
        total,
        page,
        limit,
        { totalItems: Number(sum?.[0]?.n ?? 0), totalBytes, totalSize: human(totalBytes), retentionDays: this.trashDays },
      ),
    };
  }

  async trashFile(id: string, inline = true, lang = 'fr'): Promise<StreamableFile> {
    const t = await this.trash.findOne({ where: { id } });
    if (!t || t.isDirectory) throw new NotFoundException(this.t('not_found', lang));
    const abs = path.join(trashRoot(), t.trashPath);
    if (!abs.startsWith(trashRoot() + path.sep) || !fs.existsSync(abs)) throw new NotFoundException(this.t('not_found', lang));
    const name = path.basename(abs);
    return new StreamableFile(fs.createReadStream(abs), { type: mimeOf(name), disposition: `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(name)}"` });
  }

  async restore(dto: FmTrashIdsDto, lang = 'fr') {
    const rows = await this.trash.find({ where: { id: In(dto.ids) } });
    const done: string[] = [];
    const failed: { id: string; error: string }[] = [];
    for (const t of rows) {
      try {
        const root = getRoot(t.rootId);
        const src = path.join(trashRoot(), t.trashPath);
        if (!fs.existsSync(src)) throw new Error(this.t('trash_file_missing', lang));
        const { abs } = resolveIn(root, t.originalPath);
        if (fs.existsSync(abs)) {
          if (!dto.overwrite) throw new Error(this.t('exists', lang, { name: t.originalPath }));
          await fs.promises.rm(abs, { recursive: true, force: true });
        }
        await moveAny(src, abs);
        await fs.promises.rm(path.dirname(src), { recursive: true, force: true }).catch(() => undefined);
        await this.trash.delete({ id: t.id });
        done.push(t.originalPath);
        this.statsCache.delete(root.id);
      } catch (e: any) {
        failed.push({ id: t.id, error: e?.message });
      }
    }
    this.refs.invalidate();
    return { message: this.t('restored', lang, { count: done.length, failed: failed.length }), data: { done, failed } };
  }

  async emptyTrash(dto: FmEmptyTrashDto, lang = 'fr') {
    const where: any = dto.ids?.length ? { id: In(dto.ids) } : dto.expiredOnly ? { expiresAt: LessThan(new Date()) } : {};
    const rows = await this.trash.find({ where, take: 20000 });
    let freed = 0;
    for (const t of rows) {
      const abs = path.join(trashRoot(), t.trashPath);
      if (abs.startsWith(trashRoot() + path.sep)) {
        await fs.promises.rm(path.dirname(abs), { recursive: true, force: true }).catch(() => undefined);
      }
      freed += Number(t.sizeBytes);
    }
    if (rows.length) await this.trash.delete({ id: In(rows.map((r) => r.id)) });
    return { message: this.t('trash_emptied', lang, { count: rows.length, size: human(freed) }), data: { count: rows.length, freedBytes: freed, freed: human(freed) } };
  }

  /** Corbeille : éléments expirés supprimés chaque nuit (03:40) */
  @Cron('0 40 3 * * *')
  async purgeExpiredTrash() {
    try {
      const r = await this.emptyTrash({ expiredOnly: true, confirm: 'VIDER' });
      if (r.data.count) this.logger.log(`🗑️ Corbeille : ${r.data.count} élément(s) expiré(s) supprimé(s) (${r.data.freed})`);
    } catch (e: any) {
      if (!/doesn't exist/i.test(String(e?.message))) this.logger.warn(`Corbeille : ${e?.message}`);
    }
  }

  // ============================================================
  // STATISTIQUES D'ESPACE
  // ============================================================
  async stats(rootId: string | undefined, refresh = false, lang = 'fr') {
    const root = getRoot(rootId);
    const cached = this.statsCache.get(root.id);
    if (cached && !refresh && Date.now() - cached.at < 15 * 60 * 1000) return { message: this.t('stats', lang), data: { ...cached.data, computing: this.statsRunning.has(root.id) } };
    if (!this.statsRunning.has(root.id)) {
      this.statsRunning.add(root.id);
      void this.computeStats(root).finally(() => this.statsRunning.delete(root.id));
    }
    return { message: this.t('stats_computing', lang), data: { ...(cached?.data ?? {}), computing: true } };
  }

  private async computeStats(root: StorageRoot) {
    const started = Date.now();
    const folders = new Map<string, { files: number; size: number }>();
    const kinds = new Map<string, { files: number; size: number }>();
    const biggest: WalkEntry[] = [];
    let files = 0;
    let size = 0;
    for await (const e of this.walk(root.path)) {
      files++;
      size += e.size;
      const top = e.rel.includes('/') ? e.rel.split('/')[0] : '(racine)';
      const f = folders.get(top) ?? { files: 0, size: 0 };
      f.files++;
      f.size += e.size;
      folders.set(top, f);
      const k = kindOf(e.rel);
      const kk = kinds.get(k) ?? { files: 0, size: 0 };
      kk.files++;
      kk.size += e.size;
      kinds.set(k, kk);
      if (biggest.length < 20 || e.size > biggest[biggest.length - 1].size) {
        biggest.push(e);
        biggest.sort((a, b) => b.size - a.size);
        if (biggest.length > 20) biggest.pop();
      }
    }
    const data = {
      root: root.id,
      computedAt: new Date(),
      durationMs: Date.now() - started,
      files,
      sizeBytes: size,
      size: human(size),
      folders: [...folders.entries()].map(([name, v]) => ({ name, files: v.files, sizeBytes: v.size, size: human(v.size) })).sort((a, b) => b.sizeBytes - a.sizeBytes),
      kinds: [...kinds.entries()].map(([kind, v]) => ({ kind, files: v.files, sizeBytes: v.size, size: human(v.size) })).sort((a, b) => b.sizeBytes - a.sizeBytes),
      biggest: biggest.map((b) => ({ path: b.rel, sizeBytes: b.size, size: human(b.size), modifiedAt: new Date(b.mtimeMs), url: publicUrl(root, b.rel) })),
    };
    this.statsCache.set(root.id, { at: Date.now(), data });
  }

  // ============================================================
  // FICHIERS ORPHELINS (sur le disque, utilisés nulle part en base)
  // ============================================================
  async startOrphanScan(dto: FmOrphanScanDto, lang = 'fr') {
    const root = getRoot(dto.root ?? 'storage');
    if (!this.checksReferences(root)) throw new BadRequestException(this.t('orphans_unsupported', lang));
    if (this.orphanScan?.status === 'RUNNING') throw new ConflictException(this.t('orphans_running', lang));
    const base = resolveIn(root, dto.path);
    const days = dto.olderThanDays ?? 7;
    this.orphanScan = { rootId: root.id, status: 'RUNNING', startedAt: new Date(), scanned: 0, staticSkipped: 0, olderThanDays: days, items: [], totalSize: 0, truncated: false };
    const scan = this.orphanScan;
    void (async () => {
      try {
        const { stems } = await this.refs.index(true);
        const limitDate = Date.now() - days * 86400000;
        const max = Number(process.env.FILE_ORPHAN_MAX_RESULTS ?? 50000);
        const ex = orphanExclusions();
        for await (const e of this.walk(base.abs)) {
          scan.scanned++;
          const full = base.rel ? `${base.rel}/${e.rel}` : e.rel;
          if (isStaticFile(full, ex)) {
            scan.staticSkipped++;
            continue;
          }
          if (e.mtimeMs > limitDate) continue;
          if (stems.has(fileStem(full))) continue;
          scan.totalSize += e.size;
          if (scan.items.length < max) scan.items.push({ path: full, size: e.size, modifiedAt: new Date(e.mtimeMs), kind: kindOf(full), url: publicUrl(root, full) });
          else scan.truncated = true;
        }
        scan.status = 'DONE';
      } catch (e: any) {
        scan.status = 'FAILED';
        scan.error = e?.message;
      } finally {
        scan.finishedAt = new Date();
      }
    })();
    return { message: this.t('orphans_started', lang), data: this.orphanSummary() };
  }

  private orphanSummary() {
    const s = this.orphanScan;
    if (!s) return null;
    return {
      root: s.rootId,
      status: s.status,
      startedAt: s.startedAt,
      finishedAt: s.finishedAt ?? null,
      scanned: s.scanned,
      olderThanDays: s.olderThanDays,
      // Fichiers statiques / techniques ignorés (jamais proposés à la suppression)
      staticSkipped: s.staticSkipped,
      excludedFolders: [...orphanExclusions().dirs],
      orphans: s.items.length,
      totalSizeBytes: s.totalSize,
      totalSize: human(s.totalSize),
      truncated: s.truncated,
      error: s.error ?? null,
    };
  }

  orphans(q: FmOrphanListDto, lang = 'fr') {
    const s = this.orphanScan;
    if (!s) return { message: this.t('orphans_none', lang), data: { summary: null, ...paginated([], 0, 1, 50) } };
    let items = s.items;
    if (q.folder) items = items.filter((i) => i.path === q.folder || i.path.startsWith(`${q.folder}/`));
    if (q.kind) items = items.filter((i) => i.kind === q.kind);
    const folders = new Map<string, { files: number; size: number }>();
    for (const i of s.items) {
      const top = i.path.includes('/') ? i.path.split('/')[0] : '(racine)';
      const f = folders.get(top) ?? { files: 0, size: 0 };
      f.files++;
      f.size += i.size;
      folders.set(top, f);
    }
    const { page, limit, skip } = pageParams(q, 100, 500);
    return {
      message: this.t('orphans', lang),
      data: paginated(
        items.slice(skip, skip + limit).map((i) => ({ ...i, sizeHuman: human(i.size) })),
        items.length,
        page,
        limit,
        {
          summary: this.orphanSummary(),
          folders: [...folders.entries()].map(([name, v]) => ({ name, files: v.files, sizeBytes: v.size, size: human(v.size) })).sort((a, b) => b.sizeBytes - a.sizeBytes),
        },
      ),
    };
  }

  /** Orphelins → corbeille (chaque fichier est revérifié juste avant) */
  async cleanOrphans(dto: FmOrphanCleanDto, user: Actor, lang = 'fr') {
    const s = this.orphanScan;
    if (!s || s.status !== 'DONE') throw new BadRequestException(this.t('orphans_scan_first', lang));
    const root = getRoot(s.rootId);
    assertWritable(root);
    const known = new Set(s.items.map((i) => i.path));
    let targets = dto.paths?.length ? dto.paths.filter((p) => known.has(p)) : [...known];
    if (dto.folder) targets = targets.filter((p) => p === dto.folder || p.startsWith(`${dto.folder}/`));
    const { stems } = await this.refs.index(true);
    let moved = 0;
    let freed = 0;
    let skipped = 0;
    const ex = orphanExclusions();
    for (const p of targets) {
      // Revérification : utilisé en base ou fichier statique → jamais supprimé
      if (stems.has(fileStem(p)) || isStaticFile(p, ex)) {
        skipped++;
        continue;
      }
      const r = await this.toTrash(root, p, { reason: 'ORPHAN', context: 'Fichier orphelin (utilisé nulle part)', user }).catch(() => null);
      if (r) {
        moved++;
        freed += r.sizeBytes;
      }
    }
    const done = new Set(targets);
    s.items = s.items.filter((i) => !done.has(i.path));
    s.totalSize = s.items.reduce((n, i) => n + i.size, 0);
    this.statsCache.delete(root.id);
    return { message: this.t('orphans_cleaned', lang, { count: moved, size: human(freed) }), data: { moved, skipped, freedBytes: freed, freed: human(freed) } };
  }
}
