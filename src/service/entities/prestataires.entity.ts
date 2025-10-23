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

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ nullable: true })
  photo?: string;

  @Column({ type: 'json', nullable: true })
  experience?: any;

  @Column({ type: 'json', nullable: true })
  specialite?: any;

  @Column({ type: 'json', nullable: true })
  competence?: any;

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
