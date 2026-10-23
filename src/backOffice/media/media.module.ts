import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { Asset } from 'src/backOffice/logistics/assets/entities/asset.entity';
// ✅ Briques existantes : notifications (WebSocket + base), push Firebase, fichiers
import { NotificationsModule } from 'src/notification/notifications.module';
import { FilesModule } from 'src/files/files.module';
import { MediaServiceEntity } from './entities/media-service.entity';
import { MediaTeamMember } from './entities/media-team-member.entity';
import { MediaProject } from './entities/media-project.entity';
import { MediaProjectItem } from './entities/media-project-item.entity';
import { MediaSession } from './entities/media-session.entity';
import { MediaSessionCrew } from './entities/media-session-crew.entity';
import { MediaSessionEquipment } from './entities/media-session-equipment.entity';
import { MediaFile } from './entities/media-file.entity';
import { MediaPayment } from './entities/media-payment.entity';
import { MediaProjectEvent } from './entities/media-project-event.entity';
import { SocialAccount } from './entities/social-account.entity';
import { SocialPost } from './entities/social-post.entity';
import { SocialPostTarget } from './entities/social-post-target.entity';
import { SocialPostDailyStat } from './entities/social-post-daily-stat.entity';
import { SocialAccountDailyStat } from './entities/social-account-daily-stat.entity';
import { MediaCommonService } from './services/media-common.service';
import { MediaCatalogService } from './services/media-catalog.service';
import { MediaProjectService } from './services/media-project.service';
import { MediaScheduleService } from './services/media-schedule.service';
import { MediaLibraryService } from './services/media-library.service';
import { MediaSocialService } from './services/media-social.service';
import { MediaController } from './media.controller';
import { MediaPublicController } from './media-public.controller';
import { MediaSocialController } from './media-social.controller';

/** BackOffice — Média : filmage, photographie, services digitaux, réseaux sociaux */
@Module({
  imports: [
    NotificationsModule,
    FilesModule,
    TypeOrmModule.forFeature([
      MediaServiceEntity,
      MediaTeamMember,
      MediaProject,
      MediaProjectItem,
      MediaSession,
      MediaSessionCrew,
      MediaSessionEquipment,
      MediaFile,
      MediaPayment,
      MediaProjectEvent,
      SocialAccount,
      SocialPost,
      SocialPostTarget,
      SocialPostDailyStat,
      SocialAccountDailyStat,
      Asset,
      UserEntity,
      CompanyEntity,
    ]),
  ],
  controllers: [MediaSocialController, MediaController, MediaPublicController],
  providers: [MediaCommonService, MediaCatalogService, MediaProjectService, MediaScheduleService, MediaLibraryService, MediaSocialService],
  exports: [MediaProjectService, MediaScheduleService, MediaSocialService],
})
export class MediaModule { }
