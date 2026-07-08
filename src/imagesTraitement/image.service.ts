// image.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import {
  processTextImage,
  processImageWithNewBackground,
  BackgroundOptions,
  ProcessImageOptions
} from './image.processor';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';

@Injectable()
export class ImageService {
  constructor(private readonly cloudinary: CloudinaryService) {}

  /**
   * Traite une image de type texte (comme CHANDLER U.S. NAVY)
   * avec fond blanc optimisé
   */
  async processTextImage(
    file: Express.Multer.File,
    folder: string = 'product-images'
  ): Promise<string> {
    if (!file) {
      throw new BadRequestException('Image requise');
    }

    try {
      console.log('🖼️ Traitement d\'image texte...');
      
      // Traiter l'image avec l'optimisation texte
      const processedBuffer = await processTextImage(file, {
        backgroundColor: '#ffffff',
        padding: 40,
        quality: 95
      });

      // Préparer pour Cloudinary
      const processedFile: Express.Multer.File = {
        ...file,
        buffer: processedBuffer,
        mimetype: 'image/png',
        originalname: file.originalname.replace(/\.[^/.]+$/, '') + '_clean.png'
      };

      // Upload
      const uploadedUrl = await this.cloudinary.handleUploadImage(
        processedFile,
        folder
      );

      console.log('✅ Image texte traitée avec succès');
      return uploadedUrl;

    } catch (error) {
      console.error('❌ Erreur processTextImage:', error);
      throw new BadRequestException(`Échec du traitement: ${error.message}`);
    }
  }

  /**
   * Traite une image avec options personnalisées
   */
  async processAndUploadImage(
    file: Express.Multer.File,
    backgroundOptions?: BackgroundOptions,
    options?: ProcessImageOptions
  ): Promise<string> {
    if (!file) {
      throw new BadRequestException('Image requise');
    }

    try {
      const validatedOptions: ProcessImageOptions = {
        folder: options?.folder,
        width: options?.width ? Number(options.width) : undefined,
        height: options?.height ? Number(options.height) : undefined,
        borderSize: options?.borderSize ? Number(options.borderSize) : undefined,
        borderColor: options?.borderColor,
        quality: options?.quality ? Number(options.quality) : undefined,
        padding: options?.padding ? Number(options.padding) : undefined,
        removeBgModel: options?.removeBgModel
      };

      // Nettoyer les undefined
      Object.keys(validatedOptions).forEach(key => 
        validatedOptions[key] === undefined && delete validatedOptions[key]
      );

      let processedBuffer: Buffer;

      if (backgroundOptions) {
        console.log(`Traitement avec nouveau background: ${backgroundOptions.type}`);
        processedBuffer = await processImageWithNewBackground(file, backgroundOptions, validatedOptions);
      } else {
        // Traitement simple
        const sharp = require('sharp');
        processedBuffer = await sharp(file.buffer)
          .resize(validatedOptions?.width || 800, validatedOptions?.height || 800, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          })
          .png({ quality: validatedOptions?.quality || 90 })
          .toBuffer();
      }

      const processedFile: Express.Multer.File = {
        ...file,
        buffer: processedBuffer,
        mimetype: 'image/png',
        originalname: file.originalname.replace(/\.[^/.]+$/, '') + '.png'
      };

      const uploadedUrl = await this.cloudinary.handleUploadImage(
        processedFile,
        validatedOptions.folder || 'product-images'
      );

      return uploadedUrl;

    } catch (error) {
      console.error('Erreur dans processAndUploadImage:', error);
      throw new BadRequestException(`Échec du traitement: ${error.message}`);
    }
  }

  // Méthodes simplifiées
  async processWithWhiteBackground(
    file: Express.Multer.File,
    folder: string = 'product-images'
  ): Promise<string> {
    return this.processAndUploadImage(file, {
      type: 'white',
      color: '#ffffff',
      opacity: 1
    }, { folder });
  }
}