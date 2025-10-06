import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSetting } from './entities/app-setting.entity';
import { CreateAppSettingDto } from './dto/create-app-setting.dto';
import { UpdateAppSettingDto } from './dto/update-app-setting.dto';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';

@Injectable()
export class AppSettingService {
  constructor(
    @InjectRepository(AppSetting)
    private readonly appSettingRepo: Repository<AppSetting>,
    private readonly cloudinary: CloudinaryService,
  ) {}

  /** Créer la configuration globale si elle n'existe pas encore */
  async create(createDto: CreateAppSettingDto): Promise<{ data: AppSetting; message: string }> {
    let setting = await this.appSettingRepo.findOne({ where: {} });

    if (setting) {
      // Si une config existe, on met à jour
      Object.assign(setting, createDto);
      const updated = await this.appSettingRepo.save(setting);
      return { data: updated, message: 'Configuration mise à jour avec succès' };
    }

    // Sinon on crée une nouvelle config
    setting = this.appSettingRepo.create(createDto);
    const saved = await this.appSettingRepo.save(setting);
    return { data: saved, message: 'Configuration créée avec succès' };
  }

  /** Récupérer la configuration globale */
  async findOne(): Promise<{ data: AppSetting; message: string }> {
    const setting = await this.appSettingRepo.findOne({
      where: {}, // obligatoire dans TypeORM 0.3.x
    });

    if (!setting) {
      throw new NotFoundException('Aucune configuration globale trouvée');
    }

    return { data: setting, message: 'Configuration globale récupérée avec succès' };
  }

  /** Mettre à jour la configuration globale */
  async update(updateDto: UpdateAppSettingDto): Promise<{ data: AppSetting; message: string }> {
    const setting = await this.appSettingRepo.findOne({
      where: {}, // obligatoire dans TypeORM 0.3.x
    });

    if (!setting) {
      throw new NotFoundException('Aucune configuration globale trouvée pour mise à jour');
    }

    Object.assign(setting, updateDto);
    const updated = await this.appSettingRepo.save(setting);

    return { data: updated, message: 'Configuration mise à jour avec succès' };
  }

  /** Supprimer la configuration globale */
  async remove(): Promise<{ data: null; message: string }> {
    const setting = await this.appSettingRepo.findOne({
      where: {},
    });
    if (!setting) {
      throw new NotFoundException('Aucune configuration globale trouvée pour suppression');
    }

    await this.appSettingRepo.remove(setting);
    return { data: null, message: 'Configuration supprimée avec succès' };
  }

  /** Calcul dynamique des frais de livraison restaurant */
  async calculateRestaurantDeliveryFee(
    itemCount: number,
  ): Promise<{ data: number; message: string }> {
    const setting = await this.appSettingRepo.findOne({ where: {} });
    if (!setting) throw new NotFoundException('Configuration globale non trouvée');

    const baseFee = Number(setting.restaurantBaseDeliveryFee);
    const extraFee = Number(setting.restaurantExtraFeePerItem);
    const totalFee = itemCount <= 1 ? baseFee : baseFee + (itemCount - 1) * extraFee;

    return { data: totalFee, message: `Frais de livraison calculés pour ${itemCount} plat(s)` };
  }

  /** Récupérer une valeur spécifique dans advancedConfig */
  async getAdvancedConfig(key: string): Promise<{ data: any; message: string }> {
    const setting = await this.appSettingRepo.findOne({ where: {} });
    if (!setting) throw new NotFoundException('Configuration globale non trouvée');

    const value = setting.advancedConfig?.[key];
    return { data: value, message: `Valeur pour '${key}' récupérée avec succès` };
  }

  /** Mettre à jour une valeur spécifique dans advancedConfig */
  async updateAdvancedConfig(
    key: string,
    value: any,
  ): Promise<{ data: AppSetting; message: string }> {
    const setting = await this.appSettingRepo.findOne({ where: {} });
    if (!setting) throw new NotFoundException('Configuration globale non trouvée');

    setting.advancedConfig = { ...setting.advancedConfig, [key]: value };
    const updated = await this.appSettingRepo.save(setting);

    return { data: updated, message: `Valeur pour '${key}' mise à jour avec succès` };
  }

  async uploadToCloudinary(
    files: Express.Multer.File | Express.Multer.File[],
    folder: string,
  ): Promise<string | string[]> {
    if (!files) {
      throw new BadRequestException('Au moins un fichier est requis.');
    }

    if (!Array.isArray(files)) {
      const uploadedUrl = await this.cloudinary.handleUploadFile(files, folder);
      return uploadedUrl;
    }

    const uploadedUrls = await Promise.all(
      files.map((file) => this.cloudinary.handleUploadFile(file, folder)),
    );

    return uploadedUrls;
  }
}
