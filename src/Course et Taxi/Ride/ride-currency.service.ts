import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExchangeRateEntity } from 'src/Exchange/entities/exchange-rate.entity';
import { City } from 'src/company/entities/city.entity';
import { I18nService } from 'src/libs/common/src';

/**
 * ✅ Devise des courses — même fonctionnement que les commandes :
 *  - le PRIX reste calculé par le serveur (table pricings, dans la devise du tarif de la ville) ;
 *  - si le passager choisit une autre devise (ex. CDF), le serveur convertit ce prix
 *    avec les taux de la table exchange_rates (valeur = unités pour 1 USD) ;
 *  - les frais de transaction envoyés par l'appli sont déjà dans la devise choisie.
 * Ex. : 5 USD, taux CDF = 2 800 → 14 000 CDF ; + 140 CDF de frais → 14 140 CDF à payer.
 */
@Injectable()
export class RideCurrencyService {
  constructor(
    @InjectRepository(ExchangeRateEntity)
    private readonly rateRepo: Repository<ExchangeRateEntity>,
    private readonly config: ConfigService,
    private readonly i18n: I18nService,
  ) { }

  norm(c?: string | null): string | null {
    const v = c ? String(c).trim().toUpperCase() : '';
    return v || null;
  }

  /** Devise des tarifs d'une ville (tarif de la ville, sinon RIDE_PRICING_CURRENCY, sinon USD) */
  pricingCurrency(city?: City | null): string {
    const fromCity = this.norm((city as any)?.tarif?.currency);
    return fromCity || this.norm(this.config.get<string>('RIDE_PRICING_CURRENCY')) || 'USD';
  }

  /** Taux d'une devise : nombre d'unités pour 1 USD (USD = 1) */
  async rate(currency: string): Promise<number | null> {
    const cur = this.norm(currency);
    if (!cur) return null;
    const row = await this.rateRepo.findOne({ where: { currency: cur, deleted: false, status: true } });
    const v = Number(row?.value);
    if (v > 0) return v;
    return cur === 'USD' ? 1 : null;
  }

  private round2(n: number) {
    return Math.round(Number(n) * 100) / 100;
  }

  /** Convertit un montant ; null si un taux manque */
  async convert(amount: number | null | undefined, from: string | null | undefined, to: string | null | undefined): Promise<number | null> {
    if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return null;
    const f = this.norm(from);
    const t = this.norm(to);
    if (!f || !t || f === t) return this.round2(Number(amount));
    const [rf, rt] = await Promise.all([this.rate(f), this.rate(t)]);
    if (!rf || !rt) return null;
    return this.round2((Number(amount) / rf) * rt);
  }

  /** Comme convert, mais refuse (erreur traduite) si le taux est introuvable : jamais de mauvais montant */
  async convertOrFail(amount: number, from: string | null | undefined, to: string | null | undefined, lang: string): Promise<number> {
    const v = await this.convert(amount, from, to);
    if (v === null) {
      const missing = this.norm(to) || this.norm(from) || '';
      throw new BadRequestException(this.i18n.translate('ride.currency_rate_missing', lang, { currency: missing }));
    }
    return v;
  }
}
