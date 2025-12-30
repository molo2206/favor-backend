import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { CompanyEntity } from '../../company/entities/company.entity';
import { CompanyStatus } from '../../company/enum/company-status.enum';
import { Country } from 'src/company/entities/country.entity';
import { City } from 'src/company/entities/city.entity';

@Entity('branches')
export class BranchEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @ManyToOne(() => Country, { nullable: true })
  @JoinColumn({ name: 'countryId' })
  country?: Country;

  @Column({ nullable: true })
  countryId?: string;

  @ManyToOne(() => City, { nullable: true })
  @JoinColumn({ name: 'cityId' })
  city?: City;

  @Column({ nullable: true })
  cityId?: string;

  @Column({ default: true })
  status: boolean;

  @Column({ default: false })
  deleted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
