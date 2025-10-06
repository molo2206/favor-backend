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

  @Column({ default: 'My Platform' })
  appName: string;

  @Column({ nullable: true })
  slogan?: string;

  @Column({ nullable: true })
  logo?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  address?: string;

  @Column({ default: 'USD' })
  defaultCurrency: string;

  @Column({ default: 'fr' })
  defaultLanguage: string;

  /** Modules activés */
  @Column('json', { default: '{}' })
  modules: {
    ecommerce?: boolean;
    restaurant?: boolean;
    services?: boolean;
    cars?: boolean;
    rentals?: boolean;
    delivery?: boolean;
    tracking?: boolean;
    booking?: boolean;
  };

  /** Intégrations principales */
  @Column('json', { default: '{}' })
  integrations: {
    stripe?: boolean;
    paypal?: boolean;
    mobileMoney?: boolean;
    sms?: boolean;
    pushNotification?: boolean;
    manualPayment?: boolean;
  };

  /** Apparence de la plateforme */
  @Column('json', { default: '{}' })
  theme: {
    mode?: 'light' | 'dark';
    primaryColor?: string;
    secondaryColor?: string;
    logoDark?: string;
    logoLight?: string;
  };

  /** Réseaux sociaux */
  @Column('json', { default: '{}' })
  socialLinks: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    whatsapp?: string;
    youtube?: string;
  };

  /** Paramètres financiers */
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

  /** Paramètres système */
  @Column('json', { default: '{}' })
  system: {
    maintenanceMode?: boolean;
    maintenanceMessage?: string;
    allowUserRegistration?: boolean;
  };

  /** Configuration avancée */
  @Column('json', { default: '{}' })
  advancedConfig: Record<string, any>;

  /** Politique et conditions d'utilisation */
  @Column('text', { nullable: true })
  privacyPolicy?: string;

  @Column('text', { nullable: true })
  termsOfUse?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
