import {
  Injectable,
  BadRequestException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import crypto from 'crypto';
import ffmpeg from 'fluent-ffmpeg';
import convert from 'heic-convert';  // <-- AJOUT

export const IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
];
export const PDF_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];
export const ALLOWED_FILE_TYPES = [
  ...IMAGE_TYPES,
  ...PDF_TYPES,
  ...VIDEO_TYPES,
];

export type UploadedFileResponse = {
  message: string;
  data: any;
};

@Injectable()
export class FilesService implements OnModuleInit {
  private uploadPath: string;
  private baseUrl: string;
  private readonly logger = new Logger(FilesService.name);

  constructor(private readonly configService: ConfigService) {
    this.uploadPath =
      this.configService.get<string>('UPLOAD_PATH') || '/var/www/favor-storage';
    this.baseUrl =
      this.configService.get<string>('BASE_URL') ||
      'https://api-prod.favorhelp.com';

    this.logger.log(`FilesService initialized`);
    this.logger.log(`Upload path: ${this.uploadPath}`);
    this.logger.log(`Base URL: ${this.baseUrl}`);

    this.createFoldersSync();
  }

  private createFoldersSync(): void {
    const folders = [
      'product',
      'category',
      'brand',
      'service',
      'prestataires',
      'temp',
      'user',
      'shipment',
      'vehicles',
    ];
    const { mkdirSync, existsSync } = require('fs');

    for (const folder of folders) {
      const folderPath = join(this.uploadPath, folder);
      try {
        if (!existsSync(folderPath)) {
          mkdirSync(folderPath, { recursive: true });
          this.logger.log(`✅ Folder created: ${folderPath}`);
        } else {
          this.logger.log(`✅ Folder already exists: ${folderPath}`);
        }
      } catch (error) {
        this.logger.error(
          `❌ Failed to create folder ${folderPath}: ${error.message}`,
        );
      }
    }
  }

  async onModuleInit() {
    const folders = [
      'product',
      'category',
      'brand',
      'service',
      'prestataires',
      'temp',
      'user',
      'shipment',
      'vehicles',
    ];

    for (const folder of folders) {
      const folderPath = join(this.uploadPath, folder);
      try {
        await fs.mkdir(folderPath, { recursive: true });
        this.logger.log(`✅ Folder created/verified (async): ${folderPath}`);
      } catch (error) {
        this.logger.error(
          `❌ Failed to create folder ${folderPath}: ${error.message}`,
        );
      }
    }
  }

  private async ensureDir(subFolder: string): Promise<string> {
    const dir = join(this.uploadPath, subFolder);
    try {
      await fs.mkdir(dir, { recursive: true });
      this.logger.log(`📁 Directory ensured: ${dir}`);
      return dir;
    } catch (error) {
      this.logger.error(`Failed to create directory ${dir}: ${error.message}`);
      throw new BadRequestException(
        `Impossible de créer le répertoire: ${error.message}`,
      );
    }
  }

  // ------------------------------------------------------------
  // IMAGE OPTIMISATION – ÉQUILIBRÉE (qualité / poids)
  // ------------------------------------------------------------
  private async optimizeImageFromBuffer(
    buffer: Buffer,
    outputPath: string,
    options?: {
      width?: number;
      quality?: number;
      maxSizeKB?: number;
    },
  ): Promise<{ path: string; sizeKB: number }> {
    const width = options?.width || 700;
    let quality = options?.quality || 70;
    const maxSizeKB = options?.maxSizeKB || 80;

    let outputBuffer = await sharp(buffer)
      .rotate()
      .resize(width, null, { withoutEnlargement: true })
      .webp({ quality: quality, effort: 6 })
      .toBuffer();

    let outputSizeKB = outputBuffer.length / 1024;

    let attempts = 0;
    while (outputSizeKB > maxSizeKB && quality > 35 && attempts < 5) {
      quality -= 8;
      outputBuffer = await sharp(buffer)
        .rotate()
        .resize(width, null, { withoutEnlargement: true })
        .webp({ quality: quality, effort: 6 })
        .toBuffer();
      outputSizeKB = outputBuffer.length / 1024;
      attempts++;
    }

    await fs.writeFile(outputPath, outputBuffer);

    this.logger.log(
      `✅ Optimized image: ${outputPath} (${outputSizeKB.toFixed(2)} KB, quality: ${quality})`,
    );

    return { path: outputPath, sizeKB: outputSizeKB };
  }

  // --- PRODUIT (700px, 70%) ---
  private async optimizeProductImageFromBuffer(
    buffer: Buffer,
    outputPath: string,
  ): Promise<void> {
    await this.optimizeImageFromBuffer(buffer, outputPath, {
      width: 700,
      quality: 70,
      maxSizeKB: 80,
    });
  }

  // --- AVATAR (150px, 60%) ---
  private async optimizeAvatarImageFromBuffer(
    buffer: Buffer,
    outputPath: string,
  ): Promise<void> {
    await this.optimizeImageFromBuffer(buffer, outputPath, {
      width: 150,
      quality: 60,
      maxSizeKB: 20,
    });
  }

  // --- CATÉGORIE (400px, 65%) ---
  private async optimizeCategoryImageFromBuffer(
    buffer: Buffer,
    outputPath: string,
  ): Promise<void> {
    await this.optimizeImageFromBuffer(buffer, outputPath, {
      width: 400,
      quality: 65,
      maxSizeKB: 40,
    });
  }

  // --- BANNIÈRE (900px, 65%) ---
  private async optimizeBannerImageFromBuffer(
    buffer: Buffer,
    outputPath: string,
  ): Promise<void> {
    await this.optimizeImageFromBuffer(buffer, outputPath, {
      width: 900,
      quality: 65,
      maxSizeKB: 120,
    });
  }

  // --- VIDEO COMPRESSION (équilibrée) ---
  private async compressVideo(
    input: string,
    output: string,
    thumbOutput: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(input)
        .videoCodec('libx264')
        .size('?x480')
        .outputOptions([
          '-crf 32',
          '-preset fast',
          '-movflags +faststart',
          '-b:v 500k',
          '-maxrate 500k',
          '-bufsize 1000k',
          '-ac 2',
          '-b:a 96k',
        ])
        .on('start', (commandLine) => {
          this.logger.log(`🎬 FFmpeg started: ${commandLine}`);
        })
        .on('end', async () => {
          try {
            await new Promise((thumbResolve, thumbReject) => {
              ffmpeg(input)
                .screenshots({
                  timestamps: ['50%'],
                  filename: thumbOutput,
                  folder: join(output, '..'),
                  size: '320x?',
                })
                .on('end', () => thumbResolve(true))
                .on('error', (err) => thumbReject(err));
            });
            this.logger.log(`✅ Video compressed: ${output}`);
            resolve();
          } catch (error) {
            this.logger.error(`Failed to create thumbnail: ${error.message}`);
            reject(error);
          }
        })
        .on('error', (err) => {
          this.logger.error(`FFmpeg error: ${err.message}`);
          reject(err);
        })
        .save(output);
    });
  }

  // ------------------------------------------------------------
  // UPLOAD PRINCIPAL
  // ------------------------------------------------------------
  async uploadFile(
    file: Express.Multer.File,
    subFolder: string,
    imageType:
      | 'category'
      | 'product'
      | 'avatar'
      | 'banner'
      | 'vehicle'
      | 'default' = 'default',
  ): Promise<UploadedFileResponse> {
    try {
      if (!file) {
        throw new BadRequestException('Aucun fichier fourni');
      }

      const dir = await this.ensureDir(subFolder);

      let fileBuffer: Buffer;
      let tempFilePath: string | null = null;

      if (file.path) {
        fileBuffer = await fs.readFile(file.path);
        tempFilePath = file.path;
      } else if (file.buffer) {
        fileBuffer = file.buffer;
      } else {
        throw new BadRequestException('Fichier invalide');
      }

      this.logger.log(
        `📤 Uploading file: ${file.originalname}, type: ${file.mimetype}, size: ${(fileBuffer.length / 1024).toFixed(2)} KB`,
      );

      // ------------------------------------------------------------
      // DÉTECTION ET CONVERSION HEIC → JPEG (AMÉLIORÉE)
      // ------------------------------------------------------------
      const isHeic =
        file.mimetype === 'image/heic' ||
        file.mimetype === 'image/heif' ||
        file.mimetype === 'image/heic-sequence' ||
        file.originalname?.toLowerCase().endsWith('.heic') ||
        file.originalname?.toLowerCase().endsWith('.heif');

      if (isHeic) {
        this.logger.log(`🔄 Converting HEIC file: ${file.originalname}`);
        try {
          const outputBuffer = await convert({
            buffer: fileBuffer,
            format: 'JPEG',
            quality: 0.85, // qualité légèrement augmentée
          });
          fileBuffer = outputBuffer;
          // On modifie le mimetype pour que la suite le traite comme une image JPEG
          file.mimetype = 'image/jpeg';
          // Optionnel : modifier le nom pour que l'extension soit correcte
          file.originalname = file.originalname.replace(/\.(heic|heif)$/i, '.jpg');
          this.logger.log(`✅ HEIC converted to JPEG (${(fileBuffer.length / 1024).toFixed(2)} KB)`);
        } catch (convError) {
          this.logger.error(`HEIC conversion failed: ${convError.message}`);
          // En cas d'échec, on tente une approche alternative avec sharp directement
          try {
            this.logger.log('🔄 Tentative de conversion avec sharp...');
            // Sharp peut parfois lire les HEIC si libheif est installé
            const sharpBuffer = await sharp(fileBuffer)
              .jpeg({ quality: 80 })
              .toBuffer();
            fileBuffer = sharpBuffer;
            file.mimetype = 'image/jpeg';
            this.logger.log(`✅ HEIC converted to JPEG via sharp (${(fileBuffer.length / 1024).toFixed(2)} KB)`);
          } catch (sharpError) {
            this.logger.error(`Sharp conversion failed: ${sharpError.message}`);
            throw new BadRequestException('Impossible de convertir le fichier HEIC. Format non supporté.');
          }
        }
      }

      // Vérification des types autorisés (après conversion)
      if (!ALLOWED_FILE_TYPES.includes(file.mimetype)) {
        if (tempFilePath) await this.cleanupFile(tempFilePath);
        throw new BadRequestException(`Type non autorisé: ${file.mimetype}`);
      }

      const filename = crypto.randomBytes(16).toString('hex');
      const cleanSubFolder = subFolder.replace(/^\/+|\/+$/g, '');
      const cleanBaseUrl = this.baseUrl.replace(/\/$/, '');

      // IMAGE
      if (IMAGE_TYPES.includes(file.mimetype)) {
        const finalName = `${filename}.webp`;
        const outputPath = join(dir, finalName);

        try {
          switch (imageType) {
            case 'category':
              await this.optimizeCategoryImageFromBuffer(
                fileBuffer,
                outputPath,
              );
              break;
            case 'product':
              await this.optimizeProductImageFromBuffer(fileBuffer, outputPath);
              break;
            case 'avatar':
              await this.optimizeAvatarImageFromBuffer(fileBuffer, outputPath);
              break;
            case 'banner':
              await this.optimizeBannerImageFromBuffer(fileBuffer, outputPath);
              break;
            default:
              await this.optimizeImageFromBuffer(fileBuffer, outputPath, {
                width: 700,
                quality: 70,
                maxSizeKB: 80,
              });
          }

          if (tempFilePath) await this.cleanupFile(tempFilePath);

          const stats = await fs.stat(outputPath);
          const finalSizeKB = stats.size / 1024;
          const finalUrl = `${cleanBaseUrl}/uploads/${cleanSubFolder}/${finalName}`;

          this.logger.log(
            `✅ Image uploaded: ${finalName} (${finalSizeKB.toFixed(2)} KB)`,
          );
          this.logger.log(`🔗 URL: ${finalUrl}`);

          return {
            message: 'Image uploadée avec succès',
            data: finalUrl,
          };
        } catch (error) {
          if (tempFilePath) await this.cleanupFile(tempFilePath);
          throw error;
        }
      }

      // VIDEO
      else if (VIDEO_TYPES.includes(file.mimetype)) {
        const tempPath =
          tempFilePath || join(dir, `temp_${filename}${Date.now()}`);

        if (!tempFilePath && fileBuffer) {
          await fs.writeFile(tempPath, fileBuffer);
        }

        const finalName = `${filename}.mp4`;
        const thumbName = `${filename}_thumb.jpg`;
        const outputPath = join(dir, finalName);

        try {
          await this.compressVideo(tempPath, outputPath, thumbName);
          await this.cleanupFile(tempPath);
          if (tempFilePath) await this.cleanupFile(tempFilePath);

          return {
            message: 'Vidéo uploadée avec succès',
            data: {
              video: `${cleanBaseUrl}/uploads/${cleanSubFolder}/${finalName}`,
              thumb: `${cleanBaseUrl}/uploads/${cleanSubFolder}/${thumbName}`,
            },
          };
        } catch (error) {
          await this.cleanupFile(tempPath);
          if (tempFilePath) await this.cleanupFile(tempFilePath);
          throw error;
        }
      }

      // DOCUMENT
      else {
        const ext = file.originalname.split('.').pop() || '';
        const finalName = `${filename}.${ext}`;
        const outputPath = join(dir, finalName);

        try {
          await fs.writeFile(outputPath, fileBuffer);
          if (tempFilePath) await this.cleanupFile(tempFilePath);

          return {
            message: 'Document uploadé avec succès',
            data: `${cleanBaseUrl}/uploads/${cleanSubFolder}/${finalName}`,
          };
        } catch (error) {
          if (tempFilePath) await this.cleanupFile(tempFilePath);
          throw new BadRequestException(
            `Erreur lors de l'upload du document: ${error.message}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Upload error: ${error.message}`);
      throw error;
    }
  }

  async uploadFiles(
    files: Express.Multer.File[],
    subFolder: string,
    imageType:
      | 'category'
      | 'product'
      | 'avatar'
      | 'banner'
      | 'default' = 'default',
  ): Promise<UploadedFileResponse[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('Aucun fichier à uploader');
    }

    const results: UploadedFileResponse[] = [];
    for (const file of files) {
      try {
        const result = await this.uploadFile(file, subFolder, imageType);
        results.push(result);
      } catch (error) {
        this.logger.error(
          `Failed to upload file ${file.originalname}: ${error.message}`,
        );
      }
    }

    if (results.length === 0) {
      throw new BadRequestException("Aucun fichier n'a pu être uploadé");
    }

    return results;
  }

  private async cleanupFile(filePath: string): Promise<void> {
    try {
      await fs.access(filePath);
      await fs.unlink(filePath);
      this.logger.log(`🧹 Cleaned up temp file: ${filePath}`);
    } catch (error) {
      this.logger.warn(
        `Could not delete temp file ${filePath}: ${error.message}`,
      );
    }
  }

  async deleteFile(
    subFolder: string,
    filename: string,
  ): Promise<{ message: string; data: boolean }> {
    try {
      const filePath = join(this.uploadPath, subFolder, filename);
      await fs.access(filePath);
      await fs.unlink(filePath);
      this.logger.log(`🗑️ Deleted file: ${filePath}`);
      return { message: 'Fichier supprimé avec succès', data: true };
    } catch (error) {
      this.logger.error(`Failed to delete file: ${error.message}`);
      throw new BadRequestException('Impossible de supprimer le fichier');
    }
  }

  async getFileInfo(subFolder: string, filename: string): Promise<any> {
    try {
      const filePath = join(this.uploadPath, subFolder, filename);
      const stats = await fs.stat(filePath);
      return {
        exists: true,
        size: stats.size,
        sizeKB: (stats.size / 1024).toFixed(2),
        modified: stats.mtime,
      };
    } catch (error) {
      return { exists: false };
    }
  }
}