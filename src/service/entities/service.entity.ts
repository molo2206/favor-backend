import { CategoryEntity } from 'src/category/entities/category.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { ProductStatus } from 'src/products/enum/product.status.enum';
import { ReservService } from 'src/reserv-service/entities/reserv-service.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class Service {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  full_name: string;

  @Column({ nullable: true })
  fonction?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price?: number;

  @Column({ type: 'json', nullable: true })
  imageUrls: string[];

  @Column({ type: 'enum', enum: ProductStatus, default: ProductStatus.PENDING })
  status: ProductStatus;

  @ManyToOne(() => CategoryEntity, (category) => category.providers)
  category: CategoryEntity;

  @OneToMany(() => ReservService, (reservation) => reservation.provider)
  reservations: ReservService[];

  @ManyToOne(() => CompanyEntity, (company) => company.services)
  @JoinColumn({ name: 'companyId' })
  company: CompanyEntity;

  @Column({ nullable: true })
  companyId?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
