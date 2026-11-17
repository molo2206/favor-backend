// src/backOffice/chat/services/chat.service.ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, In, IsNull, Repository } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { EmployeeEntity } from 'src/backOffice/hr/employees/entities/employee.entity';
import { ChatConversationEntity } from '../entities/chat-conversation.entity';
import { ChatParticipantEntity } from '../entities/chat-participant.entity';
import { ChatMessageEntity } from '../entities/chat-message.entity';
import { ChatAttachmentEntity } from '../entities/chat-attachment.entity';
import { ChatReactionEntity } from '../entities/chat-reaction.entity';
import {
  AttachmentType,
  ConversationType,
  MessageType,
  ParticipantRole,
} from '../enums/chat.enums';
import {
  AddMembersDto,
  CreateGroupConversationDto,
  EditMessageDto,
  ListContactsQueryDto,
  ListConversationsQueryDto,
  ListMediaQueryDto,
  ListMessagesQueryDto,
  SearchMessagesQueryDto,
  SendMessageDto,
  UpdateGroupConversationDto,
  UpdateParticipantSettingsDto,
} from '../dto/chat.dto';
import { ChatRealtimeService, ChatServerEvents } from './chat-realtime.service';
// ✅ Briques existantes du projet
import { FilesService, UploadedFileDetails } from 'src/files/files.service';
import { NotificationsService } from 'src/notification/notifications.service';
import { FcmService } from 'src/notification/fcm.service';
import { PresenceService } from 'src/notification/presence.service';
import {
  CHAT_NOTIFICATION_TYPES,
  NotificationType,
} from 'src/notification/type/notification.type';
import { promises as fsp } from 'fs';

/** Utilisateur connecté (req.currentUser / socket.data) */
export interface ChatActor {
  id: string;
  fullName?: string;
  role?: string;
  image?: string;
  activeCompanyId?: string;
}

export interface ChatUserLite {
  id: string;
  fullName: string;
  image: string | null;
  email: string | null;
  phone: string | null;
}

/** Fichier stocké par FilesService, converti au format pièce jointe du chat */
interface StoredAttachment {
  type: AttachmentType;
  url: string;
  storagePath: string;
  thumbnailUrl: string | null;
  originalName: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
}

interface ChatNotifyInput {
  recipientIds: string[];
  senderId: string;
  conversationId: string;
  messageId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  imageUrl?: string | null;
  data?: Record<string, any>;
}

const ADMIN_ROLES = ['ADMIN', 'SUPER ADMIN', 'SUPER_ADMIN'];
const USER_LITE_COLUMNS = (alias: string) => [
  `${alias}.id`,
  `${alias}.fullName`,
  `${alias}.image`,
  `${alias}.email`,
  `${alias}.phone`,
];

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly employeesOnly: boolean;
  private readonly restrictToCompany: boolean;
  private readonly maxFileSize: number;
  private readonly webUrl: string;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    @InjectRepository(ChatConversationEntity)
    private readonly convRepo: Repository<ChatConversationEntity>,
    @InjectRepository(ChatParticipantEntity)
    private readonly partRepo: Repository<ChatParticipantEntity>,
    @InjectRepository(ChatMessageEntity)
    private readonly msgRepo: Repository<ChatMessageEntity>,
    @InjectRepository(ChatAttachmentEntity)
    private readonly attRepo: Repository<ChatAttachmentEntity>,
    @InjectRepository(ChatReactionEntity)
    private readonly reactionRepo: Repository<ChatReactionEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(EmployeeEntity)
    private readonly employeeRepo: Repository<EmployeeEntity>,
    private readonly realtime: ChatRealtimeService,
    private readonly filesService: FilesService,
    private readonly notificationsService: NotificationsService,
    private readonly fcmService: FcmService,
    private readonly presence: PresenceService,
  ) {
    this.maxFileSize =
      Number(this.configService.get<string>('CHAT_MAX_FILE_SIZE_MB') || 100) * 1024 * 1024;
    this.webUrl = (
      this.configService.get<string>('BACKOFFICE_WEB_URL') ||
      this.configService.get<string>('FRONTEND_URL') ||
      ''
    ).replace(/\/$/, '');
    this.employeesOnly =
      (this.configService.get<string>('CHAT_EMPLOYEES_ONLY') ?? 'true') !== 'false';
    this.restrictToCompany =
      (this.configService.get<string>('CHAT_RESTRICT_TO_COMPANY') ?? 'false') === 'true';
  }

  // =====================================================================
  // CONTACTS (employés)
  // =====================================================================
  async listContacts(actor: ChatActor, query: ListContactsQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));

    const qb = this.employeeRepo
      .createQueryBuilder('e')
      .innerJoin('e.user', 'u')
      .leftJoin('e.department', 'd')
      .select([
        'e.id',
        'e.fullName',
        'e.email',
        'e.phone',
        'e.position',
        'e.image',
        'e.status',
        'e.companyId',
        'e.branchId',
        'e.departmentId',
        'e.userId',
        'd.id',
        'd.name',
        ...USER_LITE_COLUMNS('u'),
      ])
      .where('e.userId IS NOT NULL')
      .andWhere('e.userId != :me', { me: actor.id })
      .andWhere('u.isActive = :active', { active: true })
      .andWhere('u.deleted = :deleted', { deleted: false })
      .andWhere('e.status NOT IN (:...excluded)', { excluded: ['TERMINATED', 'RETIRED'] });

    if (this.restrictToCompany && actor.activeCompanyId) {
      qb.andWhere('e.companyId = :cid', { cid: actor.activeCompanyId });
    }
    if (query.companyId) qb.andWhere('e.companyId = :qcid', { qcid: query.companyId });
    if (query.branchId) qb.andWhere('e.branchId = :bid', { bid: query.branchId });
    if (query.departmentId) qb.andWhere('e.departmentId = :did', { did: query.departmentId });
    if (query.search?.trim()) {
      const s = `%${query.search.trim()}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('e.fullName LIKE :s', { s })
            .orWhere('u.fullName LIKE :s', { s })
            .orWhere('u.email LIKE :s', { s })
            .orWhere('u.phone LIKE :s', { s })
            .orWhere('e.position LIKE :s', { s });
        }),
      );
    }
    if (query.onlineOnly) {
      const online = this.presence.getOnlineUserIds();
      if (!online.length) {
        return { data: [], meta: { total: 0, page, limit, totalPages: 0, onlineCount: 0 } };
      }
      qb.andWhere('e.userId IN (:...online)', { online });
    }

    qb.orderBy('e.fullName', 'ASC').offset((page - 1) * limit).limit(limit);
    const [rows, total] = await qb.getManyAndCount();

    // Un utilisateur peut avoir plusieurs fiches employé : dédoublonnage
    const seen = new Set<string>();
    const unique = rows.filter((r) => {
      if (!r.userId || seen.has(r.userId)) return false;
      seen.add(r.userId);
      return true;
    });

    const presence = await this.presence.getMany(unique.map((r) => r.userId!));

    const data = unique.map((e) => ({
      userId: e.userId,
      employeeId: e.id,
      fullName: e.user?.fullName || e.fullName,
      email: e.user?.email || e.email || null,
      phone: e.user?.phone || e.phone || null,
      image: e.user?.image || e.image || null,
      position: e.position ?? null,
      status: e.status,
      companyId: e.companyId ?? null,
      branchId: e.branchId ?? null,
      department: e.department ? { id: e.department.id, name: e.department.name } : null,
      presence: presence[e.userId!],
    }));

    // En ligne d'abord
    data.sort((a, b) => Number(b.presence?.isOnline) - Number(a.presence?.isOnline));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        onlineCount: this.presence.getOnlineUserIds().length,
      },
    };
  }

  /** Vérifie qu'un utilisateur peut être contacté via le chat back-office */
  private async assertChatUsers(userIds: string[]) {
    const unique = [...new Set(userIds)];
    if (!unique.length) return [];

    const users = await this.userRepo.find({
      where: { id: In(unique) },
      select: ['id', 'fullName', 'image', 'email', 'phone', 'role', 'isActive', 'deleted'],
    });
    const found = new Map(users.map((u) => [u.id, u]));

    for (const id of unique) {
      const u = found.get(id);
      if (!u || !u.isActive || u.deleted) {
        throw new BadRequestException(`Utilisateur introuvable ou inactif: ${id}`);
      }
    }

    if (this.employeesOnly) {
      const employees = await this.employeeRepo.find({
        where: { userId: In(unique) },
        select: ['id', 'userId'],
      });
      const employeeUserIds = new Set(employees.map((e) => e.userId));
      for (const id of unique) {
        const role = String(found.get(id)?.role ?? '');
        if (!employeeUserIds.has(id) && !ADMIN_ROLES.includes(role)) {
          throw new ForbiddenException(
            `${found.get(id)?.fullName ?? id} n'est pas un employé : discussion impossible`,
          );
        }
      }
    }
    return users;
  }

  // =====================================================================
  // CONVERSATIONS
  // =====================================================================
  private directKeyOf(a: string, b: string) {
    return [a, b].sort().join(':');
  }

  async getOrCreateDirect(actor: ChatActor, targetUserId: string) {
    if (targetUserId === actor.id) {
      throw new BadRequestException('Impossible de démarrer une conversation avec vous-même');
    }
    await this.assertChatUsers([targetUserId]);

    const directKey = this.directKeyOf(actor.id, targetUserId);
    let conv = await this.convRepo.findOne({ where: { directKey } });
    let created = false;

    if (!conv) {
      try {
        conv = await this.dataSource.transaction(async (em) => {
          const c = await em.save(
            em.create(ChatConversationEntity, {
              type: ConversationType.DIRECT,
              directKey,
              createdById: actor.id,
              companyId: actor.activeCompanyId ?? null,
            }),
          );
          await em.save([
            em.create(ChatParticipantEntity, {
              conversationId: c.id,
              userId: actor.id,
              role: ParticipantRole.MEMBER,
            }),
            em.create(ChatParticipantEntity, {
              conversationId: c.id,
              userId: targetUserId,
              role: ParticipantRole.MEMBER,
            }),
          ]);
          return c;
        });
        created = true;
      } catch (e: any) {
        // Course : créée en parallèle par l'autre utilisateur
        conv = await this.convRepo.findOne({ where: { directKey } });
        if (!conv) throw e;
      }
    } else {
      // Réactiver l'utilisateur s'il avait masqué la conversation
      await this.partRepo.update(
        { conversationId: conv.id, userId: actor.id },
        { isArchived: false },
      );
    }

    if (!conv) throw new NotFoundException('Conversation introuvable');
    const dto = await this.getConversation(actor, conv.id);
    if (created) {
      this.realtime.joinConversation([actor.id, targetUserId], conv.id);
      this.realtime.emitToUser(actor.id, ChatServerEvents.CONVERSATION_NEW, dto);
      // Le destinataire verra la conversation au premier message
    }
    return dto;
  }

  async createGroup(actor: ChatActor, dto: CreateGroupConversationDto, avatar?: Express.Multer.File) {
    const memberIds = [...new Set(dto.memberIds.filter((id) => id !== actor.id))];
    if (!memberIds.length) throw new BadRequestException('Ajoutez au moins un membre');
    await this.assertChatUsers(memberIds);

    const avatarUrl = avatar ? await this.uploadGroupAvatar(avatar) : null;

    const conv = await this.dataSource.transaction(async (em) => {
      const c = await em.save(
        em.create(ChatConversationEntity, {
          type: ConversationType.GROUP,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          avatar: avatarUrl,
          onlyAdminsCanWrite: !!dto.onlyAdminsCanWrite,
          createdById: actor.id,
          companyId: actor.activeCompanyId ?? null,
        }),
      );
      await em.save([
        em.create(ChatParticipantEntity, {
          conversationId: c.id,
          userId: actor.id,
          role: ParticipantRole.OWNER,
        }),
        ...memberIds.map((userId) =>
          em.create(ChatParticipantEntity, {
            conversationId: c.id,
            userId,
            role: ParticipantRole.MEMBER,
          }),
        ),
      ]);
      return c;
    });

    const allIds = [actor.id, ...memberIds];
    this.realtime.joinConversation(allIds, conv.id);

    await this.createSystemMessage(conv.id, actor, `${actor.fullName ?? 'Un utilisateur'} a créé le groupe « ${conv.name} »`, {
      action: 'GROUP_CREATED',
      actorId: actor.id,
    });

    for (const uid of allIds) {
      const view = await this.getConversation({ id: uid }, conv.id);
      this.realtime.emitToUser(uid, ChatServerEvents.CONVERSATION_NEW, view);
    }

    await this.notifyUsers({
      recipientIds: memberIds,
      senderId: actor.id,
      conversationId: conv.id,
      type: NotificationType.CHAT_GROUP_ADDED,
      title: conv.name ?? 'Nouveau groupe',
      body: `${actor.fullName ?? 'Un collègue'} vous a ajouté au groupe`,
      imageUrl: avatarUrl,
    });

    return this.getConversation(actor, conv.id);
  }

  async updateGroup(
    actor: ChatActor,
    conversationId: string,
    dto: UpdateGroupConversationDto,
    avatar?: Express.Multer.File,
  ) {
    const { conversation } = await this.assertGroupAdmin(actor.id, conversationId);
    const changes: string[] = [];

    if (dto.name !== undefined && dto.name.trim() && dto.name.trim() !== conversation.name) {
      conversation.name = dto.name.trim();
      changes.push(`a renommé le groupe en « ${conversation.name} »`);
    }
    if (dto.description !== undefined) {
      conversation.description = dto.description.trim() || null;
      changes.push('a modifié la description');
    }
    if (dto.onlyAdminsCanWrite !== undefined) {
      conversation.onlyAdminsCanWrite = dto.onlyAdminsCanWrite;
      changes.push(
        dto.onlyAdminsCanWrite
          ? 'a limité l’envoi de messages aux administrateurs'
          : 'a autorisé tous les membres à écrire',
      );
    }
    if (avatar) {
      const previous = conversation.avatar;
      conversation.avatar = await this.uploadGroupAvatar(avatar);
      if (previous) await this.filesService.deleteFileByUrl(previous);
      changes.push('a changé la photo du groupe');
    }

    await this.convRepo.save(conversation);

    for (const change of changes) {
      await this.createSystemMessage(conversationId, actor, `${actor.fullName ?? 'Un administrateur'} ${change}`, {
        action: 'GROUP_UPDATED',
        actorId: actor.id,
      });
    }

    await this.emitConversationUpdated(conversationId);
    return this.getConversation(actor, conversationId);
  }

  async addMembers(actor: ChatActor, conversationId: string, dto: AddMembersDto) {
    const { conversation } = await this.assertGroupAdmin(actor.id, conversationId);
    const ids = [...new Set(dto.memberIds)].filter((id) => id !== actor.id);
    if (!ids.length) throw new BadRequestException('Aucun membre à ajouter');
    const users = await this.assertChatUsers(ids);

    const existing = await this.partRepo.find({
      where: { conversationId, userId: In(ids) },
    });
    const existingMap = new Map(existing.map((p) => [p.userId, p]));
    const added: string[] = [];

    for (const userId of ids) {
      const p = existingMap.get(userId);
      if (p && !p.leftAt) continue;
      if (p) {
        p.leftAt = null;
        p.role = ParticipantRole.MEMBER;
        p.unreadCount = 0;
        p.clearedAt = new Date(); // ne voit pas l'historique pendant son absence
        await this.partRepo.save(p);
      } else {
        await this.partRepo.save(
          this.partRepo.create({ conversationId, userId, role: ParticipantRole.MEMBER }),
        );
      }
      added.push(userId);
    }

    if (!added.length) return this.getConversation(actor, conversationId);

    this.realtime.joinConversation(added, conversationId);
    const names = users.filter((u) => added.includes(u.id)).map((u) => u.fullName).join(', ');
    await this.createSystemMessage(conversationId, actor, `${actor.fullName ?? 'Un administrateur'} a ajouté ${names}`, {
      action: 'MEMBERS_ADDED',
      actorId: actor.id,
      targetIds: added,
    });

    for (const uid of added) {
      const view = await this.getConversation({ id: uid }, conversationId);
      this.realtime.emitToUser(uid, ChatServerEvents.CONVERSATION_NEW, view);
    }
    await this.emitConversationUpdated(conversationId);

    await this.notifyUsers({
      recipientIds: added,
      senderId: actor.id,
      conversationId,
      type: NotificationType.CHAT_GROUP_ADDED,
      title: conversation.name ?? 'Groupe',
      body: `${actor.fullName ?? 'Un collègue'} vous a ajouté au groupe`,
      imageUrl: conversation.avatar,
    });

    return this.getConversation(actor, conversationId);
  }

  async removeMember(actor: ChatActor, conversationId: string, userId: string) {
    if (userId === actor.id) return this.leaveGroup(actor, conversationId);
    const { conversation, participant: me } = await this.assertGroupAdmin(actor.id, conversationId);

    const target = await this.partRepo.findOne({
      where: { conversationId, userId, leftAt: IsNull() },
      relations: ['user'],
    });
    if (!target) throw new NotFoundException('Membre introuvable');
    if (target.role === ParticipantRole.OWNER) {
      throw new ForbiddenException('Le créateur du groupe ne peut pas être retiré');
    }
    if (target.role === ParticipantRole.ADMIN && me.role !== ParticipantRole.OWNER) {
      throw new ForbiddenException('Seul le créateur peut retirer un administrateur');
    }

    target.leftAt = new Date();
    target.unreadCount = 0;
    await this.partRepo.save(target);

    await this.createSystemMessage(
      conversationId,
      actor,
      `${actor.fullName ?? 'Un administrateur'} a retiré ${target.user?.fullName ?? 'un membre'}`,
      { action: 'MEMBER_REMOVED', actorId: actor.id, targetIds: [userId] },
    );

    this.realtime.leaveConversation([userId], conversationId);
    this.realtime.emitToUser(userId, ChatServerEvents.CONVERSATION_REMOVED, {
      conversationId,
      reason: 'REMOVED',
    });
    await this.emitConversationUpdated(conversationId);

    await this.notifyUsers({
      recipientIds: [userId],
      senderId: actor.id,
      conversationId,
      type: NotificationType.CHAT_GROUP_REMOVED,
      title: conversation.name ?? 'Groupe',
      body: `${actor.fullName ?? 'Un administrateur'} vous a retiré du groupe`,
    });

    return { success: true };
  }

  async leaveGroup(actor: ChatActor, conversationId: string) {
    const { conversation, participant } = await this.assertParticipant(actor.id, conversationId);
    if (conversation.type !== ConversationType.GROUP) {
      throw new BadRequestException('Impossible de quitter une conversation directe');
    }

    // Transfert de propriété si le créateur part
    if (participant.role === ParticipantRole.OWNER) {
      const successor =
        (await this.partRepo.findOne({
          where: { conversationId, leftAt: IsNull(), role: ParticipantRole.ADMIN },
          order: { joinedAt: 'ASC' },
        })) ??
        (await this.partRepo
          .createQueryBuilder('p')
          .where('p.conversationId = :cid', { cid: conversationId })
          .andWhere('p.leftAt IS NULL')
          .andWhere('p.userId != :me', { me: actor.id })
          .orderBy('p.joinedAt', 'ASC')
          .getOne());
      if (successor) {
        successor.role = ParticipantRole.OWNER;
        await this.partRepo.save(successor);
      }
    }

    participant.leftAt = new Date();
    participant.unreadCount = 0;
    participant.role = ParticipantRole.MEMBER;
    await this.partRepo.save(participant);

    await this.createSystemMessage(conversationId, actor, `${actor.fullName ?? 'Un membre'} a quitté le groupe`, {
      action: 'MEMBER_LEFT',
      actorId: actor.id,
    });

    this.realtime.leaveConversation([actor.id], conversationId);
    this.realtime.emitToUser(actor.id, ChatServerEvents.CONVERSATION_REMOVED, {
      conversationId,
      reason: 'LEFT',
    });
    await this.emitConversationUpdated(conversationId);
    return { success: true };
  }

  async changeMemberRole(actor: ChatActor, conversationId: string, userId: string, role: ParticipantRole) {
    const { participant: me } = await this.assertGroupAdmin(actor.id, conversationId);
    if (role === ParticipantRole.OWNER && me.role !== ParticipantRole.OWNER) {
      throw new ForbiddenException('Seul le créateur peut transférer la propriété');
    }
    const target = await this.partRepo.findOne({
      where: { conversationId, userId, leftAt: IsNull() },
      relations: ['user'],
    });
    if (!target) throw new NotFoundException('Membre introuvable');
    if (target.role === ParticipantRole.OWNER && me.role !== ParticipantRole.OWNER) {
      throw new ForbiddenException('Impossible de modifier le rôle du créateur');
    }

    if (role === ParticipantRole.OWNER) {
      me.role = ParticipantRole.ADMIN;
      await this.partRepo.save(me);
    }
    target.role = role;
    await this.partRepo.save(target);

    const label = role === ParticipantRole.MEMBER ? 'membre' : role === ParticipantRole.ADMIN ? 'administrateur' : 'propriétaire';
    await this.createSystemMessage(
      conversationId,
      actor,
      `${actor.fullName ?? 'Un administrateur'} a défini ${target.user?.fullName ?? 'un membre'} comme ${label}`,
      { action: 'ROLE_CHANGED', actorId: actor.id, targetIds: [userId], role },
    );
    await this.emitConversationUpdated(conversationId);
    return this.getConversation(actor, conversationId);
  }

  async updateMySettings(actor: ChatActor, conversationId: string, dto: UpdateParticipantSettingsDto) {
    const { participant } = await this.assertParticipant(actor.id, conversationId);
    if (dto.isMuted !== undefined) participant.isMuted = dto.isMuted;
    if (dto.isArchived !== undefined) participant.isArchived = dto.isArchived;
    if (dto.isPinned !== undefined) participant.isPinned = dto.isPinned;
    await this.partRepo.save(participant);
    const view = await this.getConversation(actor, conversationId);
    this.realtime.emitToUser(actor.id, ChatServerEvents.CONVERSATION_UPDATED, view);
    return view;
  }

  /** Vide l'historique pour moi uniquement */
  async clearConversation(actor: ChatActor, conversationId: string) {
    const { participant } = await this.assertParticipant(actor.id, conversationId);
    participant.clearedAt = new Date();
    participant.unreadCount = 0;
    await this.partRepo.save(participant);
    await this.markConversationNotificationsRead(actor.id, conversationId);
    const view = await this.getConversation(actor, conversationId);
    this.realtime.emitToUser(actor.id, ChatServerEvents.CONVERSATION_UPDATED, view);
    return view;
  }

  /** Supprime la conversation de ma liste (historique vidé + archivée) */
  async deleteConversationForMe(actor: ChatActor, conversationId: string) {
    const { participant } = await this.assertParticipant(actor.id, conversationId);
    participant.clearedAt = new Date();
    participant.unreadCount = 0;
    participant.isArchived = true;
    await this.partRepo.save(participant);
    await this.markConversationNotificationsRead(actor.id, conversationId);
    this.realtime.emitToUser(actor.id, ChatServerEvents.CONVERSATION_REMOVED, {
      conversationId,
      reason: 'DELETED',
    });
    return { success: true };
  }

  async listConversations(actor: ChatActor, query: ListConversationsQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 30));

    const qb = this.partRepo
      .createQueryBuilder('me')
      .innerJoinAndSelect('me.conversation', 'c')
      .where('me.userId = :uid', { uid: actor.id })
      .andWhere('me.leftAt IS NULL')
      .andWhere('me.isArchived = :arch', { arch: !!query.archived });

    // On masque les conversations directes sans message (créées mais jamais utilisées)
    qb.andWhere(
      new Brackets((w) => {
        w.where('c.type = :group', { group: ConversationType.GROUP })
          .orWhere('c.lastMessageAt IS NOT NULL')
          .orWhere('c.createdById = :uid', { uid: actor.id });
      }),
    );

    if (query.search?.trim()) {
      const s = `%${query.search.trim()}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('c.name LIKE :s', { s }).orWhere(
            `EXISTS (SELECT 1 FROM bo_chat_participants op INNER JOIN users ou ON ou.id = op.userId
              WHERE op.conversationId = c.id AND op.userId != :uid AND ou.fullName LIKE :s)`,
            { s, uid: actor.id },
          );
        }),
      );
    }

    qb.orderBy('me.isPinned', 'DESC')
      .addOrderBy('COALESCE(c.lastMessageAt, c.createdAt)', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit);

    const [mine, total] = await qb.getManyAndCount();
    const data = await this.buildConversationViews(actor.id, mine);
    const totalUnread = await this.getTotalUnread(actor.id);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit), totalUnread },
    };
  }

  async getConversation(actor: Pick<ChatActor, 'id'>, conversationId: string) {
    const me = await this.partRepo.findOne({
      where: { conversationId, userId: actor.id },
      relations: ['conversation'],
    });
    if (!me || !me.conversation) throw new NotFoundException('Conversation introuvable');
    const [view] = await this.buildConversationViews(actor.id, [me], true);
    return view;
  }

  /** Construit la vue d'une liste de conversations pour un utilisateur */
  private async buildConversationViews(
    userId: string,
    mine: ChatParticipantEntity[],
    withAllMembers = false,
  ) {
    if (!mine.length) return [];
    const convIds = mine.map((p) => p.conversationId);

    const participants = await this.partRepo
      .createQueryBuilder('p')
      .leftJoin('p.user', 'u')
      .addSelect(USER_LITE_COLUMNS('u'))
      .where('p.conversationId IN (:...convIds)', { convIds })
      .andWhere('p.leftAt IS NULL')
      .getMany();

    const lastIds = mine.map((p) => p.conversation?.lastMessageId).filter(Boolean) as string[];
    const lastMessages = lastIds.length
      ? await this.msgRepo
          .createQueryBuilder('m')
          .leftJoin('m.sender', 's')
          .addSelect(USER_LITE_COLUMNS('s'))
          .leftJoinAndSelect('m.attachments', 'a')
          .where('m.id IN (:...lastIds)', { lastIds })
          .getMany()
      : [];
    const lastById = new Map(lastMessages.map((m) => [m.id, m]));

    const presence = await this.presence.getMany(participants.map((p) => p.userId));

    return mine.map((me) => {
      const c = me.conversation!;
      const members = participants.filter((p) => p.conversationId === c.id);
      const others = members.filter((p) => p.userId !== userId);
      const last = c.lastMessageId ? lastById.get(c.lastMessageId) : undefined;
      const lastVisible =
        last &&
        !(me.clearedAt && last.createdAt <= me.clearedAt) &&
        !(last.hiddenFor ?? []).includes(userId)
          ? last
          : undefined;

      const peer = c.type === ConversationType.DIRECT ? others[0] : undefined;

      return {
        id: c.id,
        type: c.type,
        name: c.type === ConversationType.DIRECT ? peer?.user?.fullName ?? 'Utilisateur' : c.name,
        description: c.description ?? null,
        avatar: c.type === ConversationType.DIRECT ? peer?.user?.image ?? null : c.avatar ?? null,
        onlyAdminsCanWrite: c.onlyAdminsCanWrite,
        createdById: c.createdById ?? null,
        createdAt: c.createdAt,
        lastMessageAt: c.lastMessageAt ?? null,
        lastMessage: lastVisible ? this.serializeMessage(lastVisible, userId, others) : null,
        peer: peer
          ? { ...this.userLite(peer.user), presence: presence[peer.userId] }
          : null,
        membersCount: members.length,
        onlineCount: members.filter((m) => presence[m.userId]?.isOnline).length,
        members: withAllMembers || c.type === ConversationType.DIRECT
          ? members.map((m) => ({
              userId: m.userId,
              role: m.role,
              joinedAt: m.joinedAt,
              lastReadAt: m.lastReadAt ?? null,
              lastDeliveredAt: m.lastDeliveredAt ?? null,
              user: this.userLite(m.user),
              presence: presence[m.userId],
            }))
          : undefined,
        me: {
          role: me.role,
          unreadCount: me.unreadCount,
          isMuted: me.isMuted,
          isArchived: me.isArchived,
          isPinned: me.isPinned,
          lastReadAt: me.lastReadAt ?? null,
          clearedAt: me.clearedAt ?? null,
          canWrite:
            !me.leftAt &&
            (!c.onlyAdminsCanWrite ||
              me.role === ParticipantRole.ADMIN ||
              me.role === ParticipantRole.OWNER),
          hasLeft: !!me.leftAt,
        },
      };
    });
  }

  async getTotalUnread(userId: string): Promise<number> {
    const raw = await this.partRepo
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.unreadCount), 0)', 'total')
      .where('p.userId = :userId', { userId })
      .andWhere('p.leftAt IS NULL')
      .getRawOne<{ total: string }>();
    return Number(raw?.total ?? 0);
  }

  /** État envoyé au client à la connexion (événement chat:ready) */
  async getInitialState(userId: string) {
    const [totalUnread, notifications] = await Promise.all([
      this.getTotalUnread(userId),
      this.notificationsService.getUnreadCount(userId, CHAT_NOTIFICATION_TYPES),
    ]);
    return {
      userId,
      totalUnread,
      notificationsUnread: notifications.count,
      online: this.presence.getOnlineSnapshot(),
      serverTime: new Date().toISOString(),
    };
  }

  /** Conversations actives d'un utilisateur (pour rejoindre les rooms au connect) */
  async getConversationIdsOf(userId: string): Promise<string[]> {
    const rows = await this.partRepo.find({
      where: { userId, leftAt: IsNull() },
      select: ['conversationId'],
    });
    return rows.map((r) => r.conversationId);
  }

  // =====================================================================
  // MESSAGES
  // =====================================================================
  async listMessages(actor: ChatActor, conversationId: string, query: ListMessagesQueryDto) {
    const { participant } = await this.assertParticipant(actor.id, conversationId, true);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 30));

    // Pagination par curseur sur les ids (évite les doublons dus aux jointures)
    const idQb = this.msgRepo
      .createQueryBuilder('m')
      .select(['m.id', 'm.createdAt'])
      .where('m.conversationId = :cid', { cid: conversationId });

    if (participant.clearedAt) idQb.andWhere('m.createdAt > :cleared', { cleared: participant.clearedAt });
    // Un ancien membre ne voit pas les messages postérieurs à son départ
    if (participant.leftAt) idQb.andWhere('m.createdAt <= :left', { left: participant.leftAt });

    let ascending = false;
    if (query.before) {
      const ref = await this.msgRepo.findOne({ where: { id: query.before }, select: ['id', 'createdAt'] });
      if (ref) idQb.andWhere('m.createdAt < :refDate', { refDate: ref.createdAt });
    } else if (query.after) {
      const ref = await this.msgRepo.findOne({ where: { id: query.after }, select: ['id', 'createdAt'] });
      if (ref) idQb.andWhere('m.createdAt > :refDate', { refDate: ref.createdAt });
      ascending = true;
    }

    const idRows = await idQb
      .orderBy('m.createdAt', ascending ? 'ASC' : 'DESC')
      .limit(limit + 1)
      .getMany();

    const hasMore = idRows.length > limit;
    const ids = idRows.slice(0, limit).map((r) => r.id);
    if (!ids.length) return { data: [], meta: { hasMore: false, limit } };

    const messages = await this.baseMessageQuery()
      .where('m.id IN (:...ids)', { ids })
      .orderBy('m.createdAt', 'ASC')
      .getMany();

    const others = await this.partRepo.find({
      where: { conversationId, leftAt: IsNull() },
    });
    const othersOnly = others.filter((p) => p.userId !== actor.id);

    const data = messages
      .filter((m) => !(m.hiddenFor ?? []).includes(actor.id))
      .map((m) => this.serializeMessage(m, actor.id, othersOnly));

    return {
      data,
      meta: {
        hasMore,
        limit,
        oldestId: data[0]?.id ?? null,
        newestId: data[data.length - 1]?.id ?? null,
      },
    };
  }

  async getMessage(actor: ChatActor, messageId: string) {
    const m = await this.baseMessageQuery().where('m.id = :id', { id: messageId }).getOne();
    if (!m) throw new NotFoundException('Message introuvable');
    await this.assertParticipant(actor.id, m.conversationId, true);
    const others = (await this.partRepo.find({ where: { conversationId: m.conversationId, leftAt: IsNull() } }))
      .filter((p) => p.userId !== actor.id);
    return this.serializeMessage(m, actor.id, others);
  }

  /** Infos de lecture d'un message (groupe : "Vu par") */
  async getMessageInfo(actor: ChatActor, messageId: string) {
    const m = await this.msgRepo.findOne({ where: { id: messageId } });
    if (!m) throw new NotFoundException('Message introuvable');
    await this.assertParticipant(actor.id, m.conversationId, true);

    const parts = await this.partRepo
      .createQueryBuilder('p')
      .leftJoin('p.user', 'u')
      .addSelect(USER_LITE_COLUMNS('u'))
      .where('p.conversationId = :cid', { cid: m.conversationId })
      .andWhere('p.leftAt IS NULL')
      .andWhere('p.userId != :sender', { sender: m.senderId ?? '' })
      .getMany();

    return {
      messageId,
      readBy: parts
        .filter((p) => p.lastReadAt && p.lastReadAt >= m.createdAt)
        .map((p) => ({ user: this.userLite(p.user), at: p.lastReadAt })),
      deliveredTo: parts
        .filter(
          (p) =>
            p.lastDeliveredAt &&
            p.lastDeliveredAt >= m.createdAt &&
            !(p.lastReadAt && p.lastReadAt >= m.createdAt),
        )
        .map((p) => ({ user: this.userLite(p.user), at: p.lastDeliveredAt })),
      pending: parts
        .filter((p) => !(p.lastDeliveredAt && p.lastDeliveredAt >= m.createdAt))
        .map((p) => ({ user: this.userLite(p.user) })),
    };
  }

  /**
   * Envoi d'un message (texte et/ou fichiers : images, vidéos, audios, PDF, documents).
   * Utilisé par l'API REST (multipart) et par le socket (texte uniquement).
   */
  async sendMessage(
    actor: ChatActor,
    conversationId: string,
    dto: SendMessageDto,
    files: Express.Multer.File[] = [],
  ) {
    const content = dto.content?.trim() || null;
    if (!content && !files.length) {
      await this.cleanupTemp(files);
      throw new BadRequestException('Message vide');
    }

    let conversation: ChatConversationEntity;
    let participant: ChatParticipantEntity;
    try {
      ({ conversation, participant } = await this.assertParticipant(actor.id, conversationId));
    } catch (e) {
      await this.cleanupTemp(files);
      throw e;
    }

    if (
      conversation.onlyAdminsCanWrite &&
      participant.role !== ParticipantRole.ADMIN &&
      participant.role !== ParticipantRole.OWNER
    ) {
      await this.cleanupTemp(files);
      throw new ForbiddenException('Seuls les administrateurs peuvent écrire dans ce groupe');
    }

    // Idempotence (retry réseau)
    if (dto.clientMessageId) {
      const dup = await this.msgRepo.findOne({
        where: { senderId: actor.id, clientMessageId: dto.clientMessageId },
      });
      if (dup) {
        await this.cleanupTemp(files);
        return this.getMessage(actor, dup.id);
      }
    }

    // Réponse
    let replyTo: ChatMessageEntity | null = null;
    if (dto.replyToId) {
      replyTo = await this.msgRepo.findOne({ where: { id: dto.replyToId, conversationId } });
      if (!replyTo) {
        await this.cleanupTemp(files);
        throw new BadRequestException('Message cité introuvable');
      }
    }

    // Stockage des fichiers
    // ✅ FilesService existant : optimisation images (webp + miniature),
    //    compression vidéo (ffmpeg 480p + miniature), audios / PDF / documents conservés
    let stored: StoredAttachment[] = [];
    if (files.length) {
      const details = await this.filesService.uploadFilesDetailed(files, this.chatFolder(), {
        maxSize: this.maxFileSize,
        compressVideo: this.configService.get<string>('CHAT_COMPRESS_VIDEO') !== 'false',
      });
      stored = details.map((d) => this.toStoredAttachment(d));
    }

    const type = this.resolveMessageType(stored);

    // Mentions : uniquement des membres de la conversation
    let mentions: string[] | null = null;
    if (dto.mentions?.length) {
      const members = await this.partRepo.find({
        where: { conversationId, userId: In(dto.mentions), leftAt: IsNull() },
        select: ['userId'],
      });
      mentions = members.map((m) => m.userId).filter((id) => id !== actor.id);
      if (!mentions.length) mentions = null;
    }

    let saved: ChatMessageEntity;
    try {
      saved = await this.dataSource.transaction(async (em) => {
        const message = await em.save(
          em.create(ChatMessageEntity, {
            conversationId,
            senderId: actor.id,
            type,
            content,
            clientMessageId: dto.clientMessageId ?? null,
            replyToId: replyTo?.id ?? null,
            mentions,
          }),
        );

        if (stored.length) {
          const audioCount = stored.filter((s) => s.type === AttachmentType.AUDIO).length;
          await em.save(
            stored.map((s, idx) =>
              em.create(ChatAttachmentEntity, {
                messageId: message.id,
                conversationId,
                type: s.type,
                url: s.url,
                storagePath: s.storagePath,
                thumbnailUrl: s.thumbnailUrl,
                originalName: s.originalName,
                mimeType: s.mimeType,
                size: s.size,
                width: s.width,
                height: s.height,
                duration: dto.durations?.[idx] ?? s.duration ?? null,
                waveform: audioCount === 1 && s.type === AttachmentType.AUDIO ? dto.waveform ?? null : null,
              }),
            ),
          );
        }

        await em.update(ChatConversationEntity, { id: conversationId }, {
          lastMessageId: message.id,
          lastMessageAt: message.createdAt,
        });

        // Non lus +1 pour les autres membres actifs, réaffichage si archivée
        await em
          .createQueryBuilder()
          .update(ChatParticipantEntity)
          .set({ unreadCount: () => 'unreadCount + 1', isArchived: false })
          .where('conversationId = :cid', { cid: conversationId })
          .andWhere('userId != :me', { me: actor.id })
          .andWhere('leftAt IS NULL')
          .execute();

        // L'expéditeur a lu sa propre conversation
        await em.update(
          ChatParticipantEntity,
          { conversationId, userId: actor.id },
          { unreadCount: 0, lastReadAt: message.createdAt, lastReadMessageId: message.id, lastDeliveredAt: message.createdAt },
        );

        return message;
      });
    } catch (e: any) {
      for (const s of stored) await this.filesService.deleteFileByUrl(s.url);
      // Doublon clientMessageId en parallèle
      if (dto.clientMessageId && String(e?.code) === 'ER_DUP_ENTRY') {
        const dup = await this.msgRepo.findOne({
          where: { senderId: actor.id, clientMessageId: dto.clientMessageId },
        });
        if (dup) return this.getMessage(actor, dup.id);
      }
      throw e;
    }

    await this.afterMessageCreated(actor, conversation, saved.id, replyTo);
    return this.getMessage(actor, saved.id);
  }

  /** Diffusion temps réel + accusés + notifications après création */
  private async afterMessageCreated(
    actor: ChatActor,
    conversation: ChatConversationEntity,
    messageId: string,
    replyTo: ChatMessageEntity | null,
  ) {
    const conversationId = conversation.id;
    const message = await this.baseMessageQuery().where('m.id = :id', { id: messageId }).getOne();
    if (!message) return;

    const members = await this.partRepo.find({ where: { conversationId, leftAt: IsNull() } });
    const recipients = members.filter((p) => p.userId !== actor.id);

    // Les destinataires qui n'avaient jamais vu cette conversation directe la reçoivent
    if (conversation.type === ConversationType.DIRECT && !conversation.lastMessageId) {
      for (const r of recipients) {
        const view = await this.getConversation({ id: r.userId }, conversationId);
        this.realtime.emitToUser(r.userId, ChatServerEvents.CONVERSATION_NEW, view);
      }
    }

    // Message pour chaque destinataire (statut calculé selon son point de vue)
    this.realtime.emitToConversation(
      conversationId,
      ChatServerEvents.MESSAGE_NEW,
      { conversationId, message: this.serializeMessage(message, '', recipients) },
    );

    // "Distribué" immédiat pour les destinataires connectés
    const onlineRecipients = recipients.filter((r) => this.presence.isOnline(r.userId));
    if (onlineRecipients.length) {
      const now = new Date();
      await this.partRepo.update(
        { conversationId, userId: In(onlineRecipients.map((r) => r.userId)) },
        { lastDeliveredAt: now },
      );
      for (const r of onlineRecipients) {
        this.realtime.emitToConversation(conversationId, ChatServerEvents.DELIVERED, {
          conversationId,
          userId: r.userId,
          at: now,
        });
      }
    }

    // Compteurs non lus
    if (!recipients.length) return;
    const refreshed = await this.partRepo.find({
      where: { conversationId, userId: In(recipients.map((r) => r.userId)) },
      select: ['userId', 'unreadCount'],
    });
    for (const r of refreshed) {
      this.realtime.emitToUser(r.userId, ChatServerEvents.UNREAD, {
        conversationId,
        unreadCount: r.unreadCount,
        totalUnread: await this.getTotalUnread(r.userId),
      });
    }

    // Notifications stockées (+ push Firebase hors ligne)
    const viewers = await this.realtime.getViewers(conversationId);
    const preview = this.previewText(message);
    const title =
      conversation.type === ConversationType.GROUP
        ? `${conversation.name ?? 'Groupe'}`
        : actor.fullName ?? 'Nouveau message';
    const prefix = conversation.type === ConversationType.GROUP ? `${actor.fullName ?? ''}: ` : '';
    const imageUrl =
      message.attachments?.find((a) => a.type === AttachmentType.IMAGE)?.thumbnailUrl ?? null;

    const mentionSet = new Set(message.mentions ?? []);
    const groups: Partial<Record<NotificationType, string[]>> = {};

    for (const r of recipients) {
      if (viewers.has(r.userId)) continue; // conversation ouverte → pas de notification
      let kind = NotificationType.CHAT_MESSAGE;
      if (mentionSet.has(r.userId)) kind = NotificationType.CHAT_MENTION;
      else if (replyTo?.senderId === r.userId) kind = NotificationType.CHAT_REPLY;
      if (r.isMuted && kind === NotificationType.CHAT_MESSAGE) continue; // sourdine
      (groups[kind] ??= []).push(r.userId);
    }

    for (const [kind, ids] of Object.entries(groups) as [NotificationType, string[]][]) {
      const body =
        kind === NotificationType.CHAT_MENTION
          ? `${actor.fullName ?? 'Quelqu’un'} vous a mentionné : ${preview}`
          : kind === NotificationType.CHAT_REPLY
            ? `${actor.fullName ?? 'Quelqu’un'} a répondu : ${preview}`
            : `${prefix}${preview}`;
      await this.notifyUsers({
        recipientIds: ids,
        senderId: actor.id,
        conversationId,
        messageId,
        type: kind,
        title,
        body,
        imageUrl,
        data: {
          conversationType: conversation.type,
          messageType: message.type,
          senderName: actor.fullName ?? null,
          senderImage: actor.image ?? null,
        },
      });
    }
  }

  async editMessage(actor: ChatActor, messageId: string, dto: EditMessageDto) {
    const m = await this.msgRepo.findOne({ where: { id: messageId } });
    if (!m) throw new NotFoundException('Message introuvable');
    if (m.senderId !== actor.id) throw new ForbiddenException('Vous ne pouvez modifier que vos messages');
    if (m.isDeleted) throw new BadRequestException('Message supprimé');
    if (m.type === MessageType.SYSTEM) throw new BadRequestException('Message système non modifiable');
    await this.assertParticipant(actor.id, m.conversationId);

    const maxHours = Number(this.configService.get<string>('CHAT_EDIT_WINDOW_HOURS') || 48);
    if (Date.now() - new Date(m.createdAt).getTime() > maxHours * 3600 * 1000) {
      throw new BadRequestException(`Modification impossible après ${maxHours}h`);
    }

    const content = dto.content.trim();
    if (!content && m.type === MessageType.TEXT) throw new BadRequestException('Message vide');

    m.content = content || null;
    m.isEdited = true;
    m.editedAt = new Date();
    await this.msgRepo.save(m);

    const view = await this.getMessage(actor, m.id);
    this.realtime.emitToConversation(m.conversationId, ChatServerEvents.MESSAGE_UPDATED, {
      conversationId: m.conversationId,
      message: view,
    });
    return view;
  }

  /**
   * Suppression :
   *  - forEveryone=true : expéditeur (ou admin du groupe) → contenu + fichiers supprimés
   *  - forEveryone=false : masqué uniquement pour moi
   */
  async deleteMessage(actor: ChatActor, messageId: string, forEveryone: boolean) {
    const m = await this.msgRepo.findOne({ where: { id: messageId }, relations: ['attachments'] });
    if (!m) throw new NotFoundException('Message introuvable');
    const { participant, conversation } = await this.assertParticipant(actor.id, m.conversationId, true);

    if (!forEveryone) {
      const hidden = new Set(m.hiddenFor ?? []);
      hidden.add(actor.id);
      m.hiddenFor = [...hidden];
      await this.msgRepo.save(m);
      this.realtime.emitToUser(actor.id, ChatServerEvents.MESSAGE_DELETED, {
        conversationId: m.conversationId,
        messageId: m.id,
        forEveryone: false,
      });
      return { success: true };
    }

    const isGroupAdmin =
      conversation.type === ConversationType.GROUP &&
      (participant.role === ParticipantRole.ADMIN || participant.role === ParticipantRole.OWNER);
    if (m.senderId !== actor.id && !isGroupAdmin) {
      throw new ForbiddenException('Vous ne pouvez supprimer pour tous que vos propres messages');
    }

    // Fichiers physiques (sauf s'ils sont partagés par un transfert)
    for (const a of m.attachments ?? []) {
      const usages = await this.attRepo.count({ where: { url: a.url } });
      if (usages <= 1) await this.filesService.deleteFileByUrl(a.url);
    }
    await this.attRepo.delete({ messageId: m.id });
    await this.reactionRepo.delete({ messageId: m.id });

    m.isDeleted = true;
    m.deletedAt = new Date();
    m.content = null;
    m.mentions = null;
    m.isPinned = false;
    await this.msgRepo.save(m);

    this.realtime.emitToConversation(m.conversationId, ChatServerEvents.MESSAGE_DELETED, {
      conversationId: m.conversationId,
      messageId: m.id,
      forEveryone: true,
      deletedBy: actor.id,
    });
    return { success: true };
  }

  /** Ajoute / retire une réaction (toggle) */
  async toggleReaction(actor: ChatActor, messageId: string, emoji: string) {
    const m = await this.msgRepo.findOne({ where: { id: messageId } });
    if (!m || m.isDeleted) throw new NotFoundException('Message introuvable');
    await this.assertParticipant(actor.id, m.conversationId);

    const existing = await this.reactionRepo.findOne({ where: { messageId, userId: actor.id, emoji } });
    let added = false;
    if (existing) {
      await this.reactionRepo.delete({ id: existing.id });
    } else {
      // Une seule réaction par utilisateur (comportement WhatsApp)
      await this.reactionRepo.delete({ messageId, userId: actor.id });
      await this.reactionRepo.save(this.reactionRepo.create({ messageId, userId: actor.id, emoji }));
      added = true;
    }

    const reactions = await this.reactionRepo
      .createQueryBuilder('r')
      .leftJoin('r.user', 'u')
      .addSelect(USER_LITE_COLUMNS('u'))
      .where('r.messageId = :messageId', { messageId })
      .getMany();

    const payload = {
      conversationId: m.conversationId,
      messageId,
      reactions: this.summarizeReactions(reactions, ''),
      actorId: actor.id,
      emoji,
      added,
    };
    this.realtime.emitToConversation(m.conversationId, ChatServerEvents.MESSAGE_REACTION, payload);

    if (added && m.senderId && m.senderId !== actor.id) {
      await this.notifyUsers({
        recipientIds: [m.senderId],
        senderId: actor.id,
        conversationId: m.conversationId,
        messageId,
        type: NotificationType.CHAT_REACTION,
        title: actor.fullName ?? 'Réaction',
        body: `${emoji} à votre message : ${this.previewText(m)}`,
      });
    }

    return { ...payload, reactions: this.summarizeReactions(reactions, actor.id) };
  }

  async togglePin(actor: ChatActor, messageId: string) {
    const m = await this.msgRepo.findOne({ where: { id: messageId } });
    if (!m || m.isDeleted) throw new NotFoundException('Message introuvable');
    const { conversation, participant } = await this.assertParticipant(actor.id, m.conversationId);
    if (
      conversation.type === ConversationType.GROUP &&
      participant.role === ParticipantRole.MEMBER
    ) {
      throw new ForbiddenException('Seuls les administrateurs peuvent épingler');
    }
    m.isPinned = !m.isPinned;
    await this.msgRepo.save(m);
    this.realtime.emitToConversation(m.conversationId, ChatServerEvents.MESSAGE_PINNED, {
      conversationId: m.conversationId,
      messageId: m.id,
      isPinned: m.isPinned,
      by: actor.id,
    });
    return { messageId: m.id, isPinned: m.isPinned };
  }

  async listPinned(actor: ChatActor, conversationId: string) {
    await this.assertParticipant(actor.id, conversationId, true);
    const messages = await this.baseMessageQuery()
      .where('m.conversationId = :cid', { cid: conversationId })
      .andWhere('m.isPinned = :p', { p: true })
      .orderBy('m.createdAt', 'DESC')
      .getMany();
    return messages.map((m) => this.serializeMessage(m, actor.id, []));
  }

  /** Transfère un message vers une ou plusieurs conversations */
  async forwardMessage(actor: ChatActor, messageId: string, conversationIds: string[]) {
    const source = await this.msgRepo.findOne({ where: { id: messageId }, relations: ['attachments'] });
    if (!source || source.isDeleted) throw new NotFoundException('Message introuvable');
    await this.assertParticipant(actor.id, source.conversationId, true);

    const results: any[] = [];
    for (const cid of [...new Set(conversationIds)]) {
      const { conversation, participant } = await this.assertParticipant(actor.id, cid);
      if (
        conversation.onlyAdminsCanWrite &&
        participant.role === ParticipantRole.MEMBER
      ) {
        throw new ForbiddenException(`Envoi non autorisé dans « ${conversation.name ?? cid} »`);
      }

      const saved = await this.dataSource.transaction(async (em) => {
        const msg = await em.save(
          em.create(ChatMessageEntity, {
            conversationId: cid,
            senderId: actor.id,
            type: source.type === MessageType.SYSTEM ? MessageType.TEXT : source.type,
            content: source.content,
            forwardedFromId: source.id,
          }),
        );
        if (source.attachments?.length) {
          await em.save(
            source.attachments.map((a) =>
              em.create(ChatAttachmentEntity, {
                messageId: msg.id,
                conversationId: cid,
                type: a.type,
                url: a.url,
                storagePath: a.storagePath,
                thumbnailUrl: a.thumbnailUrl,
                originalName: a.originalName,
                mimeType: a.mimeType,
                size: a.size,
                width: a.width,
                height: a.height,
                duration: a.duration,
                waveform: a.waveform,
              }),
            ),
          );
        }
        await em.update(ChatConversationEntity, { id: cid }, {
          lastMessageId: msg.id,
          lastMessageAt: msg.createdAt,
        });
        await em
          .createQueryBuilder()
          .update(ChatParticipantEntity)
          .set({ unreadCount: () => 'unreadCount + 1', isArchived: false })
          .where('conversationId = :cid', { cid })
          .andWhere('userId != :me', { me: actor.id })
          .andWhere('leftAt IS NULL')
          .execute();
        await em.update(
          ChatParticipantEntity,
          { conversationId: cid, userId: actor.id },
          { unreadCount: 0, lastReadAt: msg.createdAt, lastReadMessageId: msg.id },
        );
        return msg;
      });

      await this.afterMessageCreated(actor, conversation, saved.id, null);
      results.push(await this.getMessage(actor, saved.id));
    }
    return results;
  }

  /** Marque la conversation comme lue */
  async markRead(actor: ChatActor, conversationId: string, messageId?: string) {
    const { participant } = await this.assertParticipant(actor.id, conversationId, true);

    let readAt = new Date();
    let lastReadMessageId: string | null = null;
    if (messageId) {
      const m = await this.msgRepo.findOne({ where: { id: messageId, conversationId }, select: ['id', 'createdAt'] });
      if (m) {
        readAt = m.createdAt;
        lastReadMessageId = m.id;
      }
    } else {
      const conv = await this.convRepo.findOne({ where: { id: conversationId }, select: ['id', 'lastMessageId'] });
      lastReadMessageId = conv?.lastMessageId ?? null;
    }

    // Recalcule les non lus restants (si lecture partielle)
    let unread = 0;
    if (messageId) {
      unread = await this.msgRepo
        .createQueryBuilder('m')
        .where('m.conversationId = :cid', { cid: conversationId })
        .andWhere('m.createdAt > :readAt', { readAt })
        .andWhere('(m.senderId IS NULL OR m.senderId != :me)', { me: actor.id })
        .getCount();
    }

    const alreadyRead =
      participant.unreadCount === unread &&
      participant.lastReadAt &&
      participant.lastReadAt >= readAt;

    await this.partRepo.update(
      { id: participant.id },
      {
        unreadCount: unread,
        lastReadAt: readAt,
        lastReadMessageId,
        lastDeliveredAt:
          participant.lastDeliveredAt && participant.lastDeliveredAt > readAt
            ? participant.lastDeliveredAt
            : readAt,
      },
    );

    if (unread === 0) await this.markConversationNotificationsRead(actor.id, conversationId);

    if (!alreadyRead) {
      this.realtime.emitToConversation(conversationId, ChatServerEvents.READ, {
        conversationId,
        userId: actor.id,
        lastReadAt: readAt,
        lastReadMessageId,
      });
    }
    const totalUnread = await this.getTotalUnread(actor.id);
    this.realtime.emitToUser(actor.id, ChatServerEvents.UNREAD, {
      conversationId,
      unreadCount: unread,
      totalUnread,
    });

    return { conversationId, unreadCount: unread, totalUnread, lastReadAt: readAt };
  }

  /** À la connexion : tous les messages reçus hors ligne passent en "distribué" */
  async markAllDelivered(userId: string) {
    const parts = await this.partRepo.find({ where: { userId, leftAt: IsNull() } });
    const now = new Date();
    const toUpdate = parts.filter((p) => p.unreadCount > 0);
    if (!toUpdate.length) return;
    await this.partRepo.update({ id: In(toUpdate.map((p) => p.id)) }, { lastDeliveredAt: now });
    for (const p of toUpdate) {
      this.realtime.emitToConversation(p.conversationId, ChatServerEvents.DELIVERED, {
        conversationId: p.conversationId,
        userId,
        at: now,
      });
    }
  }

  async searchMessages(actor: ChatActor, query: SearchMessagesQueryDto) {
    const q = query.q?.trim();
    if (!q || q.length < 2) throw new BadRequestException('Recherche : 2 caractères minimum');
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 30));

    const qb = this.msgRepo
      .createQueryBuilder('m')
      .innerJoin(
        ChatParticipantEntity,
        'me',
        'me.conversationId = m.conversationId AND me.userId = :uid',
        { uid: actor.id },
      )
      .leftJoin('m.sender', 's')
      .addSelect(USER_LITE_COLUMNS('s'))
      .leftJoin('m.attachments', 'a')
      .addSelect(['a.id', 'a.type', 'a.originalName', 'a.url', 'a.thumbnailUrl'])
      .where('m.isDeleted = :d', { d: false })
      .andWhere('m.type != :sys', { sys: MessageType.SYSTEM })
      .andWhere('(me.clearedAt IS NULL OR m.createdAt > me.clearedAt)')
      .andWhere('(me.leftAt IS NULL OR m.createdAt <= me.leftAt)')
      .andWhere(
        new Brackets((w) => {
          w.where('m.content LIKE :q', { q: `%${q}%` }).orWhere('a.originalName LIKE :q', { q: `%${q}%` });
        }),
      )
      .orderBy('m.createdAt', 'DESC')
      .take(limit);

    if (query.conversationId) qb.andWhere('m.conversationId = :cid', { cid: query.conversationId });

    const rows = await qb.getMany();
    return rows
      .filter((m) => !(m.hiddenFor ?? []).includes(actor.id))
      .map((m) => this.serializeMessage(m, actor.id, []));
  }

  /** Galerie : médias / fichiers / liens d'une conversation */
  async listMedia(actor: ChatActor, conversationId: string, query: ListMediaQueryDto) {
    const { participant } = await this.assertParticipant(actor.id, conversationId, true);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 30));

    const types = (query.types ?? '')
      .split(',')
      .map((t) => t.trim().toUpperCase())
      .filter((t) => (Object.values(AttachmentType) as string[]).includes(t));

    const qb = this.attRepo
      .createQueryBuilder('a')
      .innerJoin('a.message', 'm')
      .addSelect(['m.id', 'm.senderId', 'm.createdAt', 'm.hiddenFor'])
      .where('a.conversationId = :cid', { cid: conversationId })
      .andWhere('m.isDeleted = :d', { d: false })
      .orderBy('a.createdAt', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit);

    if (types.length) qb.andWhere('a.type IN (:...types)', { types });
    if (participant.clearedAt) qb.andWhere('m.createdAt > :cleared', { cleared: participant.clearedAt });

    const [rows, total] = await qb.getManyAndCount();
    return {
      data: rows
        .filter((a) => !(a.message?.hiddenFor ?? []).includes(actor.id))
        .map((a) => ({
          id: a.id,
          messageId: a.messageId,
          type: a.type,
          url: a.url,
          thumbnailUrl: a.thumbnailUrl ?? null,
          originalName: a.originalName,
          mimeType: a.mimeType,
          size: Number(a.size),
          width: a.width ?? null,
          height: a.height ?? null,
          duration: a.duration ?? null,
          senderId: a.message?.senderId ?? null,
          createdAt: a.createdAt,
        })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // =====================================================================
  // HELPERS
  // =====================================================================
  private baseMessageQuery() {
    return this.msgRepo
      .createQueryBuilder('m')
      .leftJoin('m.sender', 's')
      .addSelect(USER_LITE_COLUMNS('s'))
      .leftJoinAndSelect('m.attachments', 'a')
      .leftJoinAndSelect('m.reactions', 'r')
      .leftJoin('r.user', 'ru')
      .addSelect(['ru.id', 'ru.fullName', 'ru.image'])
      .leftJoinAndSelect('m.replyTo', 'rt')
      .leftJoin('rt.sender', 'rts')
      .addSelect(['rts.id', 'rts.fullName', 'rts.image'])
      .leftJoinAndSelect('rt.attachments', 'rta');
  }

  async assertParticipant(userId: string, conversationId: string, allowLeft = false) {
    const participant = await this.partRepo.findOne({
      where: { conversationId, userId },
      relations: ['conversation'],
    });
    if (!participant || !participant.conversation) {
      throw new NotFoundException('Conversation introuvable');
    }
    if (participant.leftAt && !allowLeft) {
      throw new ForbiddenException('Vous ne faites plus partie de cette conversation');
    }
    return { participant, conversation: participant.conversation };
  }

  private async assertGroupAdmin(userId: string, conversationId: string) {
    const res = await this.assertParticipant(userId, conversationId);
    if (res.conversation.type !== ConversationType.GROUP) {
      throw new BadRequestException("Cette action n'est possible que pour un groupe");
    }
    if (res.participant.role === ParticipantRole.MEMBER) {
      throw new ForbiddenException('Action réservée aux administrateurs du groupe');
    }
    return res;
  }

  private async createSystemMessage(
    conversationId: string,
    actor: ChatActor,
    content: string,
    metadata: Record<string, any>,
  ) {
    const msg = await this.msgRepo.save(
      this.msgRepo.create({
        conversationId,
        senderId: null,
        type: MessageType.SYSTEM,
        content,
        metadata,
      }),
    );
    await this.convRepo.update({ id: conversationId }, { lastMessageId: msg.id, lastMessageAt: msg.createdAt });
    this.realtime.emitToConversation(conversationId, ChatServerEvents.MESSAGE_NEW, {
      conversationId,
      message: this.serializeMessage({ ...msg, attachments: [], reactions: [] } as ChatMessageEntity, actor.id, []),
    });
    return msg;
  }

  private async emitConversationUpdated(conversationId: string) {
    const members = await this.partRepo.find({ where: { conversationId, leftAt: IsNull() }, select: ['userId'] });
    for (const m of members) {
      try {
        const view = await this.getConversation({ id: m.userId }, conversationId);
        this.realtime.emitToUser(m.userId, ChatServerEvents.CONVERSATION_UPDATED, view);
      } catch {
        /* ignore */
      }
    }
  }

  // ------------------------------------------------------------
  // Fichiers (FilesService existant)
  // ------------------------------------------------------------
  /** Dossier de stockage : UPLOAD_PATH/chat/AAAA/MM */
  private chatFolder(): string {
    const now = new Date();
    return `chat/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private toStoredAttachment(d: UploadedFileDetails): StoredAttachment {
    const type =
      (Object.values(AttachmentType) as string[]).includes(d.kind)
        ? (d.kind as AttachmentType)
        : AttachmentType.OTHER;
    return {
      type,
      url: d.url,
      storagePath: d.storagePath,
      thumbnailUrl: d.thumbnailUrl,
      originalName: d.originalName,
      mimeType: d.mimeType,
      size: d.size,
      width: d.width,
      height: d.height,
      duration: d.duration,
    };
  }

  private async uploadGroupAvatar(avatar: Express.Multer.File): Promise<string> {
    const d = await this.filesService.uploadFileDetailed(avatar, 'chat/avatars', {
      imageMaxWidth: 512,
      imageQuality: 75,
      imageMaxSizeKB: 80,
      imageThumbnail: false,
      maxSize: 10 * 1024 * 1024,
    });
    if (d.kind !== 'IMAGE') {
      await this.filesService.deleteFileByUrl(d.url);
      throw new BadRequestException("L'avatar du groupe doit être une image");
    }
    return d.url;
  }

  /** Supprime les fichiers temporaires multer (cas d'erreur avant traitement) */
  private async cleanupTemp(files?: Express.Multer.File[]) {
    for (const f of files || []) {
      if (!f?.path) continue;
      try {
        await fsp.unlink(f.path);
      } catch {
        /* déjà supprimé */
      }
    }
  }

  // ------------------------------------------------------------
  // Notifications (NotificationsService + FcmService existants)
  // ------------------------------------------------------------
  /**
   * Stocke la notification dans user_notifications (+ événement "notification"
   * sur le socket de chaque destinataire) puis envoie un push Firebase
   * aux destinataires hors ligne.
   */
  private async notifyUsers(input: ChatNotifyInput) {
    const recipients = [...new Set(input.recipientIds)].filter((id) => id && id !== input.senderId);
    if (!recipients.length) return;

    const data = {
      category: 'chat',
      conversationId: input.conversationId,
      messageId: input.messageId ?? null,
      senderId: input.senderId,
      imageUrl: input.imageUrl ?? null,
      ...(input.data ?? {}),
    };

    try {
      await this.notificationsService.sendAndSaveNotificationToUsers(
        recipients,
        input.title,
        input.body,
        input.type,
        data,
      );
    } catch (e: any) {
      this.logger.error(`Sauvegarde notifications chat impossible: ${e.message}`);
    }

    const offline = recipients.filter((id) => !this.presence.isOnline(id));
    if (!offline.length) return;

    const link = this.webUrl ? `${this.webUrl}/chat/${input.conversationId}` : undefined;
    void this.fcmService
      .sendPushToUsers(
        offline,
        input.title,
        input.body,
        {
          type: input.type,
          category: 'chat',
          conversationId: input.conversationId,
          messageId: input.messageId ?? '',
          senderId: input.senderId,
          ...(link ? { link } : {}),
        },
        {
          imageUrl: input.imageUrl ?? undefined,
          link,
          tag: `chat-${input.conversationId}`,
          androidChannelId: this.configService.get<string>('CHAT_ANDROID_CHANNEL_ID') || undefined,
        },
      )
      .catch((e) => this.logger.warn(`Push chat: ${e?.message}`));
  }

  private async markConversationNotificationsRead(userId: string, conversationId: string) {
    try {
      await this.notificationsService.markAsReadByData(
        userId,
        'conversationId',
        conversationId,
        CHAT_NOTIFICATION_TYPES,
      );
    } catch (e: any) {
      this.logger.warn(`Marquage notifications chat: ${e.message}`);
    }
  }

  private resolveMessageType(stored: StoredAttachment[]): MessageType {
    if (!stored.length) return MessageType.TEXT;
    const kinds = new Set(stored.map((s) => s.type));
    if (kinds.size > 1) {
      // images + vidéos ensemble = galerie
      const visual = [...kinds].every((k) => k === AttachmentType.IMAGE || k === AttachmentType.VIDEO);
      return visual ? MessageType.IMAGE : MessageType.MIXED;
    }
    const only = [...kinds][0];
    switch (only) {
      case AttachmentType.IMAGE:
        return MessageType.IMAGE;
      case AttachmentType.VIDEO:
        return MessageType.VIDEO;
      case AttachmentType.AUDIO:
        return MessageType.AUDIO;
      default:
        return MessageType.DOCUMENT;
    }
  }

  previewText(m: Pick<ChatMessageEntity, 'type' | 'content' | 'attachments' | 'isDeleted'>): string {
    if (m.isDeleted) return 'Message supprimé';
    const text = m.content?.trim();
    const count = m.attachments?.length ?? 0;
    const label = (() => {
      switch (m.type) {
        case MessageType.IMAGE:
          return count > 1 ? `📷 ${count} médias` : '📷 Photo';
        case MessageType.VIDEO:
          return '🎥 Vidéo';
        case MessageType.AUDIO:
          return '🎤 Message vocal';
        case MessageType.DOCUMENT: {
          const a = m.attachments?.[0];
          return a ? `📄 ${a.originalName}` : '📄 Document';
        }
        case MessageType.MIXED:
          return `📎 ${count} fichiers`;
        default:
          return '';
      }
    })();
    const out = text ? (label ? `${label} · ${text}` : text) : label || 'Nouveau message';
    return out.length > 140 ? `${out.slice(0, 137)}…` : out;
  }

  private userLite(u?: UserEntity | null): ChatUserLite | null {
    if (!u) return null;
    return {
      id: u.id,
      fullName: u.fullName,
      image: u.image ?? null,
      email: u.email ?? null,
      phone: u.phone ?? null,
    };
  }

  private summarizeReactions(reactions: ChatReactionEntity[], viewerId: string) {
    const map = new Map<string, { emoji: string; count: number; users: { id: string; fullName: string }[]; reactedByMe: boolean }>();
    for (const r of reactions) {
      const entry = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, users: [], reactedByMe: false };
      entry.count += 1;
      entry.users.push({ id: r.userId, fullName: r.user?.fullName ?? '' });
      if (r.userId === viewerId) entry.reactedByMe = true;
      map.set(r.emoji, entry);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }

  /**
   * Sérialise un message.
   * status (pour les messages de l'expéditeur) : SENT → DELIVERED → READ,
   * calculé à partir des accusés des autres participants.
   */
  serializeMessage(m: ChatMessageEntity, viewerId: string, others: ChatParticipantEntity[]) {
    const recipients = others.filter((p) => p.userId !== m.senderId);
    let status: 'SENT' | 'DELIVERED' | 'READ' = 'SENT';
    if (recipients.length) {
      const allRead = recipients.every((p) => p.lastReadAt && p.lastReadAt >= m.createdAt);
      const allDelivered = recipients.every(
        (p) =>
          (p.lastDeliveredAt && p.lastDeliveredAt >= m.createdAt) ||
          (p.lastReadAt && p.lastReadAt >= m.createdAt),
      );
      status = allRead ? 'READ' : allDelivered ? 'DELIVERED' : 'SENT';
    }

    const deleted = m.isDeleted;
    return {
      id: m.id,
      conversationId: m.conversationId,
      clientMessageId: m.clientMessageId ?? null,
      type: m.type,
      content: deleted ? null : m.content ?? null,
      sender: m.senderId ? this.userLite(m.sender) ?? { id: m.senderId, fullName: '', image: null, email: null, phone: null } : null,
      senderId: m.senderId ?? null,
      isMine: !!viewerId && m.senderId === viewerId,
      status,
      attachments: deleted
        ? []
        : (m.attachments ?? []).map((a) => ({
            id: a.id,
            type: a.type,
            url: a.url,
            thumbnailUrl: a.thumbnailUrl ?? null,
            originalName: a.originalName,
            mimeType: a.mimeType,
            size: Number(a.size),
            width: a.width ?? null,
            height: a.height ?? null,
            duration: a.duration ?? null,
            waveform: a.waveform ?? null,
          })),
      replyTo: m.replyTo
        ? {
            id: m.replyTo.id,
            type: m.replyTo.type,
            content: m.replyTo.isDeleted ? null : m.replyTo.content ?? null,
            isDeleted: m.replyTo.isDeleted,
            sender: m.replyTo.sender
              ? { id: m.replyTo.sender.id, fullName: m.replyTo.sender.fullName, image: m.replyTo.sender.image ?? null }
              : null,
            attachment: m.replyTo.isDeleted
              ? null
              : (() => {
                  const a = m.replyTo!.attachments?.[0];
                  return a ? { type: a.type, thumbnailUrl: a.thumbnailUrl ?? null, originalName: a.originalName } : null;
                })(),
          }
        : null,
      forwarded: !!m.forwardedFromId,
      mentions: m.mentions ?? [],
      metadata: m.metadata ?? null,
      reactions: deleted ? [] : this.summarizeReactions(m.reactions ?? [], viewerId),
      isEdited: m.isEdited,
      editedAt: m.editedAt ?? null,
      isPinned: m.isPinned,
      isDeleted: deleted,
      createdAt: m.createdAt,
    };
  }
}
