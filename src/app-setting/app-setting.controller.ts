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
} from '@nestjs/common';
import { AppSettingService } from './app-setting.service';
import { CreateAppSettingDto } from './dto/create-app-setting.dto';
import { UpdateAppSettingDto } from './dto/update-app-setting.dto';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { AuthorizeRoles } from 'src/users/utility/decorators/authorize.roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('app-setting')
export class AppSettingController {
  constructor(private readonly appSettingService: AppSettingService) {}

  /** Créer la configuration globale */
  @Post()
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async create(@Body() createDto: CreateAppSettingDto) {
    const result = await this.appSettingService.create(createDto);
    return result;
  }

  /** Récupérer la configuration globale */
  @Get()
  @UseGuards(AuthentificationGuard)
  async findOne() {
    const result = await this.appSettingService.findOne();
    return result; // { data, message }
  }

  /** Mettre à jour la configuration globale */
  @Patch('update')
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async update(@Body() updateDto: UpdateAppSettingDto) {
    const result = await this.appSettingService.update(updateDto);
    return result; // { data, message }
  }

  /** Supprimer la configuration globale */
  @Patch('remove')
  @UseGuards(AuthentificationGuard)
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  async remove() {
    const result = await this.appSettingService.remove();
    return result; // { data: null, message }
  }

  /** Calcul dynamique des frais restaurant */
  @Get('restaurant-fee/:itemCount')
  @UseGuards(AuthentificationGuard)
  async calculateRestaurantFee(@Param('itemCount') itemCount: string) {
    const result = await this.appSettingService.calculateRestaurantDeliveryFee(
      Number(itemCount),
    );
    return result; // { data, message }
  }

  @Post('upload-logo')
  @AuthorizeRoles(['ADMIN', 'SUPER ADMIN'])
  @UseGuards(AuthentificationGuard)
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
