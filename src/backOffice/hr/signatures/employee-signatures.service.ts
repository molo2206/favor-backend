// src/backOffice/hr/signatures/employee-signatures.service.ts
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { promises as fs } from 'fs';
import { join } from 'path';
import * as crypto from 'crypto';
import sharp from 'sharp';
import { I18nService } from 'src/libs/common/src';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { buildPublicFileUrl, storedRelativePath } from 'src/files/media-url.util';
import { EmployeeSignature } from './employee-signature.entity';

const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const DATA_URL = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=\s]+)$/;

type EmployeeRow = { id: string; fullName: string | null; userId: string | null; companyId: string | null };

/**
 * ✅ SIGNATURES DES EMPLOYÉS (hr_employees)
 *  - Chaque employé a une signature : fichier PNG / JPG / WEBP ou signature dessinée (data URL base64).
 *  - L'employé gère la sienne (« me » = sa fiche employé dans l'entreprise active) ;
 *    le propriétaire de l'entreprise et les administrateurs gèrent celle de tous les employés.
 *  - Image recadrée, redimensionnée, WEBP avec transparence, stockée dans UPLOAD_PATH/signatures (domaine média).
 *  .env : USER_SIGNATURE_MAX_MB (2 par défaut)
 */
@Injectable()
export class EmployeeSignaturesService {
  private readonly logger = new Logger('EmployeeSignatures');

  constructor(
    @InjectRepository(EmployeeSignature) private readonly repo: Repository<EmployeeSignature>,
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

  private get uploadPath(): string {
    return process.env.UPLOAD_PATH || process.env.UPLOAD_PATH_PROD || '/var/www/favor-storage';
  }

  private get baseUrl(): string {
    return process.env.BASE_URL || 'https://api-prod.favorhelp.com';
  }

  private get maxBytes(): number {
    const v = Number(process.env.USER_SIGNATURE_MAX_MB);
    return (Number.isFinite(v) && v > 0 ? v : 2) * 1024 * 1024;
  }

  private view(s: EmployeeSignature | null | undefined, emp?: EmployeeRow | null) {
    return {
      employee: emp ? { id: emp.id, fullName: emp.fullName, userId: emp.userId, companyId: emp.companyId } : null,
      hasSignature: !!s,
      signature: s
        ? { employeeId: s.employeeId, imageUrl: s.imageUrl, width: s.width ?? null, height: s.height ?? null, source: s.source, updatedAt: s.updatedAt }
        : null,
    };
  }

  // ============================================================
  // EMPLOYÉS
  // ============================================================
  private async employee(id: string): Promise<EmployeeRow | null> {
    const rows = await this.dataSource.query(
      'SELECT `id`, `fullName`, `userId`, `companyId` FROM `hr_employees` WHERE `id` = ? LIMIT 1',
      [id],
    );
    return rows?.[0] ?? null;
  }

  /** Fiche employé d'un utilisateur dans une entreprise (celle de l'entreprise en priorité) */
  async employeeOfUser(userId: string, companyId?: string | null): Promise<EmployeeRow | null> {
    if (!userId) return null;
    try {
      const rows = await this.dataSource.query(
        'SELECT `id`, `fullName`, `userId`, `companyId` FROM `hr_employees` WHERE `userId` = ? ' +
          (companyId ? 'AND (`companyId` = ? OR `companyId` IS NULL) ORDER BY (`companyId` = ?) DESC' : 'ORDER BY `createdAt` DESC') +
          ' LIMIT 1',
        companyId ? [userId, companyId, companyId] : [userId],
      );
      return rows?.[0] ?? null;
    } catch {
      return null;
    }
  }

  /** Gérer la signature d'un employé : lui-même, admin plateforme, propriétaire de son entreprise */
  private async assertCanManage(user: UserEntity, emp: EmployeeRow, lang: string) {
    if (emp.userId && emp.userId === user.id) return;
    if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) return;
    if (emp.companyId) {
      const owner = await this.dataSource.query(
        'SELECT 1 FROM `user_has_company` WHERE `userId` = ? AND `companyId` = ? AND `isOwner` = 1 LIMIT 1',
        [user.id, emp.companyId],
      );
      if (owner?.length) return;
    }
    throw new ForbiddenException(this.t('employee_signature.forbidden', lang));
  }

  /** Voir : les cas ci-dessus + les collègues de la même entreprise */
  private async assertCanView(user: UserEntity, emp: EmployeeRow, lang: string) {
    try {
      await this.assertCanManage(user, emp, lang);
      return;
    } catch {
      /* collègue ? */
    }
    if (emp.companyId) {
      const member = await this.dataSource.query(
        'SELECT 1 FROM `user_has_company` WHERE `userId` = ? AND `companyId` = ? LIMIT 1',
        [user.id, emp.companyId],
      );
      if (member?.length) return;
    }
    throw new ForbiddenException(this.t('employee_signature.forbidden', lang));
  }

  private async myEmployee(user: UserEntity, companyId: string | undefined, lang: string): Promise<EmployeeRow> {
    const emp = await this.employeeOfUser(user.id, companyId || user.activeCompanyId);
    if (!emp) throw new NotFoundException(this.t('employee_signature.no_employee', lang));
    return emp;
  }

  private async employeeOrFail(id: string, lang: string): Promise<EmployeeRow> {
    const emp = await this.employee(id);
    if (!emp) throw new NotFoundException(this.t('employee_signature.employee_not_found', lang));
    return emp;
  }

  // ============================================================
  // LECTURE (états de besoins, PDF)
  // ============================================================
  /** Signature de l'employé lié à cet utilisateur dans l'entreprise du document */
  async urlForUser(userId: string, companyId?: string | null): Promise<{ url: string | null; employeeId: string | null }> {
    try {
      const emp = await this.employeeOfUser(userId, companyId);
      if (!emp) return { url: null, employeeId: null };
      const s = await this.repo.findOne({ where: { employeeId: emp.id }, select: ['id', 'imageUrl'] });
      return { url: s?.imageUrl ?? null, employeeId: emp.id };
    } catch (e: any) {
      this.logger.warn(`Signature de l'utilisateur ${userId} illisible : ${e?.message}`);
      return { url: null, employeeId: null };
    }
  }

  /** Image en data URI (PDF) à partir de son URL publique */
  async dataUriOf(url?: string | null): Promise<string | null> {
    const rel = storedRelativePath(url);
    if (!rel) return null;
    try {
      const buf = await fs.readFile(join(this.uploadPath, rel));
      const ext = (rel.split('.').pop() || '').toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/webp';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  }

  // ============================================================
  // ROUTES
  // ============================================================
  async getMine(user: UserEntity, companyId: string | undefined, lang: string) {
    const emp = await this.myEmployee(user, companyId, lang);
    const s = await this.repo.findOne({ where: { employeeId: emp.id } });
    return { message: this.t('employee_signature.fetched', lang), data: this.view(s, emp) };
  }

  async getForEmployee(user: UserEntity, employeeId: string, lang: string) {
    const emp = await this.employeeOrFail(employeeId, lang);
    await this.assertCanView(user, emp, lang);
    const s = await this.repo.findOne({ where: { employeeId: emp.id } });
    return { message: this.t('employee_signature.fetched', lang), data: this.view(s, emp) };
  }

  async saveMine(user: UserEntity, companyId: string | undefined, file: Express.Multer.File | undefined, dataUrl: string | undefined, lang: string) {
    const emp = await this.myEmployee(user, companyId, lang);
    return this.save(user, emp, file, dataUrl, lang);
  }

  async saveForEmployee(user: UserEntity, employeeId: string, file: Express.Multer.File | undefined, dataUrl: string | undefined, lang: string) {
    const emp = await this.employeeOrFail(employeeId, lang);
    await this.assertCanManage(user, emp, lang);
    return this.save(user, emp, file, dataUrl, lang);
  }

  async removeMine(user: UserEntity, companyId: string | undefined, lang: string) {
    const emp = await this.myEmployee(user, companyId, lang);
    return this.remove(emp, lang);
  }

  async removeForEmployee(user: UserEntity, employeeId: string, lang: string) {
    const emp = await this.employeeOrFail(employeeId, lang);
    await this.assertCanManage(user, emp, lang);
    return this.remove(emp, lang);
  }

  // ============================================================
  // ENREGISTREMENT
  // ============================================================
  private async save(user: UserEntity, emp: EmployeeRow, file: Express.Multer.File | undefined, dataUrl: string | undefined, lang: string) {
    let buffer: Buffer | null = null;
    let source = 'UPLOAD';
    if (file) {
      const mime = String(file.mimetype || '').toLowerCase();
      if (!ALLOWED.includes(mime) && mime !== 'application/octet-stream') {
        throw new BadRequestException(this.t('employee_signature.invalid_type', lang));
      }
      buffer = file.buffer ?? (file.path ? await fs.readFile(file.path) : null);
      if (file.path) await fs.unlink(file.path).catch(() => undefined);
    } else if (dataUrl) {
      const m = DATA_URL.exec(String(dataUrl).trim());
      if (!m) throw new BadRequestException(this.t('employee_signature.invalid_type', lang));
      buffer = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
      source = 'DRAWN';
    }
    if (!buffer?.length) throw new BadRequestException(this.t('employee_signature.file_required', lang));
    if (buffer.length > this.maxBytes) {
      throw new BadRequestException(this.t('employee_signature.too_large', lang, { max: Math.round(this.maxBytes / 1024 / 1024) }));
    }

    // Rotation EXIF, bords vides retirés, taille raisonnable, WEBP avec transparence
    let out: Buffer;
    try {
      let img = sharp(buffer).rotate();
      try {
        const trimmed = await img.clone().trim({ threshold: 20 }).toBuffer();
        img = sharp(trimmed);
      } catch {
        /* image uniforme : pas de recadrage */
      }
      out = await img
        .resize(900, 360, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 92, alphaQuality: 100 })
        .toBuffer();
    } catch {
      throw new BadRequestException(this.t('employee_signature.invalid_image', lang));
    }
    const meta = await sharp(out).metadata();

    const dir = join(this.uploadPath, 'signatures');
    await fs.mkdir(dir, { recursive: true });
    const name = `${emp.id}_${crypto.randomBytes(8).toString('hex')}.webp`;
    await fs.writeFile(join(dir, name), out);

    // L'ancienne image est conservée : les documents déjà signés continuent de l'afficher
    let s = await this.repo.findOne({ where: { employeeId: emp.id } });
    if (!s) s = this.repo.create({ employeeId: emp.id });
    s.companyId = emp.companyId ?? null;
    s.userId = emp.userId ?? null;
    s.imageUrl = buildPublicFileUrl(this.baseUrl, 'signatures', name);
    s.storagePath = `signatures/${name}`;
    s.width = meta.width ?? null;
    s.height = meta.height ?? null;
    s.sizeBytes = out.length;
    s.source = source;
    s.updatedById = user.id;
    const saved = await this.repo.save(s);
    return { message: this.t('employee_signature.saved', lang), data: this.view(saved, emp) };
  }

  private async remove(emp: EmployeeRow, lang: string) {
    const s = await this.repo.findOne({ where: { employeeId: emp.id } });
    if (!s) throw new NotFoundException(this.t('employee_signature.not_found', lang));
    await this.repo.delete({ id: s.id });
    return { message: this.t('employee_signature.deleted', lang), data: this.view(null, emp) };
  }
}
