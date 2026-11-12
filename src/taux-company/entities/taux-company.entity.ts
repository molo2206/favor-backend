import { CompanyEntity } from 'src/company/entities/company.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity('taux_company')
export class TauxCompany {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string; // Exemple : "Taux de change USD-CDF"

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  value: number;

  @Column({ type: 'varchar', length: 10, default: 'CDF' })
  currency: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /** 🔗 Relation vers Company */
  @ManyToOne(() => CompanyEntity, (company) => company.tauxCompanies, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'companyId' })
  company: CompanyEntity;

  

  @Column({ type: 'uuid' })
  companyId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
