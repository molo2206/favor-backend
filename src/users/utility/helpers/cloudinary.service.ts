import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { v2 as cloudinary } from 'cloudinary';
import * as streamifier from 'streamifier';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CloudinaryService {
  constructor(private configService: ConfigService) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    // if (!cloudName || !apiKey || !apiSecret) {
    //   throw new UnprocessableEntityException('Cloudinary credentials are missing.');
    // }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });
  }
  private async retry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (retries <= 0) {
        throw error;
      }
      //console.warn(`Retrying... attempts left: ${retries}`);
      return this.retry(fn, retries - 1);
    }
  }

  async handleUploadImage(file: Express.Multer.File, folder: string): Promise<string> {
    if (!file) throw new UnprocessableEntityException('File field is required');
    if (!folder) throw new UnprocessableEntityException('Folder field is required');

    const fileType = await fileTypeFromBuffer(file.buffer);
    if (!fileType || !fileType.mime) {
      throw new UnprocessableEntityException('Unable to determine file type.');
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const mime = fileType.mime;

    if (!allowedTypes.includes(mime)) {
      throw new UnprocessableEntityException('Only JPEG, PNG, or WEBP images are allowed.');
    }

    const metadata = await sharp(file.buffer).metadata();

    let maxWidth = 800;
    let maxHeight = 800;

    let quality = 95;
    if (metadata.size && metadata.size > 3 * 1024 * 1024) {
      quality = 85;
      maxWidth = 600;
      maxHeight = 600;
    } else if (metadata.size && metadata.size > 1 * 1024 * 1024) {
      quality = 90;
    }

    // Version corrigée - Désactive la rotation automatique
    const processedBuffer = await sharp(file.buffer)
      .rotate() // Sans paramètre, Sharp n'applique pas de rotation
      .resize({
        width: maxWidth,
        height: maxHeight,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality })
      .toBuffer();

    return this.retry(() => this.uploadToCloudinary(processedBuffer, folder));
  }
  async handleUploadFile(file: Express.Multer.File, folder: string): Promise<string> {
    if (!file) throw new UnprocessableEntityException('File field is required');
    if (!folder) throw new UnprocessableEntityException('Folder field is required');

    const fileType = await fileTypeFromBuffer(file.buffer);
    if (!fileType || !fileType.mime) {
      throw new UnprocessableEntityException('Unable to determine file type.');
    }

    const mime = fileType.mime;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

    if (!allowedTypes.includes(mime)) {
      throw new UnprocessableEntityException(
        'Only JPEG, PNG, WEBP images or PDFs are allowed.',
      );
    }

    let processedBuffer: Buffer;

    if (mime.startsWith('image/')) {
      processedBuffer = await sharp(file.buffer)
        .resize(300, 300, { fit: 'cover' })
        .webp({ quality: 80 })
        .toBuffer();
    } else if (mime === 'application/pdf') {
      if (file.size > 5 * 1024 * 1024) {
        throw new UnprocessableEntityException('PDF exceeds the 5MB limit.');
      }
      processedBuffer = file.buffer;
    } else {
      throw new UnprocessableEntityException('Unsupported file type');
    }

    return this.retry(() => this.uploadToCloudinary(processedBuffer, folder), 5);
  }

  private async uploadToCloudinary(buffer: Buffer, folder: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const uniqueName = `${Date.now()}-${uuidv4()}`;

      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `favor/${folder}`,
          public_id: uniqueName,
          resource_type: 'auto',
        },
        (error, result) => {
          if (error) {
            return reject(error);
          }
          if (!result) {
            return reject(new Error('Upload failed, no result returned.'));
          }
          resolve(result.secure_url);
        },
      );

      streamifier.createReadStream(buffer).pipe(stream);
    });
  }
  private extractPublicId(url: string): string | null {
    const match = url.match(/\/v\d+\/(.+?)\.(jpg|jpeg|png|webp|pdf)$/);
    return match ? match[1] : null;
  }

  async handleDeleteImage(imageUrl: string): Promise<string> {
    if (!imageUrl) throw new UnprocessableEntityException('Image URL is required');

    const publicId = this.extractPublicId(imageUrl);
    if (!publicId) {
      throw new UnprocessableEntityException('Unable to extract public_id from the URL');
    }

    return new Promise((resolve, reject) => {
      cloudinary.uploader.destroy(publicId, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
  }

  async handleDeleteFile(fileUrl: string): Promise<string> {
    if (!fileUrl) throw new UnprocessableEntityException('File URL is required');
    const publicId = this.extractPublicId(fileUrl);
    if (!publicId)
      throw new UnprocessableEntityException('Unable to extract public_id from the URL');

    return new Promise((resolve, reject) => {
      cloudinary.uploader.destroy(publicId, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
  }
}
