import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('app_settings')
export class AppSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 🏷️ Informations basiques */
  @Column({ type: 'varchar', length: 255, default: 'My Platform' })
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

  /** ⚙️ Paramètres configurables en JSON */
  @Column({
    type: 'longtext',
    nullable: true,
    transformer: {
      to: (value: any) => JSON.stringify(value),
      from: (value: string) => (value ? JSON.parse(value) : {}),
    },
  })
  config?: {
    modules?: {
      ecommerce?: boolean;
      restaurant?: boolean;
      services?: boolean;
      cars?: boolean;
      rentals?: boolean;
      delivery?: boolean;
      tracking?: boolean;
      booking?: boolean;
    };
    integrations?: {
      stripe?: boolean;
      paypal?: boolean;
      mobileMoney?: boolean;
      sms?: boolean;
      pushNotification?: boolean;
      manualPayment?: boolean;
    };
    theme?: {
      mode?: 'light' | 'dark';
      primaryColor?: string;
      secondaryColor?: string;
      logoDark?: string;
      logoLight?: string;
    };
    socialLinks?: {
      facebook?: string;
      instagram?: string;
      twitter?: string;
      whatsapp?: string;
      youtube?: string;
    };
    system?: {
      maintenanceMode?: boolean;
      maintenanceMessage?: string;
      allowUserRegistration?: boolean;
    };
    advancedConfig?: Record<string, any>;
  };

  /** 💰 Paramètres financiers */
  @Column('decimal', { precision: 10, scale: 2, default: 1 })
  exchangeRate: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  ecommerceDeliveryFee: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  marketDeliveryFee: number;

  @Column('decimal', { precision: 10, scale: 2, default: 3 })
  restaurantBaseDeliveryFee: number;

  @Column('decimal', { precision: 10, scale: 2, default: 1 })
  restaurantExtraFeePerItem: number;

  /** 📝 Politique et conditions */
  @Column({ type: 'longtext', nullable: true })
  privacyPolicy?: string;

  @Column({ type: 'longtext', nullable: true })
  termsOfUse?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  constructor() {
    this.config = {
      modules: {},
      integrations: {},
      theme: {},
      socialLinks: {},
      system: {},
      advancedConfig: {},
    };
  }
}
