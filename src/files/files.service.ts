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
export const VIDEO_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/webm',
  'video/3gpp',
  'video/x-matroska',
];
// ✅ AJOUT : audios (notes vocales du chat, mp3, m4a...)
export const AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
  'audio/ogg',
  'audio/opus',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/3gpp',
  'audio/amr',
  'audio/flac',
];
// ✅ AJOUT : autres documents bureautiques / archives
export const OFFICE_TYPES = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'application/rtf',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.rar',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
];
export const ALLOWED_FILE_TYPES = [
  ...IMAGE_TYPES,
  ...PDF_TYPES,
  ...VIDEO_TYPES,
  ...AUDIO_TYPES,
  ...OFFICE_TYPES,
];

/** Extensions jamais acceptées (exécutables / scripts) */
export const BLOCKED_EXTENSIONS = [
  'exe', 'bat', 'cmd', 'sh', 'msi', 'com', 'scr', 'ps1', 'vbs',
  'js', 'mjs', 'jar', 'php', 'py', 'dll', 'apk', 'html', 'htm',
];

/** Type MIME déduit de l'extension quand le client envoie application/octet-stream */
const EXTENSION_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', webm: 'video/webm',
  mkv: 'video/x-matroska', '3gp': 'video/3gpp',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg',
  opus: 'audio/opus', wav: 'audio/wav', amr: 'audio/amr', flac: 'audio/flac', weba: 'audio/webm',
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain', csv: 'text/csv', zip: 'application/zip', rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
};

export type UploadedFileResponse = {
  message: string;
  data: any;
};

/** ✅ AJOUT : catégorie d'un fichier uploadé */
export type UploadedFileKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'PDF' | 'DOCUMENT';

/** ✅ AJOUT : résultat détaillé (chat, pièces jointes...) */
export interface UploadedFileDetails {
  kind: UploadedFileKind;
  url: string;
  thumbnailUrl: string | null;
  /** Chemin relatif dans UPLOAD_PATH (ex: chat/2026/10/abcd.webp) */
  storagePath: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  /** Durée en secondes (audio / vidéo) si ffprobe est disponible */
  duration: number | null;
}

export interface UploadDetailedOptions {
  /** Images : largeur max (défaut 1600) */
  imageMaxWidth?: number;
  /** Images : qualité webp (défaut 80) */
  imageQuality?: number;
  /** Images : poids cible en Ko (défaut 450) */
  imageMaxSizeKB?: number;
  /** Images : génère une miniature 400px (défaut true) */
  imageThumbnail?: boolean;
  /** Vidéos : compression 480p (défaut true). false = fichier original + miniature */
  compressVideo?: boolean;
  /** Taille max acceptée en octets */
  maxSize?: number;
}

/** Normalise le type MIME (navigateurs / mobiles parfois imprécis) */
export function normalizeMimeType(file: Pick<Express.Multer.File, 'originalname' | 'mimetype'>): string {
  const ext = (file.originalname?.split('.').pop() || '').toLowerCase();
  let mime = (file.mimetype || '').split(';')[0].trim().toLowerCase();
  if (!mime || mime === 'application/octet-stream' || mime === 'binary/octet-stream') {
    mime = EXTENSION_MIME[ext] || mime;
  }
  if (ext === 'm4a' && mime.startsWith('video/')) mime = 'audio/mp4';
  if (ext === 'weba') mime = 'audio/webm';
  return mime;
}

/** Catégorie d'un type MIME (null = refusé) */
export function detectFileKind(mime: string): UploadedFileKind | null {
  if (IMAGE_TYPES.includes(mime) || mime === 'image/heic' || mime === 'image/heif') return 'IMAGE';
  if (VIDEO_TYPES.includes(mime)) return 'VIDEO';
  if (AUDIO_TYPES.includes(mime)) return 'AUDIO';
  if (mime === 'application/pdf') return 'PDF';
  if (PDF_TYPES.includes(mime) || OFFICE_TYPES.includes(mime)) return 'DOCUMENT';
  return null;
}

/** Utilisable dans un fileFilter multer */
export function isAllowedUpload(file: Pick<Express.Multer.File, 'originalname' | 'mimetype'>): boolean {
  const ext = (file.originalname?.split('.').pop() || '').toLowerCase();
  if (BLOCKED_EXTENSIONS.includes(ext)) return false;
  return detectFileKind(normalizeMimeType(file)) !== null;
}

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
      'chat',
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
      'chat',
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

      // ✅ AJOUT : correction du type MIME (application/octet-stream, audio/webm;codecs=opus...)
      file.mimetype = normalizeMimeType(file);
      const extension = (file.originalname?.split('.').pop() || '').toLowerCase();
      if (BLOCKED_EXTENSIONS.includes(extension)) {
        if (tempFilePath) await this.cleanupFile(tempFilePath);
        throw new BadRequestException(`Extension non autorisée: .${extension}`);
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

      // ✅ AJOUT : AUDIO (conservé tel quel)
      else if (AUDIO_TYPES.includes(file.mimetype)) {
        const ext = (file.originalname.split('.').pop() || 'audio').toLowerCase();
        const finalName = `${filename}.${ext}`;
        const outputPath = join(dir, finalName);
        try {
          await fs.writeFile(outputPath, fileBuffer);
          if (tempFilePath) await this.cleanupFile(tempFilePath);
          return {
            message: 'Audio uploadé avec succès',
            data: `${cleanBaseUrl}/uploads/${cleanSubFolder}/${finalName}`,
          };
        } catch (error) {
          if (tempFilePath) await this.cleanupFile(tempFilePath);
          throw new BadRequestException(
            `Erreur lors de l'upload de l'audio: ${error.message}`,
          );
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

  // ------------------------------------------------------------
  // ✅ AJOUT : UPLOAD DÉTAILLÉ (chat, pièces jointes)
  // Même pipeline que uploadFile (HEIC, sharp, ffmpeg) mais retourne
  // toutes les métadonnées : type, miniature, dimensions, durée, taille...
  // ------------------------------------------------------------
  async uploadFileDetailed(
    file: Express.Multer.File,
    subFolder: string,
    options: UploadDetailedOptions = {},
  ): Promise<UploadedFileDetails> {
    if (!file) throw new BadRequestException('Aucun fichier fourni');

    const tempFilePath: string | null = file.path || null;
    const originalName = this.decodeOriginalName(file.originalname);
    const extension = (originalName.split('.').pop() || '').toLowerCase();

    try {
      if (BLOCKED_EXTENSIONS.includes(extension)) {
        throw new BadRequestException(`Extension non autorisée: .${extension}`);
      }
      let mime = normalizeMimeType(file);
      const kind = detectFileKind(mime);
      if (!kind) throw new BadRequestException(`Type non autorisé: ${originalName} (${mime})`);

      const fileSize = file.size ?? 0;
      if (options.maxSize && fileSize > options.maxSize) {
        throw new BadRequestException(
          `Fichier trop volumineux: ${originalName} (max ${Math.round(options.maxSize / 1024 / 1024)} Mo)`,
        );
      }

      const dir = await this.ensureDir(subFolder);
      const cleanSubFolder = subFolder.replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');
      const cleanBaseUrl = this.baseUrl.replace(/\/$/, '');
      const publicUrl = (name: string) => `${cleanBaseUrl}/uploads/${cleanSubFolder}/${name}`;
      const filename = crypto.randomBytes(16).toString('hex');

      // ---------------- IMAGE ----------------
      if (kind === 'IMAGE') {
        let buffer = tempFilePath ? await fs.readFile(tempFilePath) : file.buffer;
        if (mime === 'image/heic' || mime === 'image/heif') {
          try {
            buffer = Buffer.from(await convert({ buffer, format: 'JPEG', quality: 0.85 }));
          } catch {
            buffer = await sharp(buffer).jpeg({ quality: 85 }).toBuffer();
          }
          mime = 'image/jpeg';
        }

        const isGif = mime === 'image/gif';
        // GIF conservé (animation), autres formats → webp optimisé
        const finalName = isGif ? `${filename}.gif` : `${filename}.webp`;
        const outputPath = join(dir, finalName);
        if (isGif) {
          await fs.writeFile(outputPath, buffer);
        } else {
          await this.optimizeImageFromBuffer(buffer, outputPath, {
            width: options.imageMaxWidth ?? 1600,
            quality: options.imageQuality ?? 80,
            maxSizeKB: options.imageMaxSizeKB ?? 450,
          });
        }

        const meta = await sharp(outputPath).metadata();
        let thumbnailUrl: string | null = null;
        if (options.imageThumbnail !== false) {
          const thumbName = `${filename}_thumb.webp`;
          await sharp(buffer, { animated: false })
            .rotate()
            .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 65 })
            .toFile(join(dir, thumbName));
          thumbnailUrl = publicUrl(thumbName);
        }
        if (tempFilePath) await this.cleanupFile(tempFilePath);

        const stats = await fs.stat(outputPath);
        return {
          kind,
          url: publicUrl(finalName),
          thumbnailUrl,
          storagePath: `${cleanSubFolder}/${finalName}`,
          fileName: finalName,
          originalName,
          mimeType: isGif ? 'image/gif' : 'image/webp',
          size: stats.size,
          width: meta.width ?? null,
          height: meta.height ?? null,
          duration: null,
        };
      }

      // ---------------- VIDEO ----------------
      if (kind === 'VIDEO') {
        const sourcePath = tempFilePath || join(dir, `temp_${filename}${Date.now()}`);
        if (!tempFilePath) await fs.writeFile(sourcePath, file.buffer);

        const thumbName = `${filename}_thumb.jpg`;
        let finalName: string;
        let finalMime = mime;

        if (options.compressVideo !== false) {
          finalName = `${filename}.mp4`;
          finalMime = 'video/mp4';
          await this.compressVideo(sourcePath, join(dir, finalName), thumbName);
          await this.cleanupFile(sourcePath);
        } else {
          finalName = `${filename}.${extension || 'mp4'}`;
          await this.moveFile(sourcePath, join(dir, finalName));
          await this.videoScreenshot(join(dir, finalName), dir, thumbName);
        }

        const finalPath = join(dir, finalName);
        const probe = await this.probeMedia(finalPath);
        const stats = await fs.stat(finalPath);
        const thumbExists = await fs.access(join(dir, thumbName)).then(() => true).catch(() => false);

        return {
          kind,
          url: publicUrl(finalName),
          thumbnailUrl: thumbExists ? publicUrl(thumbName) : null,
          storagePath: `${cleanSubFolder}/${finalName}`,
          fileName: finalName,
          originalName,
          mimeType: finalMime,
          size: stats.size,
          width: probe.width,
          height: probe.height,
          duration: probe.duration,
        };
      }

      // ---------------- AUDIO / PDF / DOCUMENT : conservés tels quels ----------------
      const finalName = `${filename}.${extension || 'bin'}`;
      const finalPath = join(dir, finalName);
      if (tempFilePath) await this.moveFile(tempFilePath, finalPath);
      else await fs.writeFile(finalPath, file.buffer);

      const stats = await fs.stat(finalPath);
      const probe = kind === 'AUDIO' ? await this.probeMedia(finalPath) : null;

      return {
        kind,
        url: publicUrl(finalName),
        thumbnailUrl: null,
        storagePath: `${cleanSubFolder}/${finalName}`,
        fileName: finalName,
        originalName,
        mimeType: mime,
        size: stats.size,
        width: null,
        height: null,
        duration: probe?.duration ?? null,
      };
    } catch (error) {
      if (tempFilePath) await this.cleanupFile(tempFilePath);
      this.logger.error(`uploadFileDetailed error: ${error.message}`);
      throw error;
    }
  }

  async uploadFilesDetailed(
    files: Express.Multer.File[],
    subFolder: string,
    options: UploadDetailedOptions = {},
  ): Promise<UploadedFileDetails[]> {
    const results: UploadedFileDetails[] = [];
    try {
      for (const f of files || []) {
        results.push(await this.uploadFileDetailed(f, subFolder, options));
      }
      return results;
    } catch (error) {
      // Tout ou rien : on supprime ce qui a déjà été stocké
      for (const r of results) await this.deleteFileByUrl(r.url);
      for (const f of files || []) if (f?.path) await this.cleanupFile(f.path);
      throw error;
    }
  }

  /**
   * ✅ AJOUT : suppression à partir de l'URL publique (+ miniatures _thumb).
   * Ne lève jamais d'erreur.
   */
  async deleteFileByUrl(url?: string | null): Promise<boolean> {
    if (!url) return false;
    const marker = '/uploads/';
    const idx = url.indexOf(marker);
    if (idx === -1) return false;
    const relative = decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
    if (relative.includes('..')) return false;

    const absolute = join(this.uploadPath, relative);
    const base = absolute.replace(/\.[^./\\]+$/, '');
    let deleted = false;
    for (const p of [absolute, `${base}_thumb.webp`, `${base}_thumb.jpg`]) {
      try {
        await fs.unlink(p);
        deleted = true;
      } catch {
        /* inexistant */
      }
    }
    if (deleted) this.logger.log(`🗑️ Deleted file (url): ${relative}`);
    return deleted;
  }

  /** ✅ AJOUT : durée / dimensions via ffprobe (null si indisponible) */
  async probeMedia(
    path: string,
  ): Promise<{ duration: number | null; width: number | null; height: number | null }> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ duration: null, width: null, height: null }), 15000);
      try {
        ffmpeg.ffprobe(path, (err, data) => {
          clearTimeout(timer);
          if (err || !data) return resolve({ duration: null, width: null, height: null });
          const video = data.streams?.find((st) => st.codec_type === 'video');
          const duration = Number(data.format?.duration);
          resolve({
            duration: Number.isFinite(duration) ? Math.round(duration * 10) / 10 : null,
            width: video?.width ?? null,
            height: video?.height ?? null,
          });
        });
      } catch {
        clearTimeout(timer);
        resolve({ duration: null, width: null, height: null });
      }
    });
  }

  private videoScreenshot(input: string, folder: string, filename: string): Promise<boolean> {
    return new Promise((resolve) => {
      ffmpeg(input)
        .screenshots({ timestamps: ['1'], filename, folder, size: '320x?' })
        .on('end', () => resolve(true))
        .on('error', (err) => {
          this.logger.warn(`Miniature vidéo impossible: ${err.message}`);
          resolve(false);
        });
    });
  }

  private async moveFile(from: string, to: string): Promise<void> {
    try {
      await fs.rename(from, to);
    } catch {
      // disques différents (EXDEV)
      await fs.copyFile(from, to);
      await this.cleanupFile(from);
    }
  }

  /** multer encode les noms en latin1 → restauration UTF-8 (accents) */
  private decodeOriginalName(name?: string): string {
    const raw = name || 'fichier';
    try {
      const decoded = Buffer.from(raw, 'latin1').toString('utf8');
      return (decoded.includes('\uFFFD') ? raw : decoded).replace(/[\\/]/g, '_').slice(0, 250);
    } catch {
      return raw.slice(0, 250);
    }
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

  /**
 * Lit le contenu d'un fichier depuis son URL publique.
 * Reconstruit le chemin absolu en interne (uploadPath + subFolder + filename).
 *
 * @param url       URL publique du fichier (ex: https://.../uploads/product/xxx.webp)
 * @param subFolder Sous-dossier (ex: 'product')
 * @returns Buffer du fichier
 */
  async readFileFromUrl(url: string, subFolder: string): Promise<Buffer> {
    try {
      // 1. Extraire le nom du fichier depuis l'URL
      const filename = url.split('/').pop();
      if (!filename) {
        throw new BadRequestException(`URL invalide: ${url}`);
      }

      // 2. Reconstruire le chemin absolu (uploadPath est déjà configuré)
      const filePath = join(this.uploadPath, subFolder, filename);

      // 3. Vérifier l'existence
      try {
        await fs.access(filePath);
      } catch {
        throw new BadRequestException(`Fichier introuvable: ${filePath}`);
      }

      // 4. Lire et retourner le buffer
      const buffer = await fs.readFile(filePath);
      this.logger.log(
        `📖 Fichier lu: ${filePath} (${(buffer.length / 1024).toFixed(2)} KB)`,
      );

      return buffer;
    } catch (error) {
      this.logger.error(`readFileFromUrl error: ${error.message}`);
      throw new BadRequestException(
        `Impossible de lire le fichier: ${error.message}`,
      );
    }
  }
}