import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { NetworkProvider } from './network-provider.entity';

export enum CountryProviderStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('country_providers') // ✅ PLURIEL
export class CountryProvider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  name?: string;

  @Index('idx_country_providers_prefix')
  @Column({ type: 'varchar', length: 10, nullable: true })
  prefix?: string;

  @Index('idx_country_providers_code')
  @Column({ type: 'varchar', length: 10, nullable: true })
  code?: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  countryCode?: string;

  @Column({
    type: 'enum',
    enum: CountryProviderStatus,
    default: CountryProviderStatus.ACTIVE,
  })
  status: CountryProviderStatus;

  @Column({ type: 'int', default: 10 })
  minLength: number;

  @Column({ type: 'int', default: 13 })
  maxLength: number;

  @Column({ nullable: true })
  image?: string;

  @OneToMany(() => NetworkProvider, (networkProvider) => networkProvider.country)
  networkProviders: NetworkProvider[];

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}