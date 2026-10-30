import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Socket } from 'socket.io';
import { WsAuthHelper } from 'src/notification/utils/ws-auth.helper';
import { UserEntity } from 'src/users/entities/user.entity';
import { RideChatService } from './ride-chat.service';
import { RideChatSocketEvents } from './ride-chat.events';

type Ack<T = any> = { success: true; data: T } | { success: false; error: string; status?: number };

/**
 * ✅ Chat chauffeur ↔ client sur le WebSocket PRINCIPAL ('/'), même connexion et même token JWT
 * que les courses (socket.data.userId posé par NotificationsGateway).
 * Les messages vocaux passent par REST (POST /ride-chat/:rideId/audio) ; leur diffusion se fait ici.
 */
@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: '/',
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000,
  connectTimeout: 45000,
  allowEIO3: true,
})
export class RideChatGateway {
  private readonly logger = new Logger(RideChatGateway.name);

  constructor(
    private readonly wsAuthHelper: WsAuthHelper,
    private readonly chat: RideChatService,
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
  ) { }

  private lang(socket: Socket): string {
    const raw = String(socket.handshake?.headers?.['accept-language'] || socket.handshake?.auth?.lang || 'fr');
    const l = raw.split(',')[0].split(';')[0].trim().slice(0, 2).toLowerCase();
    return ['fr', 'en', 'es', 'sw', 'ar'].includes(l) ? l : 'fr';
  }

  private parse<T = any>(data: any): T {
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return { rideId: data } as any;
      }
    }
    return (data ?? {}) as T;
  }

  private async user(socket: Socket): Promise<UserEntity | null> {
    const id = this.wsAuthHelper.extractUserId(socket);
    if (!id) return null;
    return this.userRepo.findOne({ where: { id } });
  }

  private fail(e: any): Ack {
    const error = e?.response?.message ?? e?.message ?? 'Erreur';
    const status = e?.status ?? e?.response?.statusCode;
    return { success: false, error: Array.isArray(error) ? error.join(', ') : String(error), status };
  }

  /** { rideId, text, clientMessageId?, replyToId? } */
  @SubscribeMessage(RideChatSocketEvents.SEND)
  async send(@MessageBody() data: any, @ConnectedSocket() socket: Socket): Promise<Ack> {
    try {
      const user = await this.user(socket);
      if (!user) return { success: false, error: 'Socket non identifié', status: 401 };
      const p = this.parse<{ rideId: string; text: string; clientMessageId?: string; replyToId?: string }>(data);
      if (!p?.rideId) return { success: false, error: 'rideId requis', status: 400 };
      const res = await this.chat.sendText(
        p.rideId,
        user,
        { text: p.text, clientMessageId: p.clientMessageId, replyToId: p.replyToId || undefined },
        this.lang(socket),
      );
      return { success: true, data: res.data };
    } catch (e) {
      return this.fail(e);
    }
  }

  /** { rideId, typing?: boolean, recording?: boolean } */
  @SubscribeMessage(RideChatSocketEvents.TYPING)
  async typing(@MessageBody() data: any, @ConnectedSocket() socket: Socket): Promise<Ack> {
    try {
      const user = await this.user(socket);
      if (!user) return { success: false, error: 'Socket non identifié', status: 401 };
      const p = this.parse<{ rideId: string; typing?: boolean; recording?: boolean }>(data);
      if (!p?.rideId) return { success: false, error: 'rideId requis', status: 400 };
      return { success: true, data: await this.chat.typing(p.rideId, user, p) };
    } catch (e) {
      return this.fail(e);
    }
  }

  /** { rideId } */
  @SubscribeMessage(RideChatSocketEvents.READ)
  async read(@MessageBody() data: any, @ConnectedSocket() socket: Socket): Promise<Ack> {
    try {
      const user = await this.user(socket);
      if (!user) return { success: false, error: 'Socket non identifié', status: 401 };
      const p = this.parse<{ rideId: string }>(data);
      if (!p?.rideId) return { success: false, error: 'rideId requis', status: 400 };
      return { success: true, data: (await this.chat.markRead(p.rideId, user, this.lang(socket))).data };
    } catch (e) {
      return this.fail(e);
    }
  }

  /** { rideId, before?, after?, limit? } */
  @SubscribeMessage(RideChatSocketEvents.HISTORY)
  async history(@MessageBody() data: any, @ConnectedSocket() socket: Socket): Promise<Ack> {
    try {
      const user = await this.user(socket);
      if (!user) return { success: false, error: 'Socket non identifié', status: 401 };
      const p = this.parse<{ rideId: string; before?: string; after?: string; limit?: number }>(data);
      if (!p?.rideId) return { success: false, error: 'rideId requis', status: 400 };
      const res = await this.chat.messages(p.rideId, user, { before: p.before, after: p.after, limit: p.limit }, this.lang(socket));
      return { success: true, data: res.data };
    } catch (e) {
      this.logger.debug(`Historique chat : ${e?.message}`);
      return this.fail(e);
    }
  }
}
