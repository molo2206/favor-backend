// src/notification/presence.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Server } from 'socket.io';
import { PresenceStatus, UserPresenceEntity } from './entities/user-presence.entity';

export interface PresenceInfo {
  userId: string;
  isOnline: boolean;
  status: PresenceStatus;
  lastSeenAt: Date | null;
}

/** Délai avant de passer hors ligne (évite le clignotement lors d'un rechargement de page) */
const OFFLINE_GRACE_MS = 5000;

/**
 * Présence en temps réel des utilisateurs connectés au WebSocket principal.
 * Alimentée par NotificationsGateway (identification / déconnexion de chaque socket).
 * Gère plusieurs onglets / appareils par utilisateur.
 *
 * Événement émis à tous : "presence:update" { userId, isOnline, status, lastSeenAt }
 */
@Injectable()
export class PresenceService implements OnModuleInit {
  private readonly logger = new Logger(PresenceService.name);
  private server: Server | null = null;

  /** userId → sockets connectés */
  private readonly sockets = new Map<string, Set<string>>();
  /** userId → statut choisi (ONLINE / AWAY / BUSY) */
  private readonly manualStatus = new Map<string, PresenceStatus>();
  /** userId → timer de passage hors ligne */
  private readonly offlineTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectRepository(UserPresenceEntity)
    private readonly presenceRepo: Repository<UserPresenceEntity>,
  ) {}

  /** Au démarrage la mémoire est vide : personne n'est réellement connecté */
  async onModuleInit() {
    try {
      await this.presenceRepo
        .createQueryBuilder()
        .update(UserPresenceEntity)
        .set({ isOnline: false, status: PresenceStatus.OFFLINE })
        .where('isOnline = :on', { on: true })
        .execute();
    } catch (e: any) {
      this.logger.warn(`Réinitialisation présence ignorée: ${e.message}`);
    }
  }

  /** Appelé par NotificationsGateway.afterInit */
  attachServer(server: Server) {
    this.server = server;
  }

  // ------------------------------------------------------------
  // Connexion / déconnexion d'un socket
  // ------------------------------------------------------------
  async onSocketConnected(userId: string, socketId: string, platform?: string | null) {
    const pending = this.offlineTimers.get(userId);
    if (pending) {
      clearTimeout(pending);
      this.offlineTimers.delete(userId);
    }

    const set = this.sockets.get(userId) ?? new Set<string>();
    const wasOnline = set.size > 0 || !!pending;
    set.add(socketId);
    this.sockets.set(userId, set);

    if (!wasOnline) {
      const existing = await this.safeFind(userId);
      const status =
        existing?.status && existing.status !== PresenceStatus.OFFLINE
          ? existing.status
          : PresenceStatus.ONLINE;
      this.manualStatus.set(userId, status);

      await this.persist(userId, {
        isOnline: true,
        status,
        lastConnectedAt: new Date(),
        platform: platform ?? null,
      });
      this.broadcast(userId);
    }
  }

  async onSocketDisconnected(userId: string, socketId: string) {
    const set = this.sockets.get(userId);
    if (!set) return;
    set.delete(socketId);
    if (set.size > 0) return;

    this.sockets.delete(userId);
    const timer = setTimeout(async () => {
      this.offlineTimers.delete(userId);
      if (this.sockets.get(userId)?.size) return; // reconnecté entre-temps
      const now = new Date();
      // On garde le statut choisi (AWAY/BUSY) pour la prochaine connexion
      await this.persist(userId, { isOnline: false, lastSeenAt: now });
      this.manualStatus.delete(userId);
      this.server?.emit('presence:update', {
        userId,
        isOnline: false,
        status: PresenceStatus.OFFLINE,
        lastSeenAt: now,
      });
    }, OFFLINE_GRACE_MS);
    this.offlineTimers.set(userId, timer);
  }

  /** Déconnexion immédiate (logout / 'disconnect-user') sans délai de grâce */
  async forceOffline(userId: string) {
    const pending = this.offlineTimers.get(userId);
    if (pending) clearTimeout(pending);
    this.offlineTimers.delete(userId);
    this.sockets.delete(userId);
    this.manualStatus.delete(userId);
    const now = new Date();
    await this.persist(userId, { isOnline: false, lastSeenAt: now });
    this.server?.emit('presence:update', {
      userId,
      isOnline: false,
      status: PresenceStatus.OFFLINE,
      lastSeenAt: now,
    });
  }

  /** Changement manuel de statut (Disponible / Absent / Occupé) */
  async setStatus(userId: string, status: PresenceStatus): Promise<PresenceInfo> {
    const wanted = status === PresenceStatus.OFFLINE ? PresenceStatus.ONLINE : status;
    if (this.isOnline(userId)) this.manualStatus.set(userId, wanted);
    await this.persist(userId, { status: wanted, isOnline: this.isOnline(userId) });
    this.broadcast(userId);
    return this.getOne(userId);
  }

  // ------------------------------------------------------------
  // Lecture
  // ------------------------------------------------------------
  isOnline(userId: string): boolean {
    return (this.sockets.get(userId)?.size ?? 0) > 0 || this.offlineTimers.has(userId);
  }

  getOnlineUserIds(): string[] {
    return [...new Set([...this.sockets.keys(), ...this.offlineTimers.keys()])];
  }

  getSocketIds(userId: string): string[] {
    return [...(this.sockets.get(userId) ?? [])];
  }

  getOnlineSnapshot(): PresenceInfo[] {
    return this.getOnlineUserIds().map((userId) => ({
      userId,
      isOnline: true,
      status: this.manualStatus.get(userId) ?? PresenceStatus.ONLINE,
      lastSeenAt: null,
    }));
  }

  async getOne(userId: string): Promise<PresenceInfo> {
    if (this.isOnline(userId)) {
      return {
        userId,
        isOnline: true,
        status: this.manualStatus.get(userId) ?? PresenceStatus.ONLINE,
        lastSeenAt: null,
      };
    }
    const row = await this.safeFind(userId);
    return {
      userId,
      isOnline: false,
      status: PresenceStatus.OFFLINE,
      lastSeenAt: row?.lastSeenAt ?? null,
    };
  }

  async getMany(userIds: string[]): Promise<Record<string, PresenceInfo>> {
    const result: Record<string, PresenceInfo> = {};
    const unique = [...new Set((userIds || []).filter(Boolean))];
    if (!unique.length) return result;

    let rows: UserPresenceEntity[] = [];
    try {
      rows = await this.presenceRepo.find({ where: { userId: In(unique) } });
    } catch {
      rows = [];
    }
    const byId = new Map(rows.map((r) => [r.userId, r]));

    for (const id of unique) {
      const online = this.isOnline(id);
      result[id] = {
        userId: id,
        isOnline: online,
        status: online
          ? this.manualStatus.get(id) ?? PresenceStatus.ONLINE
          : PresenceStatus.OFFLINE,
        lastSeenAt: online ? null : byId.get(id)?.lastSeenAt ?? null,
      };
    }
    return result;
  }

  // ------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------
  private broadcast(userId: string) {
    const online = this.isOnline(userId);
    this.server?.emit('presence:update', {
      userId,
      isOnline: online,
      status: online ? this.manualStatus.get(userId) ?? PresenceStatus.ONLINE : PresenceStatus.OFFLINE,
      lastSeenAt: null,
    });
  }

  private async safeFind(userId: string): Promise<UserPresenceEntity | null> {
    try {
      return await this.presenceRepo.findOne({ where: { userId } });
    } catch {
      return null;
    }
  }

  private async persist(userId: string, patch: Partial<UserPresenceEntity>) {
    try {
      const exists = await this.presenceRepo.exists({ where: { userId } });
      if (exists) {
        await this.presenceRepo.update({ userId }, patch);
      } else {
        await this.presenceRepo.insert({
          userId,
          isOnline: false,
          status: PresenceStatus.OFFLINE,
          ...patch,
        });
      }
    } catch (e: any) {
      this.logger.warn(`Persistance présence ${userId} impossible: ${e.message}`);
    }
  }
}
