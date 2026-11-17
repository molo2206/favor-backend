// src/backOffice/hr/employee-documents/employee-documents.service.ts
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, StreamableFile } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { createReadStream, promises as fs } from 'fs';
import { dirname, join, normalize } from 'path';
import * as crypto from 'crypto';
import { I18nService } from 'src/libs/common/src';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { paginated, pageParams } from 'src/common/pagination/paginate.util';
import { EMPLOYEE_DOCUMENT_CATEGORIES, EmployeeDocument } from './employee-document.entity';
import {
  EmployeeDocumentsQueryDto,
  ExpiringDocumentsQueryDto,
  UpdateEmployeeDocumentDto,
  UploadEmployeeDocumentsDto,
} from './employee-documents.dto';

/** Types de fichiers acceptés (extension → type MIME) */
const ALLOWED: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  odt: 'application/vnd.oasis.opendocument.text',
  txt: 'text/plain',
};

type EmployeeRow = { id: string; fullName: string | null; userId: string | null; companyId: string | null };

const ymd = (v: any): string | null => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null);
const todayYmd = () => new Date().toISOString().slice(0, 10);

/** Nom de fichier d'origine (multer encode parfois l'UTF-8 en latin1) */
function originalName(file: Express.Multer.File): string {
  let name = file.originalname || 'document';
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    if (!decoded.includes('�')) name = decoded;
  } catch {
    /* garde le nom tel quel */
  }
  return name.replace(/[\\/\0]/g, '_').slice(0, 255);
}

/**
 * ✅ DOSSIERS DES EMPLOYÉS (CV, pièce d'identité, diplômes, contrat, certificats…)
 *  - Plusieurs fichiers par envoi (PDF, images, Word, Excel), une catégorie, des dates de validité.
 *  - Fichiers PRIVÉS : enregistrés dans HR_DOCUMENTS_PATH (hors du domaine média public)
 *    et lus uniquement via la route de téléchargement protégée.
 *  - Accès : admin plateforme, propriétaire / membres de l'entreprise de l'employé, l'employé lui-même (lecture).
 *  .env : HR_DOCUMENTS_PATH (/var/www/favor-private/hr-documents), HR_DOCUMENT_MAX_MB (15), HR_DOCUMENT_EXPIRY_DAYS (30)
 */
@Injectable()
export class EmployeeDocumentsService {
  private readonly logger = new Logger('EmployeeDocuments');

  constructor(
    @InjectRepository(EmployeeDocument) private readonly repo: Repository<EmployeeDocument>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
  ) {}

  private t(key: string, lang: string, params?: Record<string, any>) {
    try {
      return this.i18n.translate(key, lang, params);
    } catch {
      return key;
    }
  }

  private get root(): string {
    return process.env.HR_DOCUMENTS_PATH || '/var/www/favor-private/hr-documents';
  }

  private get maxBytes(): number {
    const v = Number(process.env.HR_DOCUMENT_MAX_MB);
    return (Number.isFinite(v) && v > 0 ? v : 15) * 1024 * 1024;
  }

  private get expiryDays(): number {
    const v = Number(process.env.HR_DOCUMENT_EXPIRY_DAYS);
    return Number.isFinite(v) && v > 0 ? v : 30;
  }

  // ============================================================
  // ACCÈS
  // ============================================================
  private isPlatformAdmin(user: UserEntity) {
    return user?.role === UserRole.SUPER_ADMIN || user?.role === UserRole.ADMIN;
  }

  private async employee(id: string, lang: string): Promise<EmployeeRow> {
    const rows = await this.dataSource.query(
      'SELECT `id`, `fullName`, `userId`, `companyId` FROM `hr_employees` WHERE `id` = ? LIMIT 1',
      [id],
    );
    if (!rows?.[0]) throw new NotFoundException(this.t('employee_document.employee_not_found', lang));
    return rows[0];
  }

  /** Gérer (ajouter, modifier, supprimer) : admin plateforme ou membre de l'entreprise de l'employé */
  private async assertCanManage(user: UserEntity, emp: EmployeeRow, lang: string) {
    if (this.isPlatformAdmin(user)) return;
    if (emp.companyId) {
      const rows = await this.dataSource.query(
        'SELECT 1 FROM `user_has_company` WHERE `userId` = ? AND `companyId` = ? LIMIT 1',
        [user.id, emp.companyId],
      );
      if (rows?.length) return;
    }
    throw new ForbiddenException(this.t('employee_document.forbidden', lang));
  }

  /** Consulter : les mêmes + l'employé lui-même */
  private async assertCanView(user: UserEntity, emp: EmployeeRow, lang: string) {
    if (emp.userId && emp.userId === user.id) return;
    await this.assertCanManage(user, emp, lang);
  }

  private async documentOf(emp: EmployeeRow, documentId: string, lang: string): Promise<EmployeeDocument> {
    const doc = await this.repo.findOne({ where: { id: documentId, employeeId: emp.id } });
    if (!doc) throw new NotFoundException(this.t('employee_document.not_found', lang));
    return doc;
  }

  // ============================================================
  // PRÉSENTATION
  // ============================================================
  private status(doc: EmployeeDocument): 'VALID' | 'EXPIRING' | 'EXPIRED' | 'NO_EXPIRY' {
    const exp = ymd(doc.expiresAt);
    if (!exp) return 'NO_EXPIRY';
    const today = todayYmd();
    if (exp < today) return 'EXPIRED';
    const limit = new Date(Date.now() + this.expiryDays * 86400000).toISOString().slice(0, 10);
    return exp <= limit ? 'EXPIRING' : 'VALID';
  }

  private view(doc: EmployeeDocument, employeeId: string, lang = 'fr') {
    const base = `/api/v1/hr/employees/${employeeId}/documents/${doc.id}/download`;
    return {
      id: doc.id,
      employeeId: doc.employeeId,
      companyId: doc.companyId ?? null,
      category: doc.category,
      categoryLabel: this.t(`employee_document.category.${doc.category}`, lang),
      title: doc.title,
      description: doc.description ?? null,
      documentNumber: doc.documentNumber ?? null,
      issuedAt: ymd(doc.issuedAt),
      expiresAt: ymd(doc.expiresAt),
      validity: this.status(doc),
      originalName: doc.originalName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      isImage: doc.mimeType.startsWith('image/'),
      isPdf: doc.mimeType === 'application/pdf',
      /** Routes protégées (en-tête Authorization) : affichage dans le navigateur / téléchargement */
      viewUrl: `${base}?inline=true`,
      downloadUrl: base,
      uploadedBy: doc.uploadedById ? { id: doc.uploadedById, fullName: doc.uploadedByName ?? null } : null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  // ============================================================
  // LISTE
  // ============================================================
  async list(user: UserEntity, employeeId: string, q: EmployeeDocumentsQueryDto, lang: string) {
    const emp = await this.employee(employeeId, lang);
    await this.assertCanView(user, emp, lang);
    const { page, limit, skip } = pageParams(q, 20, 100);

    const qb = this.repo.createQueryBuilder('d').where('d.employeeId = :id', { id: emp.id });
    if (q.category) qb.andWhere('d.category = :cat', { cat: q.category });
    if (q.search?.trim()) {
      const s = `%${q.search.trim()}%`;
      qb.andWhere('(d.title LIKE :s OR d.originalName LIKE :s OR d.documentNumber LIKE :s OR d.description LIKE :s)', { s });
    }
    const today = todayYmd();
    const limitDate = new Date(Date.now() + this.expiryDays * 86400000).toISOString().slice(0, 10);
    if (q.status === 'expired') qb.andWhere('d.expiresAt IS NOT NULL AND d.expiresAt < :today', { today });
    if (q.status === 'expiring') qb.andWhere('d.expiresAt >= :today AND d.expiresAt <= :lim', { today, lim: limitDate });
    if (q.status === 'valid') qb.andWhere('(d.expiresAt IS NULL OR d.expiresAt >= :today)', { today });

    const [rows, total] = await qb.orderBy('d.createdAt', 'DESC').skip(skip).take(limit).getManyAndCount();

    // Compteurs par catégorie + alertes (tous les documents de l'employé)
    const countsRows: any[] = await this.repo
      .createQueryBuilder('d')
      .select('d.category', 'category')
      .addSelect('COUNT(*)', 'n')
      .where('d.employeeId = :id', { id: emp.id })
      .groupBy('d.category')
      .getRawMany();
    const counts: Record<string, number> = {};
    for (const c of EMPLOYEE_DOCUMENT_CATEGORIES) counts[c] = 0;
    for (const r of countsRows) counts[r.category] = Number(r.n) || 0;
    const alerts = await this.repo
      .createQueryBuilder('d')
      .select("SUM(CASE WHEN d.expiresAt < :today THEN 1 ELSE 0 END)", 'expired')
      .addSelect("SUM(CASE WHEN d.expiresAt >= :today AND d.expiresAt <= :lim THEN 1 ELSE 0 END)", 'expiring')
      .where('d.employeeId = :id', { id: emp.id })
      .setParameters({ today, lim: limitDate })
      .getRawOne();

    return {
      message: this.t('employee_document.list', lang),
      data: paginated(rows.map((d) => this.view(d, emp.id, lang)), total, page, limit, {
        employee: { id: emp.id, fullName: emp.fullName },
        counts,
        expired: Number(alerts?.expired) || 0,
        expiring: Number(alerts?.expiring) || 0,
      }),
    };
  }

  async findOne(user: UserEntity, employeeId: string, documentId: string, lang: string) {
    const emp = await this.employee(employeeId, lang);
    await this.assertCanView(user, emp, lang);
    const doc = await this.documentOf(emp, documentId, lang);
    return { message: this.t('employee_document.detail', lang), data: this.view(doc, emp.id, lang) };
  }

  // ============================================================
  // ENVOI (plusieurs fichiers)
  // ============================================================
  async upload(user: UserEntity, employeeId: string, files: Express.Multer.File[], dto: UploadEmployeeDocumentsDto, lang: string) {
    const emp = await this.employee(employeeId, lang);
    await this.assertCanManage(user, emp, lang);
    if (!files?.length) throw new BadRequestException(this.t('employee_document.files_required', lang));
    if (dto.issuedAt && dto.expiresAt && ymd(dto.expiresAt)! < ymd(dto.issuedAt)!) {
      throw new BadRequestException(this.t('employee_document.invalid_dates', lang));
    }

    // Vérification de tous les fichiers avant d'enregistrer quoi que ce soit
    for (const f of files) {
      const ext = (originalName(f).split('.').pop() || '').toLowerCase();
      if (!ALLOWED[ext]) throw new BadRequestException(this.t('employee_document.invalid_type', lang, { name: originalName(f) }));
      if ((f.size || f.buffer?.length || 0) > this.maxBytes) {
        throw new BadRequestException(this.t('employee_document.too_large', lang, { name: originalName(f), max: this.maxBytes / 1024 / 1024 }));
      }
    }

    const written: string[] = [];
    const saved: EmployeeDocument[] = [];
    try {
      for (const f of files) {
        const name = originalName(f);
        const ext = (name.split('.').pop() || '').toLowerCase();
        const buffer = f.buffer ?? (f.path ? await fs.readFile(f.path) : null);
        if (f.path) await fs.unlink(f.path).catch(() => undefined);
        if (!buffer?.length) throw new BadRequestException(this.t('employee_document.files_required', lang));

        const rel = `${emp.id}/${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${ext}`;
        const abs = join(this.root, rel);
        await fs.mkdir(dirname(abs), { recursive: true });
        await fs.writeFile(abs, buffer, { mode: 0o640 });
        written.push(abs);

        saved.push(
          await this.repo.save(
            this.repo.create({
              employeeId: emp.id,
              companyId: emp.companyId ?? null,
              category: (dto.category as any) || 'OTHER',
              title: (files.length === 1 && dto.title) || (dto.title ? `${dto.title} — ${name}` : name.replace(/\.[^.]+$/, '')),
              description: dto.description || null,
              documentNumber: dto.documentNumber || null,
              issuedAt: ymd(dto.issuedAt),
              expiresAt: ymd(dto.expiresAt),
              storagePath: rel,
              originalName: name,
              mimeType: ALLOWED[ext],
              sizeBytes: buffer.length,
              uploadedById: user.id,
              uploadedByName: user.fullName ?? null,
            }),
          ),
        );
      }
    } catch (e) {
      // Tout ou rien : fichiers et lignes déjà créés sont retirés
      for (const p of written) await fs.unlink(p).catch(() => undefined);
      if (saved.length) await this.repo.delete(saved.map((s) => s.id)).catch(() => undefined);
      throw e;
    }

    return {
      message: this.t('employee_document.uploaded', lang, { count: saved.length }),
      data: saved.map((d) => this.view(d, emp.id, lang)),
    };
  }

  // ============================================================
  // MODIFICATION / SUPPRESSION
  // ============================================================
  async update(user: UserEntity, employeeId: string, documentId: string, dto: UpdateEmployeeDocumentDto, lang: string) {
    const emp = await this.employee(employeeId, lang);
    await this.assertCanManage(user, emp, lang);
    const doc = await this.documentOf(emp, documentId, lang);
    if (dto.category !== undefined) doc.category = dto.category as any;
    if (dto.title !== undefined && dto.title) doc.title = dto.title;
    if (dto.description !== undefined) doc.description = dto.description || null;
    if (dto.documentNumber !== undefined) doc.documentNumber = dto.documentNumber || null;
    if (dto.issuedAt !== undefined) doc.issuedAt = ymd(dto.issuedAt);
    if (dto.expiresAt !== undefined) doc.expiresAt = ymd(dto.expiresAt);
    if (doc.issuedAt && doc.expiresAt && ymd(doc.expiresAt)! < ymd(doc.issuedAt)!) {
      throw new BadRequestException(this.t('employee_document.invalid_dates', lang));
    }
    const saved = await this.repo.save(doc);
    return { message: this.t('employee_document.updated', lang), data: this.view(saved, emp.id, lang) };
  }

  async remove(user: UserEntity, employeeId: string, documentId: string, lang: string) {
    const emp = await this.employee(employeeId, lang);
    await this.assertCanManage(user, emp, lang);
    const doc = await this.documentOf(emp, documentId, lang);
    await this.repo.delete({ id: doc.id });
    await fs.unlink(this.absolute(doc.storagePath)).catch(() => undefined);
    return { message: this.t('employee_document.deleted', lang), data: { id: doc.id } };
  }

  // ============================================================
  // TÉLÉCHARGEMENT (route protégée)
  // ============================================================
  private absolute(rel: string): string {
    const abs = normalize(join(this.root, rel));
    if (!abs.startsWith(normalize(this.root))) throw new ForbiddenException();
    return abs;
  }

  async download(user: UserEntity, employeeId: string, documentId: string, inline: boolean, lang: string): Promise<StreamableFile> {
    const emp = await this.employee(employeeId, lang);
    await this.assertCanView(user, emp, lang);
    const doc = await this.documentOf(emp, documentId, lang);
    const abs = this.absolute(doc.storagePath);
    try {
      await fs.access(abs);
    } catch {
      throw new NotFoundException(this.t('employee_document.file_missing', lang));
    }
    const safe = doc.originalName.replace(/"/g, '');
    return new StreamableFile(createReadStream(abs), {
      type: doc.mimeType,
      length: doc.sizeBytes,
      disposition: `${inline ? 'inline' : 'attachment'}; filename="${safe.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(safe)}`,
    });
  }

  // ============================================================
  // ALERTES : documents expirés / qui expirent bientôt (toute l'entreprise)
  // ============================================================
  async expiring(user: UserEntity, q: ExpiringDocumentsQueryDto, lang: string) {
    const companyId = q.companyId || user.activeCompanyId;
    if (!companyId && !this.isPlatformAdmin(user)) throw new BadRequestException(this.t('employee_document.company_required', lang));
    if (companyId && !this.isPlatformAdmin(user)) {
      const rows = await this.dataSource.query('SELECT 1 FROM `user_has_company` WHERE `userId` = ? AND `companyId` = ? LIMIT 1', [user.id, companyId]);
      if (!rows?.length) throw new ForbiddenException(this.t('employee_document.forbidden', lang));
    }
    const { page, limit, skip } = pageParams(q, 20, 100);
    const days = Number(q.days) || this.expiryDays;
    const limitDate = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

    const qb = this.repo
      .createQueryBuilder('d')
      .innerJoin('hr_employees', 'e', 'e.id = d.employeeId')
      .addSelect(['e.fullName AS employeeName'])
      .where('d.expiresAt IS NOT NULL AND d.expiresAt <= :lim', { lim: limitDate });
    if (companyId) qb.andWhere('d.companyId = :companyId', { companyId });
    const total = await qb.clone().getCount();
    const { entities, raw } = await qb.orderBy('d.expiresAt', 'ASC').offset(skip).limit(limit).getRawAndEntities();

    const names = new Map<string, string>();
    for (const r of raw as any[]) if (r.d_id) names.set(r.d_id, r.employeeName);
    return {
      message: this.t('employee_document.expiring_list', lang, { days }),
      data: paginated(
        entities.map((d) => ({ ...this.view(d, d.employeeId, lang), employee: { id: d.employeeId, fullName: names.get(d.id) ?? null } })),
        total,
        page,
        limit,
        { days },
      ),
    };
  }
}
