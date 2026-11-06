import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { Service } from 'src/service/entities/service.entity';
import { PrestataireEntity } from './prestataires.entity';
import { PrestataireStatus } from '../enum/prestataire-status.enum';
import { PrestataireType } from '../enum/prestataire-type.enum';
import { PrestataireRole } from '../enum/prestataire-role.enum';

@Entity('service_has_prestataire')
@Unique(['serviceId', 'prestataireId'])
export class ServiceHasPrestataire {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 🔗 Service
  @ManyToOne(() => Service, (service) => service.prestataires, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'serviceId' })
  service: Service;

  @Column()
  serviceId: string;

  // 🔗 Prestataire
  @ManyToOne(() => PrestataireEntity, (prestataire) => prestataire.services, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'prestataireId' })
  prestataire: PrestataireEntity;

  @Column()
  prestataireId: string;

  @Column({ type: 'decimal', nullable: true })
  tarif?: number;

  @Column({ default: true })
  actif: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
