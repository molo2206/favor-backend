// src/company-tariff/entities/company-tariff.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { CompanyType } from 'src/company/enum/type.company.enum';

export enum ServiceType {
  PICKUP = 'PICKUP',
  SHIPPING = 'SHIPPING',
  DELIVERY = 'DELIVERY',
  FULL = 'FULL',
}

@Entity('company_tariffs')
export class CompanyTariffEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 🔗 ENTREPRISE (clé principale) - nullable
  @Column({ name: 'company_id', type: 'varchar', length: 36, nullable: true })
  companyId: string | null;

  @ManyToOne(() => CompanyEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'company_id' })
  company: CompanyEntity | null;

  // fallback si pas de company spécifique
  @Column({
    type: 'enum',
    enum: CompanyType,
    nullable: true,
  })
  company_type: CompanyType | null;

  @Column({
    type: 'enum',
    enum: ServiceType,
    nullable: true,
  })
  service_type: ServiceType | null;

  // 🌍 TRAJET
  @Column({ type: 'varchar', length: 100, nullable: true })
  from_country: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  from_city: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  to_country: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  to_city: string | null;

  // 💰 TARIFS
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    default: 0,
  })
  base_price: number | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    default: 0,
  })
  price_per_km: number | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    default: 0,
  })
  price_per_kg: number | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    default: 0,
  })
  price_per_item: number | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    default: 0,
  })
  min_price: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  max_price: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  max_weight: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  max_distance: number | null;

  @Column({ type: 'varchar', length: 10, nullable: true, default: 'USD' })
  currency: string | null;

  @Column({ type: 'boolean', nullable: true, default: true })
  is_active: boolean | null;

  @CreateDateColumn({ type: 'datetime', nullable: true })
  created_at: Date | null;

  @UpdateDateColumn({ type: 'datetime', nullable: true })
  updated_at: Date | null;
}
