import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { NotificationsModule } from 'src/notification/notifications.module';
import { FilesModule } from 'src/files/files.module';
import { I18nModule } from 'src/libs/common/src';
import { Ride } from '../Ride/entity/Ride.entity';
import { RideModule } from '../Ride/ride.module';
import { RideChatMessage } from './entity/ride-chat-message.entity';
import { RideChatBlock, RideChatReport } from './entity/ride-chat-safety.entity';
import { RideChatSafetyService } from './ride-chat-safety.service';
import { RideChatService } from './ride-chat.service';
import { RideChatController } from './ride-chat.controller';
import { RideChatGateway } from './ride-chat.gateway';

/** ✅ Chat chauffeur ↔ client (texte + vocal) et historique des conversations pour l'administration */
@Module({
  imports: [
    TypeOrmModule.forFeature([RideChatMessage, RideChatReport, RideChatBlock, Ride, UserEntity]),
    forwardRef(() => NotificationsModule), // WsAuthHelper, FcmService, PresenceService
    forwardRef(() => RideModule), // RideRealtimeService (WebSocket principal)
    FilesModule,
    I18nModule,
  ],
  controllers: [RideChatController],
  providers: [RideChatService, RideChatGateway, RideChatSafetyService],
  exports: [RideChatService, RideChatSafetyService],
})
export class RideChatModule { }
