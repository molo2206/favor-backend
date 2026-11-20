import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname } from 'path';
import crypto from 'crypto';
import { detectFileKind, normalizeMimeType } from 'src/files/files.service';

/** Même dossier temporaire que FilesController / chat back-office */
const TEMP_DIR = './temp';

/**
 * ✅ Message vocal du chat de course : un seul fichier AUDIO (m4a, aac, mp3, ogg/opus, webm, wav…),
 * écrit dans ./temp puis enregistré par FilesService (uploads/ride-chat/…).
 * La taille réelle autorisée (RIDE_CHAT_AUDIO_MAX_MB) est vérifiée par RideChatService.
 */
export const rideChatAudioMulterOptions: MulterOptions = {
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
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (detectFileKind(normalizeMimeType(file)) !== 'AUDIO') {
      return cb(new BadRequestException(`Le fichier doit être un audio : ${file.originalname} (${file.mimetype})`), false);
    }
    cb(null, true);
  },
};
