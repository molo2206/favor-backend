// apps/auth-service/src/sms/sms.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { CountryProvider, CountryProviderStatus } from 'src/pawapay/entity/country-provider.entity';

interface CachedCountry {
  prefix: string;
  code: string;
  countryCode: string;
  minLength: number;
  maxLength: number;
  name?: string | null;
}

@Injectable()
export class SmsService implements OnModuleInit {
  private readonly logger = new Logger(SmsService.name);

  // ✅ Config Laftica Mobile (en dur)
  private readonly accountId = 'FAVOR_GROUP_02';
  private readonly password = 'tos5k4u8nVhL';
  private readonly sender = 'Favor Help';
  private readonly apiUrl = 'https://lamsms.lafricamobile.com/api';

  // Cache des pays
  private countryCache: Map<string, CachedCountry> = new Map();
  private defaultCountry: CachedCountry | null = null;

  constructor(
    @InjectRepository(CountryProvider)
    private readonly countryProviderRepo: Repository<CountryProvider>,
  ) { }

  async onModuleInit() {
    await this.loadCountries();
  }

  // ============================================================
  // CHARGEMENT DES PAYS DEPUIS LA BDD (TypeORM)
  // ============================================================
  private async loadCountries() {
    try {
      const countries = await this.countryProviderRepo.find({
        where: { status: CountryProviderStatus.ACTIVE },
        select: ['prefix', 'code', 'countryCode', 'minLength', 'maxLength', 'name'],
        order: { prefix: 'ASC' },
      });

      this.countryCache.clear();

      // Longueurs par défaut si la BDD ne les fournit pas
      const defaultLengths: Record<string, { min: number; max: number }> = {
        '243': { min: 12, max: 12 }, // RDC
        '229': { min: 13, max: 13 }, // Bénin
        '237': { min: 12, max: 12 }, // Cameroun
        '242': { min: 12, max: 12 }, // Congo
        '225': { min: 12, max: 13 }, // Côte d'Ivoire
        '241': { min: 12, max: 12 }, // Gabon
        '254': { min: 12, max: 12 }, // Kenya
        '256': { min: 12, max: 12 }, // Ouganda
        '250': { min: 12, max: 12 }, // Rwanda
        '221': { min: 12, max: 12 }, // Sénégal
        '232': { min: 12, max: 12 }, // Sierra Leone
        '260': { min: 12, max: 12 }, // Zambie
        '234': { min: 13, max: 13 }, // Nigeria
      };

      for (const country of countries) {
        if (!country.prefix) continue;

        const fallback =
          defaultLengths[country.prefix] || { min: 10, max: 13 };

        this.countryCache.set(country.prefix, {
          prefix: country.prefix,
          code: country.code || '',
          countryCode: country.countryCode || '',
          minLength: country.minLength ?? fallback.min,
          maxLength: country.maxLength ?? fallback.max,
          name: country.name ?? null,
        });
      }

      this.defaultCountry = this.countryCache.get('243') || {
        prefix: '243',
        code: 'CD',
        countryCode: 'CD',
        minLength: 12,
        maxLength: 12,
      };

      this.logger.log(`[SmsService] ${this.countryCache.size} pays chargés`);
    } catch (error: any) {
      this.logger.error('[SmsService] Erreur chargement pays:', error);
      this.defaultCountry = {
        prefix: '243',
        code: 'CD',
        countryCode: 'CD',
        minLength: 12,
        maxLength: 12,
      };
    }
  }

  // ============================================================
  // NORMALISATION / DÉTECTION PAYS
  // ============================================================
  private normalizePhone(phoneNumber: string, countryCode?: string): string {
    if (!phoneNumber) return phoneNumber;

    try {
      let clean = phoneNumber.replace(/[^0-9+]/g, '');

      if (clean.startsWith('+')) {
        clean = clean.substring(1);
      }

      let country = this.detectCountry(clean);

      if (countryCode) {
        const found = this.getCountryByCode(countryCode);
        if (found) country = found;
      }

      if (!country && this.defaultCountry) {
        country = this.defaultCountry;
      }

      if (!country) return clean;

      return this.applyCountryFormat(clean, country);
    } catch (error: any) {
      this.logger.error('[SmsService] Erreur normalisation:', error);
      return phoneNumber.replace(/[^0-9]/g, '');
    }
  }

  private detectCountry(phoneNumber: string): CachedCountry | null {
    try {
      const sortedPrefixes = Array.from(this.countryCache.keys()).sort(
        (a, b) => b.length - a.length,
      );

      for (const prefix of sortedPrefixes) {
        if (phoneNumber.startsWith(prefix)) {
          return this.countryCache.get(prefix)!;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private getCountryByCode(code: string): CachedCountry | null {
    try {
      const upperCode = code.toUpperCase();
      for (const [, country] of this.countryCache) {
        if (country.code === upperCode || country.countryCode === upperCode) {
          return country;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private applyCountryFormat(
    phoneNumber: string,
    country: CachedCountry,
  ): string {
    try {
      const prefix = country.prefix;

      if (phoneNumber.startsWith(prefix)) {
        return phoneNumber;
      }

      if (phoneNumber.startsWith('0')) {
        return `${prefix}${phoneNumber.substring(1)}`;
      }

      return `${prefix}${phoneNumber}`;
    } catch {
      return phoneNumber;
    }
  }

  isValidPhone(
    phoneNumber: string,
    countryCode?: string,
  ): { valid: boolean; message?: string } {
    try {
      const normalized = this.normalizePhone(phoneNumber, countryCode);
      if (!normalized) {
        return { valid: true };
      }

      let country = this.detectCountry(normalized);
      if (countryCode) {
        const found = this.getCountryByCode(countryCode);
        if (found) country = found;
      }

      if (!country) {
        return { valid: true };
      }

      const length = normalized.length;
      const { minLength, maxLength } = country;

      if (length < minLength || length > maxLength) {
        return {
          valid: false,
          message: `Format invalide. Longueur attendue: ${minLength}-${maxLength} chiffres`,
        };
      }

      return { valid: true };
    } catch {
      return { valid: true };
    }
  }

  getCountryCodeFromPhone(phoneNumber: string): string | null {
    try {
      const clean = phoneNumber.replace(/[^0-9+]/g, '');
      let number = clean;
      if (number.startsWith('+')) {
        number = number.substring(1);
      }
      const country = this.detectCountry(number);
      return country ? country.countryCode : null;
    } catch {
      return null;
    }
  }

  getPrefixFromPhone(phoneNumber: string): string | null {
    try {
      const clean = phoneNumber.replace(/[^0-9+]/g, '');
      let number = clean;
      if (number.startsWith('+')) {
        number = number.substring(1);
      }
      const country = this.detectCountry(number);
      return country ? country.prefix : null;
    } catch {
      return null;
    }
  }

  async refreshCountries() {
    await this.loadCountries();
  }

  // ============================================================
  // ✅ PAYS D'UN NUMÉRO (quotas SMS par pays)
  // ============================================================

  /** Code du pays tel qu'utilisé pour les quotas SMS (countryCode, sinon code) */
  private quotaCode(country: CachedCountry): string {
    return String(country.countryCode || country.code || country.prefix).toUpperCase();
  }

  /**
   * Pays du destinataire : numéro international (+243…, 243…) ou local (0…, pays par défaut).
   * null si le numéro est vide.
   */
  resolveCountry(
    phoneNumber?: string | null,
  ): { countryCode: string; code: string; isoCode: string; prefix: string; name: string | null } | null {
    try {
      if (!phoneNumber || !String(phoneNumber).trim()) return null;
      const normalized = this.normalizePhone(String(phoneNumber));
      const country = this.detectCountry(normalized) ?? this.defaultCountry;
      if (!country) return null;
      return {
        countryCode: this.quotaCode(country),
        code: String(country.code || '').toUpperCase(),
        isoCode: String(country.countryCode || '').toUpperCase(),
        prefix: country.prefix,
        name: country.name ?? null,
      };
    } catch {
      return null;
    }
  }

  /** Pays connus pour l'envoi (indicatif, codes, nom) — sert à les relier à la table `countries` */
  providerCountries(): { prefix: string; code: string; isoCode: string; name: string | null }[] {
    return [...this.countryCache.values()].map((c) => ({
      prefix: c.prefix,
      code: String(c.code || '').toUpperCase(),
      isoCode: String(c.countryCode || '').toUpperCase(),
      name: c.name ?? null,
    }));
  }

  /** Code pays reconnu (countryCode ou code de country_providers) → code utilisé pour les quotas, sinon null */
  findQuotaCountryCode(code?: string | null): string | null {
    if (!code) return null;
    const found = this.getCountryByCode(String(code).trim());
    return found ? this.quotaCode(found) : null;
  }

  /** Pays actifs connus (pour choisir le pays d'une recharge SMS) */
  listCountries(): { countryCode: string; code: string; prefix: string; name: string | null }[] {
    return [...this.countryCache.values()]
      .map((c) => ({ countryCode: this.quotaCode(c), code: c.code, prefix: c.prefix, name: c.name ?? null }))
      .sort((a, b) => String(a.name || a.countryCode).localeCompare(String(b.name || b.countryCode)));
  }

  // ============================================================
  // ENVOI SMS — LOGIQUE LAFTICA + VALIDATION
  // ============================================================
  async sendSms(
    phoneNumber: string,
    message: string,
    countryCode?: string,
  ): Promise<boolean> {
    try {
      // 1. Normaliser le numéro
      const cleanPhone = this.normalizePhone(phoneNumber, countryCode);

      if (!cleanPhone) {
        this.logger.error(
          `❌ Numero invalide apres normalisation: ${phoneNumber}`,
        );
        return false;
      }

      // 2. Valider la longueur selon le pays détecté
      const validation = this.isValidPhone(cleanPhone, countryCode);
      if (!validation.valid) {
        this.logger.error(
          `❌ Numero invalide: ${cleanPhone} - ${validation.message}`,
        );
        return false;
      }

      this.logger.log(`📤 Numero normalise: ${cleanPhone}`);

      // 3. Construire le payload Laftica
      const payload = {
        accountid: this.accountId,
        password: this.password,
        sender: this.sender,
        datacoding: 0,
        text: message,
        ret_url:
          'https://webhook.site/160cd4e1-65b6-4220-873c-c60a3e6dc8c2',
        to: [{ ret_id_1: cleanPhone }],
      };

      this.logger.debug(
        `Payload: ${JSON.stringify({ ...payload, password: '***' }, null, 2)}`,
      );

      // 4. Envoyer la requête
      const response = await axios.post(this.apiUrl, payload, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' },
      });

      this.logger.debug(`📥 Reponse: ${JSON.stringify(response.data)}`);

      // 5. Vérifier la réponse
      let isSuccess = false;
      if (typeof response.data === 'string') {
        isSuccess =
          response.data.length > 0 && !response.data.includes('error');
        if (isSuccess) {
          this.logger.log(`✅ SMS envoye! ID: ${response.data}`);
        } else {
          this.logger.error(`❌ Echec: ${response.data}`);
        }
      } else if (
        response.data?.status === 'success' ||
        response.data?.success === true
      ) {
        isSuccess = true;
        this.logger.log(
          `✅ SMS envoye! ID: ${response.data.message_id || 'N/A'}`,
        );
      } else {
        this.logger.error(`❌ Echec: ${JSON.stringify(response.data)}`);
      }

      return isSuccess;
    } catch (error: any) {
      this.logger.error(`❌ Erreur SMS: ${error.message}`);
      if (error.response) {
        this.logger.error(`   Status: ${error.response.status}`);
        this.logger.error(`   Data: ${JSON.stringify(error.response.data)}`);
      }
      return false;
    }
  }

  // ============================================================
  // MÉTHODES PRATIQUES
  // ============================================================
  async sendOtpSms(
    phoneNumber: string,
    otpCode: string,
    countryCode?: string,
  ): Promise<boolean> {
    const message = `Votre code F-Pay est : ${otpCode}`;
    return this.sendSms(phoneNumber, message, countryCode);
  }

  async sendWelcomeSms(
    phoneNumber: string,
    fullName: string,
    accountNumber: string,
    countryCode?: string,
  ): Promise<boolean> {
    const message = `Bienvenue sur F-Pay, ${fullName} ! Votre compte ${accountNumber} a ete cree avec succes.`;
    return this.sendSms(phoneNumber, message, countryCode);
  }

  async sendBulkSms(
    recipients: {
      phone: string;
      message: string;
      countryCode?: string;
    }[],
  ): Promise<{
    success: boolean;
    results: { phone: string; status: boolean; error?: string }[];
  }> {
    const results: { phone: string; status: boolean; error?: string }[] = [];
    let allSuccess = true;

    for (const recipient of recipients) {
      try {
        const success = await this.sendSms(
          recipient.phone,
          recipient.message,
          recipient.countryCode,
        );
        results.push({ phone: recipient.phone, status: success });
        if (!success) allSuccess = false;
      } catch (error: any) {
        results.push({
          phone: recipient.phone,
          status: false,
          error: error.message,
        });
        allSuccess = false;
      }
    }

    return { success: allSuccess, results };
  }

  async sendSmsAuto(phoneNumber: string, message: string): Promise<boolean> {
    const countryCode = this.getCountryCodeFromPhone(phoneNumber);
    return this.sendSms(phoneNumber, message, countryCode || undefined);
  }

  async sendOtpSmsAuto(
    phoneNumber: string,
    otpCode: string,
  ): Promise<boolean> {
    const countryCode = this.getCountryCodeFromPhone(phoneNumber);
    return this.sendOtpSms(phoneNumber, otpCode, countryCode || undefined);
  }
}