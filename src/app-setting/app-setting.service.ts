import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSetting } from './entities/app-setting.entity';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';

@Injectable()
export class AppSettingService {
  constructor(
    @InjectRepository(AppSetting)
    private readonly appSettingRepo: Repository<AppSetting>,
    private readonly cloudinary: CloudinaryService,
  ) {}

  /** Méthode interne pour récupérer la configuration globale */
  private async getSetting(): Promise<AppSetting> {
    const setting = await this.appSettingRepo.findOne({ where: {} });
    if (!setting) throw new NotFoundException('Configuration globale non trouvée');
    return setting;
  }

  /** Créer ou mettre à jour la configuration globale */
  async createOrUpdate(
    config: Record<string, any>,
  ): Promise<{ data: AppSetting; message: string }> {
    let setting = await this.appSettingRepo.findOne({ where: {} });

    if (setting) {
      setting.config = { ...setting.config, ...config };
      const updated = await this.appSettingRepo.save(setting);
      return { data: updated, message: 'Configuration mise à jour avec succès' };
    }

    setting = this.appSettingRepo.create({ config });
    const saved = await this.appSettingRepo.save(setting);
    return { data: saved, message: 'Configuration créée avec succès' };
  }

  /** Récupérer toute la configuration globale */
  async findOne(): Promise<{ data: Record<string, any>; message: string }> {
    const setting = await this.getSetting();
    if (!setting.config) setting.config = {};
    return { data: setting.config, message: 'Configuration globale récupérée avec succès' };
  }

  /** Mettre à jour une valeur spécifique dans la config */
  async updateKey(key: string, value: any): Promise<{ data: AppSetting; message: string }> {
    const setting = await this.getSetting();
    setting.config = { ...setting.config, [key]: value };
    const updated = await this.appSettingRepo.save(setting);
    return { data: updated, message: `Valeur '${key}' mise à jour avec succès` };
  }

  /** Récupérer une valeur spécifique */
  async getKey(key: string): Promise<{ data: any; message: string }> {
    const setting = await this.getSetting();
    const value = setting.config?.[key];
    return { data: value, message: `Valeur '${key}' récupérée avec succès` };
  }

  /** Supprimer la configuration globale */
  async remove(): Promise<{ data: null; message: string }> {
    const setting = await this.getSetting();
    await this.appSettingRepo.remove(setting);
    return { data: null, message: 'Configuration supprimée avec succès' };
  }

  /** Calcul dynamique des frais de livraison restaurant */
  async calculateRestaurantDeliveryFee(
    itemCount: number,
  ): Promise<{ data: number; message: string }> {
    const setting = await this.getSetting();
    const config = setting.config as any; // <--- ou un type plus précis si tu veux

    const baseFee = Number(config.restaurantBaseDeliveryFee ?? 3);
    const extraFee = Number(config.restaurantExtraFeePerItem ?? 1);
    const totalFee = itemCount <= 1 ? baseFee : baseFee + (itemCount - 1) * extraFee;

    return { data: totalFee, message: `Frais de livraison calculés pour ${itemCount} plat(s)` };
  }

  /** Upload fichier(s) vers Cloudinary */
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
