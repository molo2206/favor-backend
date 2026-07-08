import {
  Controller,
  Post,
  Patch,
  Get,
  Body,
  UseGuards,
  Param,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';
import { AppSettingService } from './app-setting.service';
import { CreateAppSettingDto } from './dto/create-app-setting.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize.roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('app-setting')
export class AppSettingController {
  constructor(private readonly appSettingService: AppSettingService) {}

  /** Créer ou mettre à jour la configuration globale */
  @Post()
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async createOrUpdate(@Body() createDto: CreateAppSettingDto) {
    // Transformation en Record<string, any> pour éviter les erreurs de typage
    const config: Record<string, any> = { ...createDto };

    // ⚙️ Normalisation intégrations pour éviter l'erreur TypeScript
    if (config.config?.integrations) {
      const normalizedIntegrations: Record<string, boolean> = {};
      Object.entries(config.config.integrations).forEach(
        ([key, value]) => (normalizedIntegrations[key] = !!value),
      );
      config.config.integrations = normalizedIntegrations;
    }

    return this.appSettingService.createOrUpdate(config);
  }

  /** Récupérer la configuration globale */
  @Get()
  async findOne() {
    return this.appSettingService.findOne();
  }

  /** Supprimer la configuration globale */
  @Patch('remove')
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async remove() {
    return this.appSettingService.remove();
  }

  /** Calcul dynamique des frais de livraison restaurant */
  @Get('restaurant-fee/:itemCount')
  @UseGuards(AuthentificationGuard)
  async calculateRestaurantFee(@Param('itemCount', ParseIntPipe) itemCount: number) {
    return this.appSettingService.calculateRestaurantDeliveryFee(itemCount);
  }

  /** Upload d'un logo ou fichier unique */
  @Post('upload-logo')
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  @UseInterceptors(FileInterceptor('logo'))
  async uploadSingle(@UploadedFile() logo: Express.Multer.File) {
    if (!logo) {
      throw new BadRequestException('Un fichier est requis.');
    }

    const uploadedUrl = await this.appSettingService.uploadToCloudinary(logo, 'appSettings');
    return {
      message: 'Fichier uploadé avec succès.',
      data: uploadedUrl,
    };
  }
}
