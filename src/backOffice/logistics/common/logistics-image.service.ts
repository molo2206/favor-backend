import { BadRequestException, Injectable } from '@nestjs/common';
import { FilesService } from 'src/files/files.service';

/** Poids max d'une image de la logistique (Mo) — LOGISTICS_MAX_IMAGE_MB, défaut 10 */
const MAX_BYTES = Number(process.env.LOGISTICS_MAX_IMAGE_MB || 10) * 1024 * 1024;

/**
 * ✅ Image de chaque enregistrement de la logistique (bien, catégorie, mouvement, demande,
 * véhicule, mission, plein, entretien, document) — même stockage que le reste du projet (FilesService).
 * Champ multipart : `image` (ou `photoUrl` texte si l'image est déjà en ligne).
 */
@Injectable()
export class LogisticsImageService {
  constructor(private readonly files: FilesService) { }

  /** Envoie l'image et renvoie son URL (undefined si aucun fichier) */
  async upload(file: Express.Multer.File | undefined | null, folder = 'logistics', allowDocuments = false): Promise<string | undefined> {
    if (!file) return undefined;
    const mime = file.mimetype || '';
    const isImage = mime.startsWith('image/');
    const isPdf = mime === 'application/pdf';
    if (!isImage && !(allowDocuments && isPdf)) {
      throw new BadRequestException(allowDocuments ? 'Image ou PDF attendu.' : 'Image attendue (jpg, png, webp…).');
    }
    if (file.size > MAX_BYTES) throw new BadRequestException(`Fichier trop lourd (max ${Math.round(MAX_BYTES / 1048576)} Mo).`);
    const info = await this.files.uploadFileDetailed(file, folder, {
      imageMaxWidth: 1600,
      imageQuality: 82,
      imageThumbnail: true,
      maxSize: MAX_BYTES,
    });
    return info.url;
  }

  /** Supprime l'ancienne image (ne lève jamais d'erreur) */
  async remove(url?: string | null) {
    if (!url) return;
    await this.files.deleteFileByUrl(url).catch(() => false);
  }
}
