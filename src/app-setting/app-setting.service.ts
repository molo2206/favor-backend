import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';
import { AppSettingEntity } from './entities/app-setting.entity';

@Injectable()
export class AppSettingService {
  constructor(
    @InjectRepository(AppSettingEntity)
    private readonly appSettingRepo: Repository<AppSettingEntity>,
    private readonly cloudinary: CloudinaryService,
  ) {}

  /** 🔹 Récupérer la configuration globale */
  private async getSetting(): Promise<AppSettingEntity> {
    const setting = await this.appSettingRepo.findOne({ where: {} });
    if (!setting) throw new NotFoundException('Configuration globale non trouvée');
    return setting;
  }

  /** 🔹 Formatage complet pour le frontend */
  private formatSetting(setting: AppSettingEntity) {
    return {
      appName: setting.appName ?? '',
      slogan: setting.slogan ?? '',
      logo: setting.logo ?? '',
      email: setting.email ?? '',
      phone: setting.phone ?? '',
      service_phone: setting.service_phone ?? '',
      market_phone: setting.market_phone ?? '',
      restaurant_phone: setting.restaurant_phone ?? '',
      car_phone: setting.car_phone ?? '',
      rental_phone: setting.rental_phone ?? '',
      booking_phone: setting.booking_phone ?? '',
      address: setting.address ?? '',
      defaultCurrency: setting.defaultCurrency ?? 'USD',
      defaultLanguage: setting.defaultLanguage ?? 'fr',
      seo: setting.seo ?? {},
      config: setting.config ?? {},
      support: setting.support ?? {},
      legal: setting.legal ?? {},
      exchangeRate: setting.exchangeRate ?? 1,
      ecommerceDeliveryFee: setting.ecommerceDeliveryFee ?? 0,
      marketDeliveryFee: setting.marketDeliveryFee ?? 0,
      restaurantBaseDeliveryFee: setting.restaurantBaseDeliveryFee ?? 0,
      restaurantExtraFeePerItem: setting.restaurantExtraFeePerItem ?? 0,
      privacyPolicy: setting.privacyPolicy ?? '',
      termsOfUse: setting.termsOfUse ?? '',
      createdAt: setting.createdAt,
      updatedAt: setting.updatedAt,
    };
  }

  /** 🔹 Créer ou mettre à jour la configuration globale */
  /** 🔹 Créer ou mettre à jour la configuration globale */
  async createOrUpdate(
    config: DeepPartial<AppSettingEntity>,
  ): Promise<{ data: any; message: string }> {
    // Récupère la configuration existante (il ne doit y en avoir qu’une)
    let setting = await this.appSettingRepo.findOne({ where: {} });

    // 🔸 Conversion des champs numériques
    const numericFields = [
      'exchangeRate',
      'ecommerceDeliveryFee',
      'marketDeliveryFee',
      'restaurantBaseDeliveryFee',
      'restaurantExtraFeePerItem',
    ];
    numericFields.forEach((key) => {
      if (config[key] !== undefined && config[key] !== null) {
        const value = Number(config[key]);
        if (!isNaN(value)) config[key] = value;
      }
    });

    // 🔸 Normalisation des intégrations (booléens)
    if (config.config?.integrations) {
      const normalizedIntegrations: Record<string, boolean> = {};
      Object.entries(config.config.integrations).forEach(([key, value]) => {
        normalizedIntegrations[key] = !!value;
      });
      config.config.integrations = normalizedIntegrations;
    }

    if (setting) {
      // ✅ Mise à jour si déjà existant
      Object.assign(setting, config);
      const updated = await this.appSettingRepo.save(setting);
      return {
        data: this.formatSetting(updated),
        message: 'Configuration mise à jour avec succès',
      };
    } else {
      // ✅ Création si aucune configuration
      const newSetting = this.appSettingRepo.create(config);
      const saved = await this.appSettingRepo.save(newSetting);
      return { data: this.formatSetting(saved), message: 'Configuration créée avec succès' };
    }
  }

  /** 🔹 Récupérer toute la configuration globale */
  async findOne(): Promise<{ data: any; message: string }> {
    const setting = await this.getSetting();
    return {
      data: this.formatSetting(setting),
      message: 'Configuration globale récupérée avec succès',
    };
  }

  /** 🔹 Mettre à jour une clé simple ou imbriquée (ex: config.theme.primaryColor) */
  async updateKey(key: string, value: any): Promise<{ data: any; message: string }> {
    const setting = await this.getSetting();

    const keys = key.split('.');
    let target: any = setting;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!target[keys[i]]) target[keys[i]] = {};
      target = target[keys[i]];
    }
    target[keys[keys.length - 1]] = value;

    const updated = await this.appSettingRepo.save(setting);
    return {
      data: this.formatSetting(updated),
      message: `Valeur '${key}' mise à jour avec succès`,
    };
  }

  /** 🔹 Supprimer la configuration globale */
  async remove(): Promise<{ data: null; message: string }> {
    const setting = await this.getSetting();
    await this.appSettingRepo.remove(setting);
    return { data: null, message: 'Configuration supprimée avec succès' };
  }

  /** 🔹 Calcul dynamique des frais de livraison restaurant */
  async calculateRestaurantDeliveryFee(
    itemCount: number,
  ): Promise<{ data: number; message: string }> {
    const setting = await this.getSetting();
    const baseFee = Number(setting.restaurantBaseDeliveryFee ?? 3);
    const extraFee = Number(setting.restaurantExtraFeePerItem ?? 1);
    const totalFee = itemCount <= 1 ? baseFee : baseFee + (itemCount - 1) * extraFee;
    return { data: totalFee, message: `Frais de livraison calculés pour ${itemCount} plat(s)` };
  }

  /** 🔹 Upload fichier(s) vers Cloudinary */
  async uploadToCloudinary(
    files: Express.Multer.File | Express.Multer.File[],
    folder: string,
  ): Promise<string | string[]> {
    if (!files) throw new BadRequestException('Au moins un fichier est requis.');
    const fileArray = Array.isArray(files) ? files : [files];
    const uploadedUrls = await Promise.all(
      fileArray.map((file) => this.cloudinary.handleUploadFile(file, folder)),
    );
    return Array.isArray(files) ? uploadedUrls : uploadedUrls[0];
  }
}
