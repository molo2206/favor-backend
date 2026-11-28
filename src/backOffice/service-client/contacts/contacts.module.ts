import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LtaEntity } from 'src/shipment/Lta/entity/lta.entity';
import { ServiceClientContact } from './entities/service-client-contact.entity';
import { ServiceClientObjective } from './entities/service-client-objective.entity';
import { ServiceClientContactsService } from './contacts.service';
import { ServiceClientContactsController } from './contacts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceClientContact, ServiceClientObjective, LtaEntity])],
  controllers: [ServiceClientContactsController],
  providers: [ServiceClientContactsService],
  exports: [ServiceClientContactsService],
})
export class ServiceClientContactsModule {}
