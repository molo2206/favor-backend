import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';

/**
 * ✅ Logisticien désigné par le propriétaire de l'entreprise :
 * il valide les demandes de matériel et fait les sorties (avec le propriétaire et l'admin plateforme).
 */
@Entity('bo_logistics_managers')
@Unique('uq_bo_logistics_manager', ['companyId', 'userId'])
export class LogisticsManager {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
