import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ServiceHasPrestataire } from './service_has_prestataire.entity';
import { PrestataireStatus } from '../enum/prestataire-status.enum';

@Entity('prestataires')
export class PrestataireEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  full_name: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ nullable: true })
  image?: string;

  @Column({ type: 'text', nullable: true })
  experience?: string;

  @Column({ type: 'text', nullable: true })
  competence?: string;

  @Column({ type: 'text', nullable: true })
  specialite?: string;

  // 🔗 Relation vers la table pivot
  @OneToMany(() => ServiceHasPrestataire, (shp) => shp.prestataire)
  services: ServiceHasPrestataire[];

  @Column({ type: 'enum', enum: PrestataireStatus, default: PrestataireStatus.PENDING })
  status: PrestataireStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
