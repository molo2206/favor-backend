// image.processor.ts
import sharp from 'sharp';
import { createRequire } from 'module';

// Types exportés
export type BackgroundType = 'white' | 'black' | 'color' | 'gradient' | 'transparent';

export interface BackgroundOptions {
  type: BackgroundType;
  color?: string;
  secondColor?: string;
  gradientDirection?: 'vertical' | 'horizontal' | 'diagonal';
  opacity?: number;
}

export interface ProcessImageOptions {
  folder?: string;
  width?: number;
  height?: number;
  borderSize?: number;
  borderColor?: string;
  quality?: number;
  padding?: number;
  removeBgModel?: 'small' | 'medium' | 'large';
}

interface BackgroundRemovalConfig {
  model: 'small' | 'medium' | 'large';
  output: {
    format: 'image/png' | 'image/jpeg';
    quality: number;
  };
}

// Vérifier si le module est installé
let hasBackgroundRemoval = false;
try {
  const require = createRequire(__filename);
  require.resolve('@imgly/background-removal-node');
  hasBackgroundRemoval = true;
  console.log('✅ Module background-removal trouvé');
} catch {
  console.warn('⚠️ Module @imgly/background-removal-node non installé, mode fallback activé');
}

/**
 * Supprime le background d'une image de façon optimisée pour le texte
 */
export const removeImageBackground = async (
  buffer: Buffer,
  model: 'small' | 'medium' | 'large' = 'medium'
): Promise<Buffer> => {
  if (!hasBackgroundRemoval) {
    return buffer;
  }

  try {
    // Étape 1: Améliorer le contraste et la netteté pour mieux détecter le texte
    const enhancedBuffer = await sharp(buffer)
      .resize(1200, 1200, { 
        fit: 'inside',
        withoutEnlargement: true 
      })
      .normalize() // Améliore le contraste
      .sharpen() // Renforce les bords
      .toBuffer();

    // Étape 2: Supprimer le background
    const { removeBackground } = await import('@imgly/background-removal-node');
    
    const config: BackgroundRemovalConfig = {
      model,
      output: {
        format: 'image/png',
        quality: 0.98,
      }
    };

    const blob = await removeBackground(enhancedBuffer, config);
    const arrayBuffer = await blob.arrayBuffer();
    const withoutBg = Buffer.from(arrayBuffer);

    // Étape 3: Nettoyer et rogner
    const cleanedBuffer = await sharp(withoutBg)
      .trim() // Rogne automatiquement les bords transparents
      .toBuffer();

    return cleanedBuffer;
  } catch (error) {
    console.error('Erreur lors de la suppression du background:', error);
    return buffer;
  }
};

/**
 * Crée un background selon les options
 */
export const createBackground = async (
  width: number,
  height: number,
  options: BackgroundOptions
): Promise<Buffer> => {
  const { type, color = '#ffffff', secondColor = '#000000', gradientDirection = 'vertical', opacity = 1 } = options;

  if (!width || !height || width <= 0 || height <= 0) {
    throw new Error(`Dimensions invalides: width=${width}, height=${height}`);
  }

  if (type === 'gradient') {
    return createGradient(width, height, color, secondColor, gradientDirection);
  }

  let background: { r: number; g: number; b: number; alpha: number };
  
  if (type === 'transparent') {
    background = { r: 0, g: 0, b: 0, alpha: 0 };
  } else {
    const r = parseInt(color.slice(1, 3), 16) || 255;
    const g = parseInt(color.slice(3, 5), 16) || 255;
    const b = parseInt(color.slice(5, 7), 16) || 255;
    background = { r, g, b, alpha: Math.round(opacity * 255) };
  }

  return await sharp({
    create: {
      width,
      height,
      channels: 4,
      background
    }
  })
  .png()
  .toBuffer();
};

/**
 * Crée un dégradé
 */
export const createGradient = async (
  width: number,
  height: number,
  color1: string,
  color2: string,
  direction: 'vertical' | 'horizontal' | 'diagonal'
): Promise<Buffer> => {
  if (!width || !height || width <= 0 || height <= 0) {
    throw new Error(`Dimensions invalides: width=${width}, height=${height}`);
  }

  const w = Math.floor(width);
  const h = Math.floor(height);

  const c1 = {
    r: parseInt(color1.slice(1, 3), 16) || 255,
    g: parseInt(color1.slice(3, 5), 16) || 0,
    b: parseInt(color1.slice(5, 7), 16) || 0
  };
  
  const c2 = {
    r: parseInt(color2.slice(1, 3), 16) || 0,
    g: parseInt(color2.slice(3, 5), 16) || 0,
    b: parseInt(color2.slice(5, 7), 16) || 255
  };

  const pixels = Buffer.alloc(w * h * 3);
  
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let ratio: number;
      
      switch (direction) {
        case 'horizontal':
          ratio = w > 1 ? x / (w - 1) : 0;
          break;
        case 'vertical':
          ratio = h > 1 ? y / (h - 1) : 0;
          break;
        case 'diagonal':
          ratio = (w > 1 && h > 1) ? (x / (w - 1) + y / (h - 1)) / 2 : 0;
          break;
        default:
          ratio = h > 1 ? y / (h - 1) : 0;
      }
      
      ratio = Math.max(0, Math.min(1, ratio));
      
      const offset = (y * w + x) * 3;
      pixels[offset] = Math.round(c1.r * (1 - ratio) + c2.r * ratio);
      pixels[offset + 1] = Math.round(c1.g * (1 - ratio) + c2.g * ratio);
      pixels[offset + 2] = Math.round(c1.b * (1 - ratio) + c2.b * ratio);
    }
  }
  
  return await sharp(pixels, { 
    raw: { 
      width: w, 
      height: h, 
      channels: 3 
    } 
  })
  .png()
  .toBuffer();
};

/**
 * Version spéciale pour images avec texte (CHANDLER, U.S. NAVY)
 */
export const processTextImage = async (
  file: Express.Multer.File,
  options?: {
    backgroundColor?: string;
    padding?: number;
    quality?: number;
  }
): Promise<Buffer> => {
  const bgColor = options?.backgroundColor || '#ffffff';
  const padding = options?.padding || 30;
  const quality = options?.quality || 95;

  try {
    // Étape 1: Supprimer le background de façon optimisée
    const withoutBg = await removeImageBackground(file.buffer, 'medium');

    // Étape 2: Obtenir les dimensions après nettoyage
    const cleanedBuffer = await sharp(withoutBg)
      .trim() // Rogner automatiquement
      .toBuffer();

    const metadata = await sharp(cleanedBuffer).metadata();
    const objectWidth = metadata.width || 400;
    const objectHeight = metadata.height || 200;

    // Étape 3: Créer le nouveau background
    const canvasWidth = objectWidth + (padding * 2);
    const canvasHeight = objectHeight + (padding * 2);

    // Convertir la couleur hex en RGB
    const r = parseInt(bgColor.slice(1, 3), 16) || 255;
    const g = parseInt(bgColor.slice(3, 5), 16) || 255;
    const b = parseInt(bgColor.slice(5, 7), 16) || 255;

    const background = await sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 4,
        background: { r, g, b, alpha: 255 }
      }
    }).png().toBuffer();

    // Étape 4: Centrer l'objet sur le background
    const left = Math.floor((canvasWidth - objectWidth) / 2);
    const top = Math.floor((canvasHeight - objectHeight) / 2);

    // Étape 5: Composer l'image finale
    const finalImage = await sharp(background)
      .composite([{
        input: cleanedBuffer,
        top,
        left,
      }])
      .sharpen()
      .png({ quality })
      .toBuffer();

    return finalImage;

  } catch (error) {
    console.error('Erreur dans processTextImage:', error);
    throw new Error(`Échec du traitement: ${error.message}`);
  }
};

/**
 * Traite une image avec nouveau background (version générique)
 */
export const processImageWithNewBackground = async (
  file: Express.Multer.File,
  backgroundOptions: BackgroundOptions,
  options?: ProcessImageOptions
): Promise<Buffer> => {
  const targetWidth = options?.width || 800;
  const targetHeight = options?.height || 800;
  const borderSize = options?.borderSize || 0;
  const borderColor = options?.borderColor || '#000000';
  const padding = options?.padding || 20;

  try {
    // Étape 1: Détourer l'objet
    let cutOutObject = file.buffer;
    if (hasBackgroundRemoval) {
      try {
        cutOutObject = await removeImageBackground(file.buffer, options?.removeBgModel || 'medium');
      } catch {
        console.warn('Échec de la suppression du background');
      }
    }

    // Étape 2: Créer le nouveau background
    const background = await createBackground(targetWidth, targetHeight, backgroundOptions);

    // Étape 3: Redimensionner l'objet
    const maxObjectWidth = Math.max(1, targetWidth - (padding * 2) - (borderSize * 2));
    const maxObjectHeight = Math.max(1, targetHeight - (padding * 2) - (borderSize * 2));

    const resizedObject = await sharp(cutOutObject)
      .resize(maxObjectWidth, maxObjectHeight, {
        fit: 'inside',
        withoutEnlargement: true,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .toBuffer();

    const objectMetadata = await sharp(resizedObject).metadata();
    const objectWidth = objectMetadata.width || 0;
    const objectHeight = objectMetadata.height || 0;

    // Étape 4: Positionner l'objet au centre
    const left = Math.max(0, Math.floor((targetWidth - objectWidth) / 2));
    const top = Math.max(0, Math.floor((targetHeight - objectHeight) / 2));

    // Étape 5: Composer l'image finale
    let composite = sharp(background)
      .composite([{
        input: resizedObject,
        top,
        left,
      }]);

    // Étape 6: Ajouter une bordure
    if (borderSize > 0) {
      composite = composite.extend({
        top: borderSize,
        bottom: borderSize,
        left: borderSize,
        right: borderSize,
        background: borderColor,
      });
    }

    return await composite
      .sharpen()
      .png({ quality: options?.quality || 90 })
      .toBuffer();
  } catch (error) {
    console.error('Erreur dans processImageWithNewBackground:', error);
    throw new Error(`Échec du traitement: ${error.message}`);
  }
};

export default {
  processTextImage,
  processImageWithNewBackground,
  removeImageBackground,
  createBackground,
  createGradient
};