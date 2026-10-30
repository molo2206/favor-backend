import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { RolesGuard } from 'src/users/utility/decorators/roles.guard';
import { Roles } from 'src/users/utility/decorators/roles.decorator';
import { UserRole } from 'src/users/enum/user-role-enum';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { RideChatService } from './ride-chat.service';
import { rideChatAudioMulterOptions } from './ride-chat-upload.options';
import {
  AdminDeleteRideChatMessageDto,
  AdminRideChatConversationsQueryDto,
  AdminRideChatMessagesQueryDto,
  AdminRideChatStatsQueryDto,
  DeleteRideChatMessageQueryDto,
  MyRideChatsQueryDto,
  RideChatMessagesQueryDto,
  SendRideChatAudioDto,
  SendRideChatTextDto,
} from './dto/ride-chat.dto';

const SUPPORTED_LANGS = ['fr', 'en', 'es', 'sw', 'ar'];

/**
 * ✅ Chat chauffeur ↔ client (une conversation par course) : texte + messages vocaux.
 *
 * Participants (passager ou chauffeur de la course) :
 *   GET    /ride-chat/me                              mes conversations
 *   GET    /ride-chat/unread                          non lus (total + par course)
 *   GET    /ride-chat/:rideId/messages?before=&after=&limit=
 *   POST   /ride-chat/:rideId/messages                { text, clientMessageId?, replyToId? }   (réponse possible)
 *   POST   /ride-chat/:rideId/audio                   multipart : audio (fichier), duration?, clientMessageId?, replyToId?
 *   POST   /ride-chat/:rideId/read                    tout marquer comme lu
 *   DELETE /ride-chat/:rideId/messages/:messageId?forEveryone=true    supprimer SON message pour tous (délai)
 *   DELETE /ride-chat/:rideId/messages/:messageId?forEveryone=false   supprimer un message POUR MOI
 *   (l'administration voit toujours tous les messages)
 *
 * Administration (ADMIN, SUPER ADMIN) — historique :
 *   GET    /ride-chat/admin/stats?from=&to=
 *   GET    /ride-chat/admin/conversations?search=&status=&driverId=&riderId=&rideId=&hasAudio=&hasDeleted=&from=&to=&page=&limit=
 *   GET    /ride-chat/admin/conversations/:rideId?type=&includeDeleted=&page=&limit=
 *   GET    /ride-chat/admin/messages/:messageId
 *   DELETE /ride-chat/admin/messages/:messageId       { reason? }  (masqué aux participants)
 *   PATCH  /ride-chat/admin/messages/:messageId/restore
 */
@Controller('ride-chat')
export class RideChatController {
  constructor(private readonly chat: RideChatService) { }

  private lang(req: Request): string {
    const raw = String(req?.headers?.['accept-language'] || 'fr').split(',')[0].split(';')[0].trim().slice(0, 2);
    return SUPPORTED_LANGS.includes(raw) ? raw : 'fr';
  }

  // ============================================================
  // ADMINISTRATION (déclarées avant les routes /:rideId)
  // ============================================================

  @Get('admin/stats')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @AuditAction(ActionType.VIEW, 'ride_chat_messages')
  adminStats(@Req() req: Request, @Query() query: AdminRideChatStatsQueryDto) {
    return this.chat.adminStats(query, this.lang(req));
  }

  @Get('admin/conversations')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @AuditAction(ActionType.VIEW, 'ride_chat_messages')
  adminConversations(@Req() req: Request, @Query() query: AdminRideChatConversationsQueryDto) {
    return this.chat.adminConversations(query, this.lang(req));
  }

  @Get('admin/conversations/:rideId')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @AuditAction(ActionType.VIEW, 'ride_chat_messages')
  adminConversation(
    @Req() req: Request,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Query() query: AdminRideChatMessagesQueryDto,
  ) {
    return this.chat.adminConversation(rideId, query, this.lang(req));
  }

  @Get('admin/messages/:messageId')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @AuditAction(ActionType.VIEW, 'ride_chat_messages')
  adminMessage(@Req() req: Request, @Param('messageId', ParseUUIDPipe) messageId: string) {
    return this.chat.adminMessage(messageId, this.lang(req));
  }

  @Delete('admin/messages/:messageId')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @AuditAction(ActionType.DELETE, 'ride_chat_messages')
  adminDelete(
    @Req() req: Request,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: AdminDeleteRideChatMessageDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.chat.adminDelete(messageId, user, dto?.reason, this.lang(req));
  }

  @Patch('admin/messages/:messageId/restore')
  @UseGuards(AuthentificationGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @AuditAction(ActionType.UPDATE, 'ride_chat_messages')
  adminRestore(@Req() req: Request, @Param('messageId', ParseUUIDPipe) messageId: string) {
    return this.chat.adminRestore(messageId, this.lang(req));
  }

  // ============================================================
  // PARTICIPANTS (passager / chauffeur)
  // ============================================================

  @Get('me')
  @UseGuards(AuthentificationGuard)
  myConversations(@Req() req: Request, @CurrentUser() user: UserEntity, @Query() query: MyRideChatsQueryDto) {
    return this.chat.myConversations(user, query, this.lang(req));
  }

  @Get('unread')
  @UseGuards(AuthentificationGuard)
  unread(@Req() req: Request, @CurrentUser() user: UserEntity) {
    return this.chat.unread(user, this.lang(req));
  }

  @Get(':rideId/messages')
  @UseGuards(AuthentificationGuard)
  messages(
    @Req() req: Request,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Query() query: RideChatMessagesQueryDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.chat.messages(rideId, user, query, this.lang(req));
  }

  @Post(':rideId/messages')
  @UseGuards(AuthentificationGuard)
  @HttpCode(HttpStatus.CREATED)
  sendText(
    @Req() req: Request,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: SendRideChatTextDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.chat.sendText(rideId, user, dto, this.lang(req));
  }

  @Post(':rideId/audio')
  @UseGuards(AuthentificationGuard)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('audio', rideChatAudioMulterOptions))
  sendAudio(
    @Req() req: Request,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: SendRideChatAudioDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.chat.sendAudio(rideId, user, file, dto, this.lang(req));
  }

  @Post(':rideId/read')
  @UseGuards(AuthentificationGuard)
  @HttpCode(HttpStatus.OK)
  markRead(@Req() req: Request, @Param('rideId', ParseUUIDPipe) rideId: string, @CurrentUser() user: UserEntity) {
    return this.chat.markRead(rideId, user, this.lang(req));
  }

  @Delete(':rideId/messages/:messageId')
  @UseGuards(AuthentificationGuard)
  deleteOwn(
    @Req() req: Request,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Query() query: DeleteRideChatMessageQueryDto,
    @CurrentUser() user: UserEntity,
  ) {
    return this.chat.deleteOwn(rideId, messageId, user, this.lang(req), query?.forEveryone !== false);
  }
}
