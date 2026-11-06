// src/user-signatures/user-signatures.service.ts
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { promises as fs } from 'fs';
import { join } from 'path';
import * as crypto from 'crypto';
import sharp from 'sharp';
import { I18nService } from 'src/libs/common/src';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { buildPublicFileUrl, storedRelativePath } from 'src/files/media-url.util';
import { UserSignature } from './user-signature.entity';

const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const DATA_URL = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=\s]+)$/;

export type SignatureView = {
  userId: string;
  imageUrl: string;
  width: number | null;
  height: number | null;
  source: string;
  updatedAt: Date;
};

/**
 * ✅ SIGNATURES DES UTILISATEURS
 *  - Chaque utilisateur (employé) enregistre l'image de sa signature : fichier PNG / JPG / WEBP
 *    ou signature dessinée dans l'application (data URL base64).
 *  - L'image est recadrée (bords vides retirés), redimensionnée et convertie en WEBP (transparence conservée).
 *  - Stockage : UPLOAD_PATH/signatures/… (servi par le domaine média).
 *  .env : USER_SIGNATURE_MAX_MB (2 par défaut)
 */
@Injectable()
export class UserSignaturesService {
  private readonly logger = new Logger('UserSignatures');

  constructor(
    @InjectRepository(UserSignature) private readonly repo: Repository<UserSignature>,
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

  private view(s: UserSignature | null | undefined): SignatureView | null {
    if (!s) return null;
    return {
      userId: s.userId,
      imageUrl: s.imageUrl,
      width: s.width ?? null,
      height: s.height ?? null,
      source: s.source,
      updatedAt: s.updatedAt,
    };
  }

  // ============================================================
  // LECTURE (utilisée par les autres modules)
  // ============================================================
  async urlOf(userId: string): Promise<string | null> {
    try {
      const s = await this.repo.findOne({ where: { userId }, select: ['id', 'imageUrl'] });
      return s?.imageUrl ?? null;
    } catch (e: any) {
      this.logger.warn(`Signature de ${userId} illisible : ${e?.message}`);
      return null;
    }
  }

  async urlsOf(userIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(userIds.filter(Boolean))];
    const out = new Map<string, string>();
    if (!ids.length) return out;
    try {
      const rows = await this.repo.find({ where: { userId: In(ids) }, select: ['userId', 'imageUrl'] });
      for (const r of rows) out.set(r.userId, r.imageUrl);
    } catch {
      /* table absente */
    }
    return out;
  }

  /** Image en data URI (pour les PDF) à partir de son URL publique */
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
  async mine(user: UserEntity, lang: string) {
    const s = await this.repo.findOne({ where: { userId: user.id } });
    return { message: this.t('user_signature.fetched', lang), data: { hasSignature: !!s, signature: this.view(s) } };
  }

  /** Voir la signature d'un autre utilisateur : soi-même, admin plateforme, ou membre d'une même entreprise */
  async ofUser(viewer: UserEntity, userId: string, lang: string) {
    await this.assertCanView(viewer, userId, lang);
    const s = await this.repo.findOne({ where: { userId } });
    return { message: this.t('user_signature.fetched', lang), data: { hasSignature: !!s, signature: this.view(s) } };
  }

  private async assertCanView(viewer: UserEntity, userId: string, lang: string) {
    if (viewer.id === userId) return;
    if (viewer.role === UserRole.SUPER_ADMIN || viewer.role === UserRole.ADMIN) return;
    const rows = await this.dataSource.query(
      'SELECT 1 FROM `user_has_company` a INNER JOIN `user_has_company` b ON b.`companyId` = a.`companyId` WHERE a.`userId` = ? AND b.`userId` = ? LIMIT 1',
      [viewer.id, userId],
    );
    if (!rows?.length) throw new ForbiddenException(this.t('user_signature.forbidden', lang));
  }

  /** Enregistrer / remplacer : fichier (champ « file ») ou image dessinée { image: "data:image/png;base64,…" } */
  async save(user: UserEntity, targetUserId: string, file: Express.Multer.File | undefined, dataUrl: string | undefined, lang: string) {
    if (targetUserId !== user.id && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(this.t('user_signature.forbidden', lang));
    }

    let buffer: Buffer | null = null;
    let source = 'UPLOAD';
    if (file) {
      const mime = String(file.mimetype || '').toLowerCase();
      if (!ALLOWED.includes(mime)) throw new BadRequestException(this.t('user_signature.invalid_type', lang));
      buffer = file.buffer ?? (file.path ? await fs.readFile(file.path) : null);
      if (file.path) await fs.unlink(file.path).catch(() => undefined);
    } else if (dataUrl) {
      const m = DATA_URL.exec(String(dataUrl).trim());
      if (!m) throw new BadRequestException(this.t('user_signature.invalid_type', lang));
      buffer = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
      source = 'DRAWN';
    }
    if (!buffer?.length) throw new BadRequestException(this.t('user_signature.file_required', lang));
    if (buffer.length > this.maxBytes) {
      throw new BadRequestException(this.t('user_signature.too_large', lang, { max: Math.round(this.maxBytes / 1024 / 1024) }));
    }

    // Traitement : rotation EXIF, bords vides retirés, taille raisonnable, WEBP avec transparence
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
      throw new BadRequestException(this.t('user_signature.invalid_image', lang));
    }
    const meta = await sharp(out).metadata();

    const dir = join(this.uploadPath, 'signatures');
    await fs.mkdir(dir, { recursive: true });
    const name = `${targetUserId}_${crypto.randomBytes(8).toString('hex')}.webp`;
    await fs.writeFile(join(dir, name), out);
    const imageUrl = buildPublicFileUrl(this.baseUrl, 'signatures', name);

    // L'ancienne image est conservée : les documents déjà signés continuent de l'afficher
    let s = await this.repo.findOne({ where: { userId: targetUserId } });
    if (!s) s = this.repo.create({ userId: targetUserId });
    s.imageUrl = imageUrl;
    s.storagePath = `signatures/${name}`;
    s.width = meta.width ?? null;
    s.height = meta.height ?? null;
    s.sizeBytes = out.length;
    s.source = source;
    s.updatedById = user.id;
    const saved = await this.repo.save(s);
    return { message: this.t('user_signature.saved', lang), data: { hasSignature: true, signature: this.view(saved) } };
  }

  async remove(user: UserEntity, targetUserId: string, lang: string) {
    if (targetUserId !== user.id && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(this.t('user_signature.forbidden', lang));
    }
    const s = await this.repo.findOne({ where: { userId: targetUserId } });
    if (!s) throw new NotFoundException(this.t('user_signature.not_found', lang));
    await this.repo.delete({ id: s.id });
    return { message: this.t('user_signature.deleted', lang), data: { hasSignature: false, signature: null } };
  }
}
