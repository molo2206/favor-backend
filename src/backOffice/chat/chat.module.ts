// src/backOffice/chat/chat.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { EmployeeEntity } from 'src/backOffice/hr/employees/entities/employee.entity';
import { DeviceToken } from 'src/firebase/entities/device-token.entity';
// ✅ Briques existantes : WebSocket principal, notifications, présence, FCM, fichiers
import { NotificationsModule } from 'src/notification/notifications.module';
import { FilesService } from 'src/files/files.service';
import { FcmService } from 'src/notification/fcm.service';
import { ChatConversationEntity } from './entities/chat-conversation.entity';
import { ChatParticipantEntity } from './entities/chat-participant.entity';
import { ChatMessageEntity } from './entities/chat-message.entity';
import { ChatAttachmentEntity } from './entities/chat-attachment.entity';
import { ChatReactionEntity } from './entities/chat-reaction.entity';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './services/chat.service';
import { ChatRealtimeService } from './services/chat-realtime.service';

@Module({
  imports: [
    // Fournit NotificationsGateway, NotificationsService, PresenceService, WsAuthHelper, FcmService
    NotificationsModule,
    TypeOrmModule.forFeature([
      ChatConversationEntity,
      ChatParticipantEntity,
      ChatMessageEntity,
      ChatAttachmentEntity,
      ChatReactionEntity,
      UserEntity,
      EmployeeEntity,
      DeviceToken,
    ]),
  ],
  controllers: [ChatController],
  providers: [
    // Même convention que les autres modules du projet
    FilesService,
    FcmService,
    ChatRealtimeService,
    ChatService,
    ChatGateway,
  ],
  exports: [ChatService, ChatRealtimeService],
})
export class ChatModule {}
