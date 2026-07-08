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
  tarif?: any;

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
