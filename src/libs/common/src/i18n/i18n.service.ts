import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export const I18N_LANGUAGES = ['fr', 'en', 'sw', 'es', 'ar'] as const;
export type I18nLang = (typeof I18N_LANGUAGES)[number];

@Injectable()
export class I18nService {
  private readonly logger = new Logger('I18nService');
  private translations: Map<string, Map<string, string>> = new Map();
  /** Clés manquantes déjà signalées (évite de saturer les logs) */
  private readonly reportedMissing = new Set<string>();

  constructor() {
    this.loadTranslations();
  }

  /**
   * Cherche le dossier des traductions :
   *  - à côté du fichier compilé (dist/.../i18n/locales)
   *  - dist/libs/common/src/i18n/locales (assets nest-cli)
   *  - src/libs/common/src/i18n/locales (développement)
   *  - libs/common/src/i18n/locales (ancien emplacement)
   */
  private resolveBasePath(): string | null {
    const candidates = [
      path.join(__dirname, 'locales'),
      path.join(process.cwd(), 'dist', 'libs', 'common', 'src', 'i18n', 'locales'),
      path.join(process.cwd(), 'dist', 'src', 'libs', 'common', 'src', 'i18n', 'locales'),
      path.join(process.cwd(), 'src', 'libs', 'common', 'src', 'i18n', 'locales'),
      path.join(process.cwd(), 'libs', 'common', 'src', 'i18n', 'locales'),
    ];
    return candidates.find((p) => fs.existsSync(p)) ?? null;
  }

  private loadTranslations() {
    const basePath = this.resolveBasePath();
    if (!basePath) {
      this.logger.error('Dossier des traductions introuvable (locales)');
      for (const lang of I18N_LANGUAGES) this.translations.set(lang, new Map());
      return;
    }

    this.logger.log(`Chargement des traductions depuis : ${basePath}`);

    for (const lang of I18N_LANGUAGES) {
      const langMap = new Map<string, string>();
      const langDir = path.join(basePath, lang);

      if (fs.existsSync(langDir)) {
        const files = fs.readdirSync(langDir).filter((f) => f.endsWith('.json'));
        for (const file of files) {
          const filePath = path.join(langDir, file);
          try {
            const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '').trim();
            if (!content) continue; // fichier vide : ignoré sans erreur
            const json = JSON.parse(content);
            for (const [key, value] of Object.entries(json)) {
              if (typeof value === 'string') langMap.set(key, value);
            }
          } catch (err: any) {
            this.logger.error(`Fichier de traduction invalide ${filePath} : ${err.message}`);
          }
        }
        this.logger.log(`${langMap.size} clés chargées pour la langue : ${lang}`);
      } else {
        this.logger.warn(`Dossier de langue introuvable : ${langDir}`);
      }
      this.translations.set(lang, langMap);
    }
  }

  /** Normalise une langue ("fr-FR,fr;q=0.9" → "fr"), défaut : fr */
  normalizeLang(lang?: string | null): I18nLang {
    const primary = String(lang ?? '')
      .split(',')[0]
      .split(';')[0]
      .trim()
      .toLowerCase()
      .slice(0, 2) as I18nLang;
    return (I18N_LANGUAGES as readonly string[]).includes(primary) ? primary : 'fr';
  }

  /** La clé existe-t-elle (dans la langue ou en repli) ? */
  has(key: string, lang: string = 'fr'): boolean {
    const l = this.normalizeLang(lang);
    return !!(
      this.translations.get(l)?.has(key) ||
      this.translations.get('en')?.has(key) ||
      this.translations.get('fr')?.has(key)
    );
  }

  /**
   * Traduit une clé avec des paramètres optionnels.
   * Exemple : translate('user.login_success', 'fr', { name: 'Paul' })
   * Repli : langue demandée → anglais → français → clé.
   */
  translate(
    key: string,
    lang: string = 'fr',
    params?: Record<string, any>,
  ): string {
    const l = this.normalizeLang(lang);
    let text =
      this.translations.get(l)?.get(key) ??
      this.translations.get('en')?.get(key) ??
      this.translations.get('fr')?.get(key);

    if (!text) {
      const id = `${key}|${l}`;
      if (process.env.NODE_ENV !== 'production' && !this.reportedMissing.has(id)) {
        this.reportedMissing.add(id);
        this.logger.warn(`Missing translation key: "${key}" for language "${l}"`);
      }
      text = key;
    }

    if (params) {
      for (const [paramKey, paramValue] of Object.entries(params)) {
        text = text.split(`{{${paramKey}}}`).join(String(paramValue ?? ''));
      }
    }

    return text;
  }

  /**
   * Recharge les traductions (utile pour le développement)
   */
  reloadTranslations(): void {
    this.translations.clear();
    this.reportedMissing.clear();
    this.loadTranslations();
  }
}
