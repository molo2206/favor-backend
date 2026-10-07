import sharp from 'sharp';
import { v4 as uuid } from 'uuid';
import * as fs from 'fs';
import { join } from 'path';
import { removeBackground as removeBg } from '@imgly/background-removal-node';

// Interface pour la configuration
interface BackgroundRemovalConfig {
  model: 'small' | 'medium' | 'large';
  output: {
    format: 'image/png' | 'image/jpeg';
    quality: number;
  };
}

/**
 * Supprime le background d'une image et retourne un Buffer
 */
const removeImageBackground = async (buffer: Buffer): Promise<Buffer> => {
  try {
    // Configuration typée correctement
    const config: BackgroundRemovalConfig = {
      model: 'small',
      output: {
        format: 'image/png',
        quality: 0.9,
      }
    };

    // removeBg retourne un Blob, on le convertit en Buffer
    const blob = await removeBg(buffer, config);
    
    // Conversion Blob -> Buffer
    const arrayBuffer = await blob.arrayBuffer();
    const resultBuffer = Buffer.from(arrayBuffer);
    
    return resultBuffer;
  } catch (error) {
    console.error('Erreur lors de la suppression du background:', error);
    // En cas d'erreur, retourner le buffer original
    return buffer;
  }
};

/**
 * Traite une image :
 * - suppression du background
 * - background transparent préservé
 * - redimensionnement
 * - bordure
 * - optimisation qualité
 */
export const processImage = async (
  file: Express.Multer.File,
  folder: string = 'uploads',
): Promise<string> => {
  // Dossier de destination
  const uploadPath = join(process.cwd(), folder);

  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }

  const filename = `${uuid()}.png`; // PNG pour préserver la transparence
  const filePath = join(uploadPath, filename);

  try {
    // Étape 1 : Supprimer le background
    const withoutBackground = await removeImageBackground(file.buffer);

    // Étape 2 : Traiter l'image sans background
    await sharp(withoutBackground)
      .resize(800, 800, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }, // background transparent
      })
      .extend({
        top: 10,
        bottom: 10,
        left: 10,
        right: 10,
        background: { r: 0, g: 0, b: 0, alpha: 1 }, // bordure noire opaque
      })
      .sharpen()
      .png({ quality: 90 })
      .toFile(filePath);

    // chemin à enregistrer en base
    return `${folder}/${filename}`;
  } catch (error) {
    console.error('Erreur dans processImage:', error);
    throw new Error(`Échec du traitement de l'image: ${error.message}`);
  }
};

/**
 * Traite une image et retourne un Buffer
 * - suppression du background
 * - background transparent préservé
 * - redimensionnement
 * - bordure
 * - optimisation qualité
 */
export const processImageBuffer = async (
  file: Express.Multer.File,
): Promise<Buffer> => {
  try {
    // Étape 1 : Supprimer le background
    const withoutBackground = await removeImageBackground(file.buffer);

    // Étape 2 : Traiter l'image sans background
    return await sharp(withoutBackground)
      .resize(800, 800, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }, // background transparent
      })
      .extend({
        top: 10,
        bottom: 10,
        left: 10,
        right: 10,
        background: { r: 0, g: 0, b: 0, alpha: 1 }, // bordure noire opaque
      })
      .sharpen()
      .png({ quality: 90 })
      .toBuffer();
  } catch (error) {
    console.error('Erreur dans processImageBuffer:', error);
    throw new Error(`Échec du traitement du buffer: ${error.message}`);
  }
};

/**
 * Version avec fallback si la suppression du background échoue
 */
export const processImageWithFallback = async (
  file: Express.Multer.File,
  folder: string = 'uploads',
): Promise<string> => {
  try {
    return await processImage(file, folder);
  } catch (error) {
    console.error('Erreur avec suppression background, utilisation du mode standard:', error);
    
    // Fallback: traitement sans suppression de background
    const uploadPath = join(process.cwd(), folder);
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    const filename = `${uuid()}.png`;
    const filePath = join(uploadPath, filename);

    await sharp(file.buffer)
      .resize(800, 800, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .extend({
        top: 10,
        bottom: 10,
        left: 10,
        right: 10,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      })
      .sharpen()
      .png({ quality: 90 })
      .toFile(filePath);

    return `${folder}/${filename}`;
  }
};

/**
 * Version avec options personnalisées
 */
export const processImageWithOptions = async (
  file: Express.Multer.File,
  options?: {
    folder?: string;
    width?: number;
    height?: number;
    borderSize?: number;
    borderColor?: string;
    quality?: number;
    removeBgModel?: 'small' | 'medium' | 'large';
  }
): Promise<string> => {
  const folder = options?.folder || 'uploads';
  const width = options?.width || 800;
  const height = options?.height || 800;
  const borderSize = options?.borderSize || 10;
  const borderColor = options?.borderColor || '#000000';
  const quality = options?.quality || 90;
  const removeBgModel = options?.removeBgModel || 'small';

  // Dossier de destination
  const uploadPath = join(process.cwd(), folder);

  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }

  const filename = `${uuid()}.png`;
  const filePath = join(uploadPath, filename);

  try {
    // Configuration personnalisée pour la suppression du background
    const config: BackgroundRemovalConfig = {
      model: removeBgModel,
      output: {
        format: 'image/png',
        quality: quality / 100,
      }
    };

    // removeBg retourne un Blob, on le convertit en Buffer
    const blob = await removeBg(file.buffer, config);
    const arrayBuffer = await blob.arrayBuffer();
    const withoutBackground = Buffer.from(arrayBuffer);

    // Traiter l'image
    await sharp(withoutBackground)
      .resize(width, height, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .extend({
        top: borderSize,
        bottom: borderSize,
        left: borderSize,
        right: borderSize,
        background: borderColor,
      })
      .sharpen()
      .png({ quality })
      .toFile(filePath);

    return `${folder}/${filename}`;
  } catch (error) {
    console.error('Erreur dans processImageWithOptions:', error);
    throw new Error(`Échec du traitement de l'image: ${error.message}`);
  }
};

export default {
  processImage,
  processImageBuffer,
  processImageWithFallback,
  processImageWithOptions
};