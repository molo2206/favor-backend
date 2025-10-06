import { IsBoolean, IsDecimal, IsNotEmpty, IsOptional, IsString, IsIn, IsObject } from 'class-validator';

export class CreateAppSettingDto {
  /** Informations générales */
  @IsString()
  @IsOptional()
  appName?: string;

  @IsString()
  @IsOptional()
  slogan?: string;

  @IsString()
  @IsOptional()
  logo?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  defaultCurrency?: string;

  @IsString()
  @IsOptional()
  defaultLanguage?: string;

  /** Modules activés */
  @IsObject()
  @IsOptional()
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

  /** Intégrations principales */
  @IsObject()
  @IsOptional()
  integrations?: {
    stripe?: boolean;
    paypal?: boolean;
    mobileMoney?: boolean;
    sms?: boolean;
    pushNotification?: boolean;
    manualPayment?: boolean;
  };

  /** Apparence / thème */
  @IsObject()
  @IsOptional()
  theme?: {
    mode?: 'light' | 'dark';
    primaryColor?: string;
    secondaryColor?: string;
    logoDark?: string;
    logoLight?: string;
  };

  /** Réseaux sociaux */
  @IsObject()
  @IsOptional()
  socialLinks?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    whatsapp?: string;
    youtube?: string;
  };

  /** Paramètres financiers */
  @IsDecimal()
  @IsOptional()
  exchangeRate?: number;

  @IsDecimal()
  @IsOptional()
  ecommerceDeliveryFee?: number;

  @IsDecimal()
  @IsOptional()
  marketDeliveryFee?: number;

  @IsDecimal()
  @IsOptional()
  restaurantBaseDeliveryFee?: number;

  @IsDecimal()
  @IsOptional()
  restaurantExtraFeePerItem?: number;

  /** Paramètres système */
  @IsObject()
  @IsOptional()
  system?: {
    maintenanceMode?: boolean;
    maintenanceMessage?: string;
    allowUserRegistration?: boolean;
  };

  /** Configuration avancée */
  @IsObject()
  @IsOptional()
  advancedConfig?: Record<string, any>;
}
