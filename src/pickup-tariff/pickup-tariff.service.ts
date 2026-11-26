import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PickupTariffEntity } from './entities/pickup-tariff.entity';
import { PickupTariffTierEntity } from './entities/pickup-tariff-tier.entity';
import { Country } from 'src/company/entities/country.entity';
import { City } from 'src/company/entities/city.entity';
import {
  CreatePickupTariffDto,
  UpdatePickupTariffDto,
  UpsertPickupTierDto,
  ListPickupTariffDto,
  QuotePickupDto,
  PickupTierDto,
} from './dto/pickup-tariff.dto';

const T: Record<string, Record<string, string>> = {
  created: { fr: 'Tarif de ramassage créé.', en: 'Pickup tariff created.', sw: 'Ushuru wa kuchukua umeundwa.', es: 'Tarifa de recogida creada.' },
  updated: { fr: 'Tarif de ramassage mis à jour.', en: 'Pickup tariff updated.', sw: 'Ushuru umesasishwa.', es: 'Tarifa actualizada.' },
  deleted: { fr: 'Tarif de ramassage supprimé.', en: 'Pickup tariff deleted.', sw: 'Ushuru umefutwa.', es: 'Tarifa eliminada.' },
  retrieved: { fr: 'Tarif de ramassage récupéré.', en: 'Pickup tariff retrieved.', sw: 'Ushuru umepatikana.', es: 'Tarifa obtenida.' },
  list: { fr: 'Liste des tarifs de ramassage.', en: 'Pickup tariffs list.', sw: 'Orodha ya ushuru.', es: 'Lista de tarifas.' },
  quoted: { fr: 'Tarif de ramassage calculé.', en: 'Pickup fee computed.', sw: 'Ushuru umehesabiwa.', es: 'Tarifa calculada.' },
  not_found: { fr: 'Tarif de ramassage introuvable.', en: 'Pickup tariff not found.', sw: 'Ushuru haukupatikana.', es: 'Tarifa no encontrada.' },
  country_not_found: { fr: 'Pays introuvable.', en: 'Country not found.', sw: 'Nchi haikupatikana.', es: 'País no encontrado.' },
  city_not_found: { fr: 'Ville introuvable.', en: 'City not found.', sw: 'Jiji halikupatikana.', es: 'Ciudad no encontrada.' },
  city_country_mismatch: { fr: "La ville n'appartient pas à ce pays.", en: 'City does not belong to this country.', sw: 'Jiji si la nchi hii.', es: 'La ciudad no pertenece a este país.' },
  no_zone: { fr: 'Aucun tarif de ramassage pour ce pays/ville.', en: 'No pickup tariff for this country/city.', sw: 'Hakuna ushuru wa eneo hili.', es: 'No hay tarifa para este país/ciudad.' },
  no_tier: { fr: 'Aucun palier ne correspond à cette valeur.', en: 'No tier matches this value.', sw: 'Hakuna kiwango kinacholingana.', es: 'Ningún tramo coincide.' },
  tier_not_found: { fr: 'Palier introuvable.', en: 'Tier not found.', sw: 'Kiwango hakikupatikana.', es: 'Tramo no encontrado.' },
  bad_tiers: { fr: 'Paliers invalides (min > max ou chevauchement).', en: 'Invalid tiers (min > max or overlap).', sw: 'Viwango si sahihi.', es: 'Tramos no válidos.' },
};

@Injectable()
export class PickupTariffService {
  constructor(
    @InjectRepository(PickupTariffEntity)
    private readonly tariffRepo: Repository<PickupTariffEntity>,
    @InjectRepository(PickupTariffTierEntity)
    private readonly tierRepo: Repository<PickupTariffTierEntity>,
    @InjectRepository(Country)
    private readonly countryRepo: Repository<Country>,
    @InjectRepository(City)
    private readonly cityRepo: Repository<City>,
  ) {}

  private t(key: string, lang = 'fr'): string {
    return T[key]?.[lang] ?? T[key]?.['fr'] ?? key;
  }

  /** Vérifie l'existence du pays et (si fournie) de la ville, et leur cohérence. */
  private async assertZone(countryId: string, cityId: string | null | undefined, lang: string): Promise<void> {
    const country = await this.countryRepo.findOne({ where: { id: countryId } });
    if (!country) throw new NotFoundException(this.t('country_not_found', lang));
    if (cityId) {
      const city = await this.cityRepo.findOne({ where: { id: cityId } });
      if (!city) throw new NotFoundException(this.t('city_not_found', lang));
      if (city.countryId !== countryId) throw new BadRequestException(this.t('city_country_mismatch', lang));
    }
  }

  /** Valide et trie des paliers ; refuse min>max et chevauchements. */
  private normalizeTiers(tiers: PickupTierDto[], lang: string): PickupTierDto[] {
    const sorted = [...tiers].sort((a, b) => a.minValue - b.minValue);
    let prevMax = -Infinity;
    for (const t of sorted) {
      const max = t.maxValue == null ? Infinity : Number(t.maxValue);
      if (max < t.minValue) throw new BadRequestException(this.t('bad_tiers', lang));
      if (t.minValue <= prevMax) throw new BadRequestException(this.t('bad_tiers', lang));
      prevMax = max;
    }
    return sorted;
  }

  // ------------------------------------------------------------------ CRUD
  async create(dto: CreatePickupTariffDto, lang = 'fr') {
    await this.assertZone(dto.countryId, dto.cityId ?? null, lang);
    const tiers = this.normalizeTiers(dto.tiers, lang);
    const tariff = this.tariffRepo.create({
      name: dto.name ?? null,
      countryId: dto.countryId,
      cityId: dto.cityId ?? null,
      currency: (dto.currency ?? 'USD').toUpperCase(),
      isActive: dto.isActive ?? true,
      tiers: tiers.map((x) =>
        this.tierRepo.create({ minValue: x.minValue, maxValue: x.maxValue ?? null, price: x.price }),
      ),
    });
    const saved = await this.tariffRepo.save(tariff);
    return { message: this.t('created', lang), data: await this.findOne(saved.id, lang) };
  }

  async update(id: string, dto: UpdatePickupTariffDto, lang = 'fr') {
    const tariff = await this.tariffRepo.findOne({ where: { id }, relations: ['tiers'] });
    if (!tariff) throw new NotFoundException(this.t('not_found', lang));

    const nextCountry = dto.countryId ?? tariff.countryId;
    const nextCity = dto.cityId !== undefined ? dto.cityId : tariff.cityId;
    if (dto.countryId !== undefined || dto.cityId !== undefined) {
      await this.assertZone(nextCountry, nextCity ?? null, lang);
    }

    if (dto.name !== undefined) tariff.name = dto.name ?? null;
    if (dto.countryId !== undefined) tariff.countryId = dto.countryId;
    if (dto.cityId !== undefined) tariff.cityId = dto.cityId ?? null;
    if (dto.currency !== undefined) tariff.currency = dto.currency.toUpperCase();
    if (dto.isActive !== undefined) tariff.isActive = dto.isActive;

    if (dto.tiers) {
      const tiers = this.normalizeTiers(dto.tiers, lang);
      await this.tierRepo.delete({ tariffId: id });
      tariff.tiers = tiers.map((x) =>
        this.tierRepo.create({ tariffId: id, minValue: x.minValue, maxValue: x.maxValue ?? null, price: x.price }),
      );
    }
    await this.tariffRepo.save(tariff);
    return { message: this.t('updated', lang), data: await this.findOne(id, lang) };
  }

  async remove(id: string, lang = 'fr') {
    const tariff = await this.tariffRepo.findOne({ where: { id } });
    if (!tariff) throw new NotFoundException(this.t('not_found', lang));
    await this.tariffRepo.remove(tariff); // CASCADE supprime les paliers
    return { message: this.t('deleted', lang), data: { id } };
  }

  async findOne(id: string, lang = 'fr') {
    const tariff = await this.tariffRepo.findOne({
      where: { id },
      relations: ['tiers', 'country', 'city'],
    });
    if (!tariff) throw new NotFoundException(this.t('not_found', lang));
    tariff.tiers = [...(tariff.tiers ?? [])].sort((a, b) => a.minValue - b.minValue);
    return tariff;
  }

  async list(query: ListPickupTariffDto, lang = 'fr') {
    const qb = this.tariffRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.tiers', 'tier')
      .leftJoinAndSelect('t.country', 'country')
      .leftJoinAndSelect('t.city', 'city')
      .orderBy('country.name', 'ASC')
      .addOrderBy('city.name', 'ASC')
      .addOrderBy('tier.minValue', 'ASC');
    if (query.countryId) qb.andWhere('t.countryId = :c', { c: query.countryId });
    if (query.cityId) qb.andWhere('t.cityId = :ci', { ci: query.cityId });
    if (query.activeOnly) qb.andWhere('t.isActive = :a', { a: true });
    const data = await qb.getMany();
    return { message: this.t('list', lang), data };
  }

  // ------------------------------------------------------------ Paliers (unitaires)
  async addTier(tariffId: string, dto: UpsertPickupTierDto, lang = 'fr') {
    const tariff = await this.tariffRepo.findOne({ where: { id: tariffId }, relations: ['tiers'] });
    if (!tariff) throw new NotFoundException(this.t('not_found', lang));
    this.normalizeTiers([...(tariff.tiers ?? []), dto as PickupTierDto], lang);
    const tier = await this.tierRepo.save(
      this.tierRepo.create({ tariffId, minValue: dto.minValue, maxValue: dto.maxValue ?? null, price: dto.price }),
    );
    return { message: this.t('updated', lang), data: tier };
  }

  async updateTier(tierId: string, dto: UpsertPickupTierDto, lang = 'fr') {
    const tier = await this.tierRepo.findOne({ where: { id: tierId } });
    if (!tier) throw new NotFoundException(this.t('tier_not_found', lang));
    const others = (await this.tierRepo.find({ where: { tariffId: tier.tariffId } })).filter((x) => x.id !== tierId);
    this.normalizeTiers([...others, dto as PickupTierDto] as PickupTierDto[], lang);
    tier.minValue = dto.minValue;
    tier.maxValue = dto.maxValue ?? null;
    tier.price = dto.price;
    await this.tierRepo.save(tier);
    return { message: this.t('updated', lang), data: tier };
  }

  async removeTier(tierId: string, lang = 'fr') {
    const tier = await this.tierRepo.findOne({ where: { id: tierId } });
    if (!tier) throw new NotFoundException(this.t('tier_not_found', lang));
    await this.tierRepo.remove(tier);
    return { message: this.t('deleted', lang), data: { id: tierId } };
  }

  // ------------------------------------------------------------ Calcul du tarif
  /**
   * Trouve le tarif actif de la zone (ville précise, sinon défaut du pays) et
   * le palier correspondant à `value`. Renvoie le prix + la devise.
   */
  async quote(dto: QuotePickupDto, lang = 'fr') {
    const qb = this.tariffRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.tiers', 'tier')
      .leftJoinAndSelect('t.country', 'country')
      .leftJoinAndSelect('t.city', 'city')
      .where('t.isActive = :a', { a: true })
      .andWhere('t.countryId = :countryId', { countryId: dto.countryId });
    const tariffs = await qb.getMany();
    if (!tariffs.length) throw new NotFoundException(this.t('no_zone', lang));

    // Priorité à la ville précise, repli sur le tarif par défaut du pays (cityId = NULL)
    const cityMatch = dto.cityId ? tariffs.find((x) => x.cityId === dto.cityId) : null;
    const tariff = cityMatch ?? tariffs.find((x) => !x.cityId) ?? tariffs[0];

    const weight = Number(dto.weight);
    const tier = [...(tariff.tiers ?? [])]
      .sort((a, b) => a.minValue - b.minValue)
      .find((x) => weight >= x.minValue && (x.maxValue == null || weight <= x.maxValue));

    if (!tier) throw new NotFoundException(this.t('no_tier', lang));

    return {
      message: this.t('quoted', lang),
      data: {
        tariffId: tariff.id,
        countryId: tariff.countryId,
        country: tariff.country ? { id: tariff.country.id, name: tariff.country.name } : null,
        cityId: tariff.cityId ?? null,
        city: tariff.city ? { id: tariff.city.id, name: tariff.city.name } : null,
        currency: tariff.currency,
        weight,
        price: Number(tier.price),
        tier: {
          id: tier.id,
          minValue: tier.minValue,
          maxValue: tier.maxValue ?? null,
          price: Number(tier.price),
        },
      },
    };
  }
}
