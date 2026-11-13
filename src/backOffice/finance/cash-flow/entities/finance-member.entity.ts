import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { UserEntity } from 'src/users/entities/user.entity';
import { FinanceRole } from '../common/cash-flow.enums';

/**
 * ✅ Équipe finance de l'entreprise, désignée par le propriétaire :
 * MANAGER (responsable financier), CASHIER (caissier), VIEWER (lecture).
 * Le propriétaire de l'entreprise et l'admin plateforme sont toujours MANAGER.
 */
@Entity('bo_finance_members')
@Unique('uq_bo_finance_member', ['companyId', 'userId'])
export class FinanceMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 10, default: FinanceRole.CASHIER })
  role: FinanceRole;

  /** Caissier limité à certains comptes (vide = tous) */
  @Column({ type: 'json', nullable: true })
  accountIds?: string[] | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById?: string | null;

  @CreateDateColumn({ type: 'datetime', precision: 6 })
  createdAt: Date;
}
