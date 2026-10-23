import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { I18nService } from 'src/libs/common/src';
import { UserEntity } from 'src/users/entities/user.entity';
import { UserRole } from 'src/users/enum/user-role-enum';
import { NotificationsService } from 'src/notification/notifications.service';
import { FcmService } from 'src/notification/fcm.service';
import { NotificationType } from 'src/notification/type/notification.type';
import { CategoryEntity } from 'src/category/entities/category.entity';

export const SUPPORTED_LANGS = ['fr', 'en', 'es', 'sw', 'ar'];

export function langFrom(req: { headers: Record<string, any> }): string {
  const raw = String(req.headers['accept-language'] || 'fr').split(',')[0].split(';')[0].trim().slice(0, 2);
  return SUPPORTED_LANGS.includes(raw) ? raw : 'fr';
}

export function pageParams(page?: number | string, limit?: number | string, max = 100) {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(max, Math.max(1, Number(limit) || 20));
  return { page: p, limit: l, skip: (p - 1) * l };
}

export function reference(prefix: string): string {
  const d = new Date();
  const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `${prefix}-${day}-${Math.floor(10000 + Math.random() * 90000)}`;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

/** Modération avant mise en ligne : CLASSIFIED_MODERATION=true (défaut : false, publication immédiate) */
export const MODERATION_ENABLED = String(process.env.CLASSIFIED_MODERATION || 'false').toLowerCase() === 'true';
/** Nombre max d'annonces GRATUITES en ligne par utilisateur (défaut 3) */
export const FREE_MAX_ACTIVE = Number(process.env.CLASSIFIED_FREE_MAX_ACTIVE || 3);
/** Au moins une photo pour publier (défaut : oui) */
export const REQUIRE_IMAGE = String(process.env.CLASSIFIED_REQUIRE_IMAGE || 'true').toLowerCase() !== 'false';
/** Rappel avant expiration (jours, défaut 2) */
export const REMINDER_DAYS = Number(process.env.CLASSIFIED_REMINDER_DAYS || 2);

/** Outils partagés du module Annonces */
@Injectable()
export class ClassifiedCommonService {
  private readonly logger = new Logger(ClassifiedCommonService.name);

  constructor(
    @InjectDataSource() readonly dataSource: DataSource,
    private readonly i18n: I18nService,
    private readonly notifications: NotificationsService,
    private readonly fcm: FcmService,
  ) { }

  get m() {
    return this.dataSource.manager;
  }

  t(key: string, lang: string, params?: Record<string, any>): string {
    return this.i18n.translate(key, lang, params);
  }

  isAdmin(user?: UserEntity | null): boolean {
    return user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;
  }

  assertAdmin(user: UserEntity | null | undefined, lang: string) {
    if (!this.isAdmin(user)) throw new ForbiddenException(this.t('classified.admin_only', lang));
  }

  /** Catégorie + ses parents (pour les tarifs par catégorie) */
  async categoryChain(categoryId?: string | null): Promise<string[]> {
    const chain: string[] = [];
    let current = categoryId || null;
    for (let i = 0; current && i < 5; i++) {
      chain.push(current);
      const rows = await this.dataSource.query('SELECT `parent_id` AS parentId FROM `category` WHERE `id` = ? LIMIT 1', [current]);
      current = rows?.[0]?.parentId || null;
      if (current && chain.includes(current)) break;
    }
    return chain;
  }

  /** Catégorie + ses sous-catégories (recherche) */
  async categoryWithChildren(categoryId: string): Promise<string[]> {
    const all = new Set<string>([categoryId]);
    let level = [categoryId];
    for (let i = 0; level.length && i < 4; i++) {
      const rows: { id: string }[] = await this.m
        .createQueryBuilder(CategoryEntity, 'c')
        .select('c.id', 'id')
        .where('c.parent_id IN (:...ids)', { ids: level })
        .andWhere('c.deleted = 0')
        .getRawMany();
      level = rows.map((r) => r.id).filter((id) => !all.has(id));
      level.forEach((id) => all.add(id));
    }
    return [...all];
  }

  /** Notification enregistrée + WebSocket + push Firebase — ne lève jamais d'erreur */
  async notify(userId: string, key: string, params: Record<string, any>, data: Record<string, any>, lang = 'fr') {
    if (!userId) return;
    const title = this.t(`classified.notif.${key}.title`, lang, params);
    const body = this.t(`classified.notif.${key}.body`, lang, params);
    const payload = { category: 'classified', event: key, ...data };
    try {
      await this.notifications.sendAndSaveNotificationToUsers([userId], title, body, NotificationType.CLASSIFIED_UPDATE, payload);
    } catch (e: any) {
      this.logger.warn(`Notification annonce non enregistrée: ${e?.message}`);
    }
    void this.fcm
      .sendPushToUsers([userId], title, body, { type: NotificationType.CLASSIFIED_UPDATE, ...payload }, { tag: data.adId ? `classified-${data.adId}` : undefined })
      .catch((e) => this.logger.warn(`Push annonce: ${e?.message}`));
  }
}
