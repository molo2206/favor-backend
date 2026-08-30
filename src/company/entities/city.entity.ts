// city.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Country } from './country.entity';
import { ServiceZone } from 'src/Course/ServiceZone/entity/ServiceZone.entity';
import { Pricing } from 'src/Course/Pricing/entity/Pricing.entity';

export interface QuantityTier {
  min: number;
  max: number;
  fee: number;
  label?: string;
}

export interface DeliveryFees {
  currency: string;           // Devise (USD, CDF, EUR, etc.)
  baseFee: number;
  quantityTiers?: QuantityTier[];
  perKm?: number;
  perKg?: number;
  freeDeliveryThreshold?: number;
  rushFee?: number;
  nightFee?: number;
  zones?: {
    name: string;
    fee: number;
    radius: number;
  }[];
}

@Entity('cities')
export class City {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @ManyToOne(() => Country, (country) => country.cities, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'countryId' })
  country: Country;

  @Column()
  countryId: string;

  @Column({ type: 'json', nullable: true })
  tarif?: DeliveryFees | any;

  @OneToMany(() => ServiceZone, (zone) => zone.city)
  zones: ServiceZone[];

  @OneToMany(() => Pricing, (pricing) => pricing.city)
  pricings: Pricing[];

  @Column({ type: 'boolean', default: true })
  status: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}