import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { I18nService } from 'src/libs/common/src';
import { UserEntity } from 'src/users/entities/user.entity';
import { NotificationsService } from 'src/notification/notifications.service';
import { FcmService } from 'src/notification/fcm.service';
import { NotificationType } from 'src/notification/type/notification.type';
import { resolveCompanyId } from 'src/backOffice/logistics/common/logistics-access';
import { MediaEventType } from '../media.enums';
import { MediaProject } from '../entities/media-project.entity';
import { MediaProjectEvent } from '../entities/media-project-event.entity';

/** Outils partagés du module Média : accès, historique, notifications */
@Injectable()
export class MediaCommonService {
  private readonly logger = new Logger(MediaCommonService.name);

  constructor(
    @InjectDataSource() readonly dataSource: DataSource,
    private readonly i18n: I18nService,
    private readonly notifications: NotificationsService,
    private readonly fcm: FcmService,
  ) { }

  t(key: string, lang: string, params?: Record<string, any>): string {
    return this.i18n.translate(key, lang, params);
  }

  company(user: UserEntity, companyId: string | undefined | null, lang: string): Promise<string> {
    return resolveCompanyId(this.dataSource, user, companyId, {
      required: this.t('media.company_required', lang),
      forbidden: this.t('media.forbidden', lang),
    });
  }

  async getProject(id: string, user: UserEntity, lang: string, m?: EntityManager): Promise<MediaProject> {
    const project = await (m ?? this.dataSource.manager).findOne(MediaProject, { where: { id } });
    if (!project) throw new NotFoundException(this.t('media.project_not_found', lang));
    await this.company(user, project.companyId, lang);
    return project;
  }

  /** L'utilisateur fait-il partie de l'entreprise ? */
  async isMember(userId: string, companyId: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      'SELECT 1 FROM `user_has_company` WHERE `userId` = ? AND `companyId` = ? LIMIT 1',
      [userId, companyId],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  /** Historique du projet — ne lève jamais d'erreur */
  async record(
    projectId: string,
    type: MediaEventType,
    description: string,
    actor?: UserEntity | null,
    extra: { fromStatus?: string | null; toStatus?: string | null; payload?: Record<string, any> | null } = {},
    m?: EntityManager,
  ) {
    try {
      await (m ?? this.dataSource.manager).insert(MediaProjectEvent, {
        projectId,
        type,
        description: String(description || '').slice(0, 500),
        fromStatus: extra.fromStatus ?? null,
        toStatus: extra.toStatus ?? null,
        payload: extra.payload ?? null,
        actorId: actor?.id ?? null,
      });
    } catch (e: any) {
      this.logger.warn(`Historique média non enregistré (${type}): ${e?.message}`);
    }
  }

  /**
   * Notification aux membres de l'équipe, avec les canaux existants :
   * notification enregistrée + événement WebSocket 'notification' + push Firebase.
   */
  async notifyUsers(
    userIds: string[],
    key: string,
    params: Record<string, any>,
    data: Record<string, any>,
    type: NotificationType = NotificationType.MEDIA_ASSIGNMENT,
    lang = 'fr',
  ) {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return;
    const title = this.t(`media.notif.${key}.title`, lang, params);
    const body = this.t(`media.notif.${key}.body`, lang, params);
    const payload = { category: 'media', ...data };
    try {
      await this.notifications.sendAndSaveNotificationToUsers(ids, title, body, type, payload);
    } catch (e: any) {
      this.logger.warn(`Notification média non enregistrée: ${e?.message}`);
    }
    void this.fcm
      .sendPushToUsers(ids, title, body, { type, category: 'media', ...data }, { tag: data.sessionId ? `media-${data.sessionId}` : undefined })
      .catch((e) => this.logger.warn(`Push média: ${e?.message}`));
  }
}
