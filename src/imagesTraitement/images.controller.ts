// images.controller.ts
import { Controller, Post, UploadedFile, UseInterceptors, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImageService } from './image.service';
import { BackgroundType } from './image.processor';

@Controller('images')
export class ImagesController {
  constructor(private readonly imageService: ImageService) {}

  /**
   * Endpoint spécial pour les images de type texte
   * (comme CHANDLER U.S. NAVY)
   */
  @Post('process-text')
  @UseInterceptors(FileInterceptor('image'))
  async processTextImage(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { folder?: string }
  ) {
    if (!file) {
      throw new Error('Fichier image requis');
    }

    const url = await this.imageService.processTextImage(
      file, 
      body.folder || 'text-images'
    );

    return {
      success: true,
      url,
      message: 'Image texte traitée avec succès sur fond blanc',
      type: 'text-optimized'
    };
  }

  /**
   * Endpoint générique pour tous les types d'images
   */
  @Post('process')
  @UseInterceptors(FileInterceptor('image'))
  async processImage(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any
  ) {
    if (!file) {
      throw new Error('Fichier image requis');
    }

    // Fonction de conversion string -> nombre
    const toNumber = (value: any): number | undefined => {
      if (value === undefined || value === null || value === '') return undefined;
      const num = Number(value);
      return isNaN(num) ? undefined : num;
    };

    // Construire les options de background
    const backgroundOptions = body.type ? {
      type: body.type as BackgroundType,
      color: body.color || this.getDefaultColor(body.type),
      secondColor: body.secondColor,
      gradientDirection: body.direction,
      opacity: body.type === 'transparent' ? 0 : 1
    } : undefined;

    // Options de traitement
    const options = {
      width: toNumber(body.width),
      height: toNumber(body.height),
      borderSize: toNumber(body.borderSize),
      borderColor: body.borderColor,
      padding: toNumber(body.padding),
      folder: body.folder,
      quality: toNumber(body.quality),
      removeBgModel: body.model || 'medium'
    };

    const url = await this.imageService.processAndUploadImage(
      file,
      backgroundOptions,
      options
    );

    return {
      success: true,
      url,
      type: body.type || 'standard',
      message: this.getSuccessMessage(body.type)
    };
  }

  private getDefaultColor(type: string): string {
    switch (type) {
      case 'white': return '#ffffff';
      case 'black': return '#000000';
      case 'color':
      case 'gradient': return '#ff0000';
      default: return '#ffffff';
    }
  }

  private getSuccessMessage(type?: string): string {
    if (!type) return 'Image traitée avec succès';
    
    const messages = {
      white: 'Image détourée sur fond blanc',
      black: 'Image détourée sur fond noir',
      color: 'Image détourée sur fond coloré',
      gradient: 'Image détourée sur fond dégradé',
      transparent: 'Image détourée avec fond transparent'
    };
    return messages[type] || 'Image traitée avec succès';
  }
}