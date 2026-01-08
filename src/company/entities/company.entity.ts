import { MeasureEntity } from 'src/measure/entities/measure.entity';
import { Product } from 'src/products/entities/product.entity';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { CompanyActivity } from 'src/company/enum/activity.company.enum';
import { CompanyStatus } from 'src/company/enum/company-status.enum';
import { CompanyType } from 'src/company/enum/type.company.enum';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Service } from 'src/service/entities/service.entity';
import { Room } from 'src/room/entities/room.entity';
import { TauxCompany } from 'src/taux-company/entities/taux-company.entity';
import { IsNumber, IsString } from 'class-validator';
import { BranchEntity } from '../../branch/entity/branch.entity';
import { Country } from './country.entity';
import { City } from './city.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';

@Entity('company')
export class CompanyEntity {
  // Champs spécifiques aux fournisseurs

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false })
  companyName?: string;

  @Column({ nullable: true })
  companyAddress?: string;

  @Column({ nullable: true })
  vatNumber?: string;

  @Column({ nullable: true })
  registrationDocumentUrl?: string;

  @Column({ nullable: true })
  warehouseLocation?: string;

  @Column({ nullable: true, type: 'varchar', length: 255 })
  banner: string | null;

  @Column({ nullable: true, type: 'varchar', length: 255 })
  logo: string | null;

  @Column({ type: 'enum', enum: CompanyStatus, default: CompanyStatus.PENDING })
  status: CompanyStatus;

  @OneToMany(() => UserHasCompanyEntity, (userHasCompany) => userHasCompany.company)
  userHasCompany: UserHasCompanyEntity[];

  @Column({ type: 'enum', enum: CompanyType })
  typeCompany: CompanyType;

  @OneToMany(() => Product, (product) => product.company)
  products: Product[];

  @Column({ nullable: true })
  email: string;

  @Column()
  phone: string;

  @Column({ nullable: true })
  website: string;

  @Column({
    type: 'enum',
    enum: CompanyActivity,
    default: CompanyActivity.RETAILER,
  })
  companyActivity: CompanyActivity;

  @OneToMany(() => MeasureEntity, (measure) => measure.company)
  measures: MeasureEntity[];

  @Column({ nullable: true })
  delivery_minutes: string;

  @Column({ nullable: true })
  distance_km: string;

  @Column({ nullable: true })
  open_time: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  latitude: string;

  @Column({ nullable: true })
  longitude: string;

  @OneToMany(() => Service, (service) => service.company)
  services: Service[];

  @OneToMany(() => Room, (room) => room.company)
  rooms: Room[];

  @OneToMany(() => TauxCompany, (taux) => taux.company)
  tauxCompanies: TauxCompany[];

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  @IsNumber()
  @IsString()
  taux: number;

  @Column({ type: 'varchar', nullable: true, length: 22 })
  localCurrency: string;

  @ManyToOne(() => Country, { nullable: true })
  @JoinColumn({ name: 'countryId' })
  country?: Country;

  @Column({ nullable: true })
  countryId?: string;

  @ManyToOne(() => CategoryEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  category?: CategoryEntity | null;

  @Column({ nullable: true })
  categoryId?: string | null;

  @ManyToOne(() => City, { nullable: true })
  @JoinColumn({ name: 'cityId' })
  city?: City;

  @Column({ nullable: true })
  cityId?: string;

  @CreateDateColumn({ nullable: true })
  createdAt?: Date;
  
}
