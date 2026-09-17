import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { NetworkProvider } from './network-provider.entity';

@Entity('country_providers')
export class CountryProvider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 10 })
  code: string;

  @Column({ nullable: true })
  image?: string;

  @OneToMany(() => NetworkProvider, (networkProvider) => networkProvider.country)
  networkProviders: NetworkProvider[];

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
