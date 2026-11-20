import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { DriverAssociation } from './driver-association.entity';

/** ✅ Statut du chauffeur */
export enum DriverType {
  /** Indépendant : aucune part d'association sur ses courses */
  PRIVATE = 'PRIVATE',
  /** Membre d'une association : l'association reçoit sa part sur chaque course */
  ASSOCIATION = 'ASSOCIATION',
}

/**
 * ✅ Profil chauffeur : privé ou membre d'une association.
 * Un chauffeur sans ligne ici est considéré PRIVÉ.
 */
@Entity('driver_profiles')
@Index('idx_driver_profile_assoc', ['associationId'])
export class DriverProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36, unique: true })
  driverId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driverId' })
  driver: UserEntity;

  @Column({ type: 'enum', enum: DriverType, default: DriverType.PRIVATE })
  type: DriverType;

  @Column({ type: 'varchar', length: 36, nullable: true })
  associationId?: string | null;

  @ManyToOne(() => DriverAssociation, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'associationId' })
  association?: DriverAssociation | null;

  /** N° de membre dans l'association (carte de membre) */
  @Column({ type: 'varchar', length: 50, nullable: true })
  memberNumber?: string | null;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  joinedAt?: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;

  /** Admin qui a fait le dernier changement */
  @Column({ type: 'varchar', length: 36, nullable: true })
  updatedById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime', precision: 6 })
  updatedAt: Date;
}
