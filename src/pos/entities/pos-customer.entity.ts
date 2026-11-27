import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Client d'une entreprise au point de vente.
 * ⚠️ Ce n'est PAS un compte utilisateur du système : c'est un simple contact local à l'entreprise
 * (nom + téléphone suffisent). Recherche par nom ou téléphone. Propre à chaque entreprise (companyId).
 */
@Entity('pos_customers')
@Index('idx_pos_customer_company_phone', ['companyId', 'phone'])
@Index('idx_pos_customer_company_name', ['companyId', 'name'])
export class PosCustomer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note?: string | null;

  /** Lien facultatif vers un compte système si le client en a un (sinon null) */
  @Column({ type: 'varchar', length: 36, nullable: true })
  userId?: string | null;

  @Column({ type: 'tinyint', width: 1, default: 1 })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
