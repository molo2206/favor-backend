import { IsOptional, IsString, IsObject, IsNumber } from 'class-validator';

export class CreateAppSettingDto {
  /** Seul champ obligatoire */
  @IsString()
  appName: string;

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
  service_phone?: string;

  @IsString()
  @IsOptional()
  market_phone?: string;

  @IsString()
  @IsOptional()
  restaurant_phone?: string;

  @IsString()
  @IsOptional()
  car_phone?: string;

  @IsString()
  @IsOptional()
  rental_phone?: string;

  @IsString()
  @IsOptional()
  booking_phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  defaultCurrency?: string;

  @IsString()
  @IsOptional()
  defaultLanguage?: string;

  /** ⚙️ Modules activés / configuration générale */
  @IsObject()
  @IsOptional()
  config?: any;

  /** Support client */
  @IsObject()
  @IsOptional()
  support?: {
    email?: string;
    phone?: string;
    workingHours?: string;
    faqUrl?: string;
    liveChatEnabled?: boolean;
  };

  @IsObject()
  @IsOptional()
  legal?: {
    companyName?: string;
    registrationNumber?: string;
    taxNumber?: string;
    country?: string;
    city?: string;
  };

  /** SEO */
  @IsObject()
  @IsOptional()
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string[];
    ogImage?: string;
    favicon?: string;
  };

  /** Paramètres financiers */
  @IsNumber()
  @IsOptional()
  exchangeRate?: number;

  @IsNumber()
  @IsOptional()
  ecommerceDeliveryFee?: number;

  @IsNumber()
  @IsOptional()
  marketDeliveryFee?: number;

  @IsNumber()
  @IsOptional()
  restaurantBaseDeliveryFee?: number;

  @IsNumber()
  @IsOptional()
  restaurantExtraFeePerItem?: number;

  /** 📝 Politique & conditions */
  @IsString()
  @IsOptional()
  privacyPolicy?: string;

  @IsString()
  @IsOptional()
  termsOfUse?: string;
}
