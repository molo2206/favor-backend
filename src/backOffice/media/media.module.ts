import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { Asset } from 'src/backOffice/logistics/assets/entities/asset.entity';
// ✅ Briques existantes : notifications (WebSocket + base), push Firebase, fichiers
import { NotificationsModule } from 'src/notification/notifications.module';
import { FilesModule } from 'src/files/files.module';
import { MediaServiceEntity } from './entities/media-service.entity';
import { MediaProject } from './entities/media-project.entity';
import { MediaProjectItem } from './entities/media-project-item.entity';
import { MediaSession } from './entities/media-session.entity';
import { MediaSessionCrew } from './entities/media-session-crew.entity';
import { MediaSessionEquipment } from './entities/media-session-equipment.entity';
import { MediaFile } from './entities/media-file.entity';
import { MediaPayment } from './entities/media-payment.entity';
import { MediaProjectEvent } from './entities/media-project-event.entity';
import { MediaPublication } from './entities/media-publication.entity';
import { MediaPublicationStat } from './entities/media-publication-stat.entity';
import { MediaCommonService } from './services/media-common.service';
import { MediaCatalogService } from './services/media-catalog.service';
import { MediaProjectService } from './services/media-project.service';
import { MediaScheduleService } from './services/media-schedule.service';
import { MediaLibraryService } from './services/media-library.service';
import { MediaPublicationService } from './services/media-publication.service';
import { MediaController } from './media.controller';
import { MediaPublicController } from './media-public.controller';
import { MediaPublicationController } from './media-publication.controller';

/**
 * BackOffice — Média interne : filmage, photographie, services digitaux,
 * publications avec chiffres saisis par l'admin (vues, j'aime, commentaires, partages).
 * L'équipe est gérée par les Ressources humaines (employés RH).
 */
@Module({
  imports: [
    NotificationsModule,
    FilesModule,
    TypeOrmModule.forFeature([
      MediaServiceEntity,
      MediaProject,
      MediaProjectItem,
      MediaSession,
      MediaSessionCrew,
      MediaSessionEquipment,
      MediaFile,
      MediaPayment,
      MediaProjectEvent,
      MediaPublication,
      MediaPublicationStat,
      Asset,
      UserEntity,
      CompanyEntity,
    ]),
  ],
  controllers: [MediaPublicationController, MediaController, MediaPublicController],
  providers: [MediaCommonService, MediaCatalogService, MediaProjectService, MediaScheduleService, MediaLibraryService, MediaPublicationService],
  exports: [MediaProjectService, MediaScheduleService, MediaPublicationService],
})
export class MediaModule { }
