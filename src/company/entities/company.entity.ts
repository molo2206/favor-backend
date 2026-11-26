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
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Service } from 'src/service/entities/service.entity';
import { Room } from 'src/room/entities/room.entity';
import { TauxCompany } from 'src/taux-company/entities/taux-company.entity';
import { IsNumber, IsString } from 'class-validator';
import { Country } from './country.entity';
import { City } from './city.entity';
import { CategoryEntity } from 'src/category/entities/category.entity';
import { Vehicle } from 'src/voyage/vehicles/entities/vehicle.entity';
import { Trip } from 'src/voyage/trips/entities/trip.entity';
import { VehicleSchedule } from 'src/voyage/vehicles/entities/vehicle-schedule.entity';
import { CompanyHasResourceEntity } from 'src/company_has_usrResource/entities/company_has_Resource.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { CompanyHasPartnerEntity } from './company_has_partner.entity';
import { Meal } from 'src/voyage/meal/entity/meal.entity';
import { CompanySettingsEntity } from './company-settings.entity';
import { InvoiceConfigurationEntity } from './invoice-configuration.entity';
// Correction : importer CompanyHasResource (sans Entity)
export enum FeeType {
  FIXED = 'FIXED',
  PERCENT = 'PERCENT',
}

export enum CompanyPlatform {
  FAVOR_GROUP = 'FavorGroup',
  FAVOR_HELP = 'FavorHelp',
}

export enum FeeBasis {
  MONTH = 'MONTH',
  SHIPMENT = 'SHIPMENT',
  WAYBILL = 'WAYBILL',
}

@Entity('company')
export class CompanyEntity {
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

  @OneToMany(
    () => UserHasCompanyEntity,
    (userHasCompany) => userHasCompany.company,
  )
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

  // ============================================================
  // ✅ AJOUT : jours et heures d'ouverture
  // ============================================================
  /** Jours d'ouverture : ["MONDAY", "TUESDAY", …] (null = non renseigné) */
  @Column({ type: 'json', nullable: true })
  opening_days?: string[] | null;

  /** Heure d'ouverture "HH:mm" */
  @Column({ type: 'varchar', length: 5, nullable: true })
  opening_time?: string | null;

  /** Heure de fermeture "HH:mm" (plus petite que l'ouverture = ouvert la nuit) */
  @Column({ type: 'varchar', length: 5, nullable: true })
  closing_time?: string | null;

  /**
   * ✅ Horaires détaillés par jour (plusieurs plages, 24 h, nuit), comme Google :
   * { "MONDAY": [{ "open": "08:00", "close": "12:00" }, { "open": "14:00", "close": "18:00" }], "SUNDAY": [] }
   * null = non renseigné (on utilise alors opening_days / opening_time / closing_time).
   */
  @Column({ type: 'json', nullable: true })
  opening_hours?: Record<string, { open: string; close: string }[]> | null;

  /**
   * ✅ Horaires exceptionnels (jours fériés, inventaire…) :
   * [{ "date": "2026-12-25", "closed": true, "label": "Noël" }, { "date": "2026-12-31", "periods": [{ "open": "08:00", "close": "14:00" }] }]
   */
  @Column({ type: 'json', nullable: true })
  special_hours?: any[] | null;

  /** ✅ OPERATIONAL | TEMPORARILY_CLOSED | PERMANENTLY_CLOSED */
  @Column({ type: 'varchar', length: 30, default: 'OPERATIONAL' })
  opening_status?: string | null;

  /** ✅ Fermé temporairement jusqu'au (inclus) — AAAA-MM-JJ */
  @Column({ type: 'date', nullable: true })
  reopen_date?: string | null;

  /** ✅ Fuseau horaire IANA de l'entreprise (Africa/Lubumbashi, Africa/Kinshasa…) — null = selon le pays */
  @Column({ type: 'varchar', length: 64, nullable: true })
  timezone?: string | null;

  /**
   * ✅ Calculé à la lecture (non stocké) : statut d'ouverture comme Google
   * { isOpenNow, state: OPEN|CLOSES_SOON|CLOSED|OPENS_SOON|OPEN_24H|TEMPORARILY_CLOSED|PERMANENTLY_CLOSED|UNKNOWN,
   *   label: « Ouvert · Ferme à 18:00 », closesAt, opensAt, today, timezone }
   */
  openingInfo?: any;

  /**
   * Calculé à la lecture (non stocké) : ouvert maintenant ? null = horaires non renseignés.
   * Rempli par CompanyOpeningHoursSubscriber (pas de méthode dans l'entité : évite les erreurs de type sur Omit<CompanyEntity, …>)
   */
  isOpenNow?: boolean | null;

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

  start?: {
    totalProduct: number;
    totalCategory: number;
    totalCommande: number;
  };

  @OneToMany(() => Vehicle, (vehicle) => vehicle.company)
  vehicles!: Vehicle[];

  @OneToMany(() => VehicleSchedule, (schedule) => schedule.company)
  schedules!: VehicleSchedule[];

  @OneToMany(() => Trip, (trip) => trip.company)
  trips!: Trip[];

  @OneToMany(() => CompanyHasResourceEntity, (chr) => chr.company)
  companyResources: CompanyHasResourceEntity[];

  @OneToMany(() => BranchEntity, (branch) => branch.company)
  branches: BranchEntity[];

  @OneToMany(() => CompanyHasPartnerEntity, (relation) => relation.company)
  partners: CompanyHasPartnerEntity[];

  @OneToMany(
    () => CompanyHasPartnerEntity,
    (relation) => relation.partnerCompany,
  )
  partnerOf: CompanyHasPartnerEntity[];

  @Column({ type: 'boolean', default: false })
  isMain: boolean;

  @Column({ type: 'float', nullable: true, default: 0 })
  fee!: number;

  @Column({
    type: 'enum',
    enum: FeeType,
    nullable: true,
    default: FeeType.FIXED,
  })
  feeType!: FeeType;

  @Column({
    type: 'enum',
    enum: FeeBasis,
    nullable: true,
    default: FeeBasis.SHIPMENT,
  })
  feeB!: FeeBasis;

  @OneToMany(() => Meal, (meal) => meal.company)
  meals: Meal[];

  @OneToOne(() => CompanySettingsEntity, (settings) => settings.company, {
    cascade: true,
  })
  settings: CompanySettingsEntity;

  @OneToOne(
    () => InvoiceConfigurationEntity,
    (config) => config.company,
    { cascade: true },
  )
  invoiceConfiguration?: InvoiceConfigurationEntity;

  @Column({
    type: 'enum',
    enum: CompanyPlatform,
    default: CompanyPlatform.FAVOR_HELP,
  })
  typePlatform: CompanyPlatform;
}
