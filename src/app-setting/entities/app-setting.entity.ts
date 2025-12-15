import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('app_settings')
export class AppSettingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Informations basiques */
  @Column({ type: 'varchar', length: 255, nullable: true })
  appName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  slogan?: string;

  @Column({ type: 'text', nullable: true })
  logo?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  service_phone?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  market_phone?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  restaurant_phone?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  car_phone?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  rental_phone?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  booking_phone?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address?: string;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  defaultCurrency: string;

  @Column({ type: 'varchar', length: 10, default: 'fr' })
  defaultLanguage: string;

  /** Support multi-plateforme */
  @Column({
    type: 'longtext',
    nullable: true,
    transformer: {
      to: (value: any) => JSON.stringify(value),
      from: (value: string) => (value ? JSON.parse(value) : {}),
    },
  })
  support?: {
    email?: string;
    phone?: string;
    workingHours?: string;
    faqUrl?: string;
    liveChatEnabled?: boolean;
    platforms?: Record<string, any>;
  };

  /** SEO multi-plateforme */
  @Column({
    type: 'longtext',
    nullable: true,
    transformer: {
      to: (value: any) => JSON.stringify(value),
      from: (value: string) => (value ? JSON.parse(value) : {}),
    },
  })
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string[];
    ogImage?: string;
    favicon?: string;
    platforms?: Record<string, any>;
    advancedConfig?: Record<string, any>;
  };

  /** Config générale multi-plateforme */
  @Column({
    type: 'longtext',
    nullable: true,
    transformer: {
      to: (value: any) => JSON.stringify(value),
      from: (value: string) => (value ? JSON.parse(value) : {}),
    },
  })
  config?: {
    platforms?: Record<string, any>;
    integrations?: Record<string, boolean>;
    theme?: Record<string, any>;
    socialLinks?: Record<string, string>;
    system?: Record<string, any>;
    advancedConfig?: Record<string, any>;
  };

  /** Paramètres financiers */
  @Column('decimal', { precision: 10, scale: 2, default: 1 })
  exchangeRate: number;

  @Column('decimal', { precision: 10, scale: 2, default: 2.5 })
  ecommerceDeliveryFee: number;

  @Column('decimal', { precision: 10, scale: 2, default: 3 })
  marketDeliveryFee: number;

  @Column('decimal', { precision: 10, scale: 2, default: 2 })
  restaurantBaseDeliveryFee: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0.5 })
  restaurantExtraFeePerItem: number;

  /** Politique et conditions */
  @Column({ type: 'longtext', nullable: true })
  privacyPolicy?: string;

  @Column({ type: 'longtext', nullable: true })
  termsOfUse?: string;

  /** Informations légales */
  @Column({
    type: 'longtext',
    nullable: true,
    transformer: {
      to: (value: any) => JSON.stringify(value),
      from: (value: string) => (value ? JSON.parse(value) : {}),
    },
  })
  legal?: {
    companyName?: string;
    registrationNumber?: string;
    taxNumber?: string;
    country?: string;
    city?: string;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  constructor() {
    this.config = {
      platforms: {},
      integrations: {},
      theme: {},
      socialLinks: {},
      system: {},
      advancedConfig: {},
    };
    this.support = {};
    this.seo = {};
    this.legal = {};
  }
}
