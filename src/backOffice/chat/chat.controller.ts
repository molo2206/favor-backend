// src/backOffice/chat/chat.controller.ts
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
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { ChatActor, ChatService } from './services/chat.service';
import { PresenceService } from 'src/notification/presence.service';
import { NotificationsService } from 'src/notification/notifications.service';
import { CHAT_NOTIFICATION_TYPES } from 'src/notification/type/notification.type';
import { chatAvatarMulterOptions, chatMulterOptions } from './chat-upload.options';
import {
  AddMembersDto,
  ChangeMemberRoleDto,
  CreateDirectConversationDto,
  CreateGroupConversationDto,
  EditMessageDto,
  ForwardMessageDto,
  ListContactsQueryDto,
  ListConversationsQueryDto,
  ListMediaQueryDto,
  ListMessagesQueryDto,
  MarkReadDto,
  ReactMessageDto,
  SearchMessagesQueryDto,
  SendMessageDto,
  SetPresenceStatusDto,
  UpdateGroupConversationDto,
  UpdateParticipantSettingsDto,
} from './dto/chat.dto';

/**
 * API REST du chat back-office (préfixe global : /api/v1)
 *   /api/v1/backoffice/chat/...
 */
@Controller('backoffice/chat')
@UseGuards(AuthentificationGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly presence: PresenceService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ============================================================
  // 👥 CONTACTS & PRÉSENCE
  // ============================================================
  @Get('contacts')
  listContacts(@CurrentUser() user: ChatActor, @Query() query: ListContactsQueryDto) {
    return this.chatService.listContacts(user, query);
  }

  @Get('presence/online')
  onlineUsers() {
    const data = this.presence.getOnlineSnapshot();
    return { data, count: data.length };
  }

  @Get('presence/:userId')
  presenceOf(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.presence.getOne(userId);
  }

  @Patch('presence/status')
  setStatus(@CurrentUser() user: ChatActor, @Body() dto: SetPresenceStatusDto) {
    return this.presence.setStatus(user.id, dto.status);
  }

  // ============================================================
  // 💬 CONVERSATIONS
  // ============================================================
  @Get('conversations')
  listConversations(@CurrentUser() user: ChatActor, @Query() query: ListConversationsQueryDto) {
    return this.chatService.listConversations(user, query);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: ChatActor) {
    const [messages, notifications] = await Promise.all([
      this.chatService.getTotalUnread(user.id),
      this.notificationsService.getUnreadCount(user.id, CHAT_NOTIFICATION_TYPES),
    ]);
    return { messages, notifications: notifications.count };
  }

  @Post('conversations/direct')
  @HttpCode(HttpStatus.OK)
  openDirect(@CurrentUser() user: ChatActor, @Body() dto: CreateDirectConversationDto) {
    return this.chatService.getOrCreateDirect(user, dto.userId);
  }

  @Post('conversations/group')
  @UseInterceptors(FileInterceptor('avatar', chatAvatarMulterOptions))
  createGroup(
    @CurrentUser() user: ChatActor,
    @Body() dto: CreateGroupConversationDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    return this.chatService.createGroup(user, dto, avatar);
  }

  @Get('conversations/:id')
  getConversation(@CurrentUser() user: ChatActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.chatService.getConversation(user, id);
  }

  @Patch('conversations/:id')
  @UseInterceptors(FileInterceptor('avatar', chatAvatarMulterOptions))
  updateGroup(
    @CurrentUser() user: ChatActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGroupConversationDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    return this.chatService.updateGroup(user, id, dto, avatar);
  }

  /** Sourdine / archive / épingler (pour moi) */
  @Patch('conversations/:id/settings')
  updateSettings(
    @CurrentUser() user: ChatActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateParticipantSettingsDto,
  ) {
    return this.chatService.updateMySettings(user, id, dto);
  }

  @Post('conversations/:id/members')
  addMembers(
    @CurrentUser() user: ChatActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddMembersDto,
  ) {
    return this.chatService.addMembers(user, id, dto);
  }

  @Delete('conversations/:id/members/:userId')
  removeMember(
    @CurrentUser() user: ChatActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.chatService.removeMember(user, id, userId);
  }

  @Patch('conversations/:id/members/:userId/role')
  changeRole(
    @CurrentUser() user: ChatActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ChangeMemberRoleDto,
  ) {
    return this.chatService.changeMemberRole(user, id, userId, dto.role);
  }

  @Post('conversations/:id/leave')
  @HttpCode(HttpStatus.OK)
  leave(@CurrentUser() user: ChatActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.chatService.leaveGroup(user, id);
  }

  /** Vider l'historique (pour moi) */
  @Post('conversations/:id/clear')
  @HttpCode(HttpStatus.OK)
  clear(@CurrentUser() user: ChatActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.chatService.clearConversation(user, id);
  }

  /** Supprimer la conversation de ma liste */
  @Delete('conversations/:id')
  deleteForMe(@CurrentUser() user: ChatActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.chatService.deleteConversationForMe(user, id);
  }

  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  markRead(
    @CurrentUser() user: ChatActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkReadDto,
  ) {
    return this.chatService.markRead(user, id, dto?.messageId);
  }

  @Get('conversations/:id/media')
  media(
    @CurrentUser() user: ChatActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListMediaQueryDto,
  ) {
    return this.chatService.listMedia(user, id, query);
  }

  @Get('conversations/:id/pinned')
  pinned(@CurrentUser() user: ChatActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.chatService.listPinned(user, id);
  }

  // ============================================================
  // ✉️ MESSAGES
  // ============================================================
  @Get('conversations/:id/messages')
  listMessages(
    @CurrentUser() user: ChatActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.chatService.listMessages(user, id, query);
  }

  /**
   * Envoi d'un message — multipart/form-data :
   *   content?, replyToId?, clientMessageId?, mentions?, durations?, waveform?
   *   files[] (max 10) : images, vidéos, audios, PDF, Word, Excel, PowerPoint, zip...
   * Fonctionne aussi en JSON pour un simple texte.
   */
  @Post('conversations/:id/messages')
  @UseInterceptors(FilesInterceptor('files', 10, chatMulterOptions))
  sendMessage(
    @CurrentUser() user: ChatActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    return this.chatService.sendMessage(user, id, dto, files ?? []);
  }

  @Get('messages/search')
  search(@CurrentUser() user: ChatActor, @Query() query: SearchMessagesQueryDto) {
    return this.chatService.searchMessages(user, query);
  }

  @Get('messages/:messageId')
  getMessage(@CurrentUser() user: ChatActor, @Param('messageId', ParseUUIDPipe) messageId: string) {
    return this.chatService.getMessage(user, messageId);
  }

  /** Vu par / distribué à (groupes) */
  @Get('messages/:messageId/info')
  messageInfo(
    @CurrentUser() user: ChatActor,
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ) {
    return this.chatService.getMessageInfo(user, messageId);
  }

  @Patch('messages/:messageId')
  editMessage(
    @CurrentUser() user: ChatActor,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: EditMessageDto,
  ) {
    return this.chatService.editMessage(user, messageId, dto);
  }

  /** ?forEveryone=true pour supprimer pour tout le monde */
  @Delete('messages/:messageId')
  deleteMessage(
    @CurrentUser() user: ChatActor,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Query('forEveryone') forEveryone?: string,
  ) {
    return this.chatService.deleteMessage(user, messageId, forEveryone === 'true' || forEveryone === '1');
  }

  @Post('messages/:messageId/reactions')
  @HttpCode(HttpStatus.OK)
  react(
    @CurrentUser() user: ChatActor,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: ReactMessageDto,
  ) {
    return this.chatService.toggleReaction(user, messageId, dto.emoji);
  }

  @Post('messages/:messageId/pin')
  @HttpCode(HttpStatus.OK)
  pin(@CurrentUser() user: ChatActor, @Param('messageId', ParseUUIDPipe) messageId: string) {
    return this.chatService.togglePin(user, messageId);
  }

  @Post('messages/:messageId/forward')
  forward(
    @CurrentUser() user: ChatActor,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: ForwardMessageDto,
  ) {
    return this.chatService.forwardMessage(user, messageId, dto.conversationIds);
  }

  // 🔔 Les notifications du chat sont stockées dans user_notifications :
  //    GET   /notifications?category=chat
  //    GET   /notifications/unread-count?category=chat
  //    PATCH /notifications/read-all?category=chat
  // 🔥 Le token Firebase s'enregistre via l'endpoint existant : POST /users/device-token
}
