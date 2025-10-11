import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { ProductStatus } from 'src/products/enum/product.status.enum';
import { ServiceHasPrestataire } from './service_has_prestataire.entity';

@Entity('services')
export class Service {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  basePrice?: number;

  // Stockage JSON comme string longue pour MySQL
  @Column({
    type: 'longtext',
    nullable: true,
    transformer: {
      to: (value: string[]) => JSON.stringify(value),
      from: (value: string) => (value ? JSON.parse(value) : []),
    },
  })
  image?: string[];

  @Column({ type: 'enum', enum: ProductStatus, default: ProductStatus.PENDING })
  status: ProductStatus;

  @ManyToOne(() => CategoryEntity, (category) => category.providers)
  category: CategoryEntity;

  @ManyToOne(() => CompanyEntity, (company) => company.services)
  @JoinColumn({ name: 'companyId' })
  company: CompanyEntity;

  @Column({ nullable: true })
  companyId?: string;

  // 🔗 Relation vers la table pivot
  @OneToMany(() => ServiceHasPrestataire, (shp) => shp.service)
  prestataires: ServiceHasPrestataire[];


  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
