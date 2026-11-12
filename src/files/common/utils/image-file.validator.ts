import { FileValidator } from '@nestjs/common';

export class ImageFileValidator extends FileValidator {
  private allowedTypes: string[];

  constructor(allowedTypes: string[]) {
    super({});
    this.allowedTypes = allowedTypes;
  }

  isValid(file: any): boolean {
    if (!file || !file.mimetype) {
      return false;
    }
    return this.allowedTypes.includes(file.mimetype);
  }

  buildErrorMessage(file: any): string {
    if (!file || !file.mimetype) {
      return 'Aucun fichier valide fourni';
    }
    return `Type de fichier non supporté: ${file.mimetype}. Types acceptés: ${this.allowedTypes.join(', ')}`;
  }
}