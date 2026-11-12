// src/backOffice/chat/chat-upload.options.ts
import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname } from 'path';
import crypto from 'crypto';
import { isAllowedUpload } from 'src/files/files.service';

/** Même dossier temporaire que FilesController */
const TEMP_DIR = './temp';

/**
 * Options multer du chat : fichiers écrits dans ./temp puis traités par
 * FilesService.uploadFilesDetailed (optimisation images, compression vidéo...).
 * La taille maximale réelle (CHAT_MAX_FILE_SIZE_MB) est vérifiée par le service.
 */
export const chatMulterOptions: MulterOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true });
      cb(null, TEMP_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname || '').toLowerCase().slice(0, 10);
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: {
    fileSize: 512 * 1024 * 1024, // plafond technique
    files: 10,
  },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedUpload(file)) {
      return cb(
        new BadRequestException(
          `Type de fichier non autorisé : ${file.originalname} (${file.mimetype})`,
        ),
        false,
      );
    }
    cb(null, true);
  },
};

export const chatAvatarMulterOptions: MulterOptions = {
  ...chatMulterOptions,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedUpload(file) || !(file.mimetype || '').startsWith('image/')) {
      return cb(new BadRequestException("L'avatar doit être une image"), false);
    }
    cb(null, true);
  },
};
