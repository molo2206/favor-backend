import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@favor/database';

/** Colonne longtext JSON (comme le transformer TypeORM : vide → {}) */
function json(value: string | null | undefined): any {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

/** decimal(10,2) : TypeORM renvoie une chaîne ("2.50") — on garde exactement ce format */
function dec(value: any, fallback: number): string | number {
  if (value === null || value === undefined) return fallback;
  return Number(value).toFixed(2);
}

/**
 * ✅ Paramètres globaux — version microservice (Prisma).
 * Réponse identique à GET /app-setting de l'application actuelle (AppSettingService.findOne / formatSetting).
 * Les écritures (POST /app-setting, upload du logo, suppression) restent dans l'application actuelle.
 */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) { }

  async findOne() {
    const s = await this.prisma.app_settings.findFirst();
    if (!s) throw new NotFoundException('Configuration globale non trouvée');
    return {
      data: {
        appName: s.appName ?? '',
        slogan: s.slogan ?? '',
        logo: s.logo ?? '',
        email: s.email ?? '',
        phone: s.phone ?? '',
        service_phone: s.service_phone ?? '',
        market_phone: s.market_phone ?? '',
        restaurant_phone: s.restaurant_phone ?? '',
        car_phone: s.car_phone ?? '',
        rental_phone: s.rental_phone ?? '',
        booking_phone: s.booking_phone ?? '',
        address: s.address ?? '',
        defaultCurrency: s.defaultCurrency ?? 'USD',
        defaultLanguage: s.defaultLanguage ?? 'fr',
        seo: json(s.seo),
        config: json(s.config),
        support: json(s.support),
        legal: json(s.legal),
        exchangeRate: dec(s.exchangeRate, 1),
        ecommerceDeliveryFee: dec(s.ecommerceDeliveryFee, 0),
        marketDeliveryFee: dec(s.marketDeliveryFee, 0),
        restaurantBaseDeliveryFee: dec(s.restaurantBaseDeliveryFee, 0),
        restaurantExtraFeePerItem: dec(s.restaurantExtraFeePerItem, 0),
        privacyPolicy: s.privacyPolicy ?? '',
        termsOfUse: s.termsOfUse ?? '',
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      },
      message: 'Configuration globale récupérée avec succès',
    };
  }
}
