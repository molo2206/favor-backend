// network-provider.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CountryProvider } from './country-provider.entity';
import { DecimalTransformer } from 'src/users/utility/common/transformers/decimal.transformer';

@Entity('network_providers')
export class NetworkProvider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'json' })
  currency: string[];

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: new DecimalTransformer(),
  })
  pourcentage: number;

  @Column({ nullable: true })
  image?: string;

  @ManyToOne(() => CountryProvider, (country) => country.networkProviders)
  @JoinColumn({ name: 'country_provider_id' })
  country: CountryProvider;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
