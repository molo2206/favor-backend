import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class I18nService {
  private translations: Map<string, Map<string, string>> = new Map();

  constructor() {
    this.loadTranslations();
  }

  private loadTranslations() {
    // ✅ Ajout de 'ar' pour l'arabe
    const languages = ['fr', 'en', 'sw', 'es', 'ar'];

    // Définition du chemin de base vers vos locales
    let basePath = path.join(
      process.cwd(),
      'libs',
      'common',
      'src',
      'i18n',
      'locales',
    );

    // Fallback pour la production (dossier dist)
    if (!fs.existsSync(basePath)) {
      basePath = path.join(
        process.cwd(),
        'dist',
        'libs',
        'common',
        'src',
        'i18n',
        'locales',
      );
    }

    if (!fs.existsSync(basePath)) {
      console.error(
        '[I18nService] Cannot find locales directory at:',
        basePath,
      );
      return;
    }

    console.log('[I18nService] Loading translations from:', basePath);

    for (const lang of languages) {
      const langMap = new Map<string, string>();
      const langDir = path.join(basePath, lang);

      if (fs.existsSync(langDir)) {
        const files = fs.readdirSync(langDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const filePath = path.join(langDir, file);
            try {
              const content = fs.readFileSync(filePath, 'utf-8');
              const json = JSON.parse(content);
              for (const [key, value] of Object.entries(json)) {
                langMap.set(key, value as string);
              }
              console.log(
                `[I18nService] Loaded ${Object.keys(json).length} keys from ${file}`,
              );
            } catch (err) {
              console.error(
                `[I18nService] Error parsing ${filePath}:`,
                err.message,
              );
            }
          }
        }
        console.log(
          `[I18nService] Total ${langMap.size} keys for language: ${lang}`,
        );
      } else {
        console.warn(`[I18nService] Language directory not found: ${langDir}`);
      }
      this.translations.set(lang, langMap);
    }
  }

  /**
   * Traduit une clé avec des paramètres optionnels.
   * Exemple : translate('user.login_success', 'fr')
   */
  translate(
    key: string,
    lang: string = 'fr',
    params?: Record<string, any>,
  ): string {
    const langMap = this.translations.get(lang);
    let text = langMap?.get(key);

    if (!text) {
      // Fallback vers l'anglais si la clé n'existe pas dans la langue demandée
      if (lang !== 'en') {
        const enMap = this.translations.get('en');
        text = enMap?.get(key);
      }

      if (!text) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[I18nService] Missing translation key: "${key}" for language "${lang}"`,
          );
        }
        text = key;
      }
    }

    if (params && text) {
      for (const [paramKey, paramValue] of Object.entries(params)) {
        const regex = new RegExp(`{{${paramKey}}}`, 'g');
        text = text.replace(regex, String(paramValue));
      }
    }

    return text;
  }

  /**
   * Recharge les traductions (utile pour le développement)
   */
  reloadTranslations(): void {
    this.translations.clear();
    this.loadTranslations();
  }
}