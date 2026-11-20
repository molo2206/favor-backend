import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatePricingDto } from './dto/create-pricing.dto';
import { UpdatePricingDto } from './dto/update-pricing.dto';
import { Pricing } from './entity/Pricing.entity';
import { PageQuery, pageParams, paginated, wantsPage } from 'src/common/pagination/paginate.util';

@Injectable()
export class PricingService {
  constructor(
    @InjectRepository(Pricing)
    private readonly pricingRepository: Repository<Pricing>,
  ) {}

  // ===============================
  // CREATE
  // ===============================
  async create(dto: CreatePricingDto) {
    const existing = await this.pricingRepository.findOne({
      where: { cityId: dto.cityId, categoryId: dto.categoryId },
    });

    if (existing) {
      throw new ConflictException({
        message: 'Un pricing existe déjà pour cette ville et catégorie',
        data: null,
      });
    }

    const pricing = this.pricingRepository.create(dto);
    const saved = await this.pricingRepository.save(pricing);

    return {
      message: 'Tarification créée avec succès',
      data: saved,
    };
  }

  // ===============================
  // FIND ALL
  // ===============================
  async findAll(query?: PageQuery & { cityId?: string; categoryId?: string }) {
    const where: any = {};
    if (query?.cityId) where.cityId = query.cityId;
    if (query?.categoryId) where.categoryId = query.categoryId;

    // ✅ ?page / ?limit : pagination standard ; sans : liste complète (comportement actuel)
    if (wantsPage(query)) {
      const { page, limit, skip } = pageParams(query, 20, 100);
      const [rows, total] = await this.pricingRepository.findAndCount({ where, relations: ['city', 'category'], skip, take: limit });
      return { message: 'Liste des tarifications', data: paginated(rows, total, page, limit) };
    }

    const data = await this.pricingRepository.find({
      where,
      relations: ['city', 'category'],
    });

    return {
      message: 'Liste des tarifications',
      data,
    };
  }

  // ===============================
  // FIND ONE
  // ===============================
  async findOne(id: string) {
    const pricing = await this.pricingRepository.findOne({
      where: { id },
      relations: ['city', 'category'],
    });

    if (!pricing) {
      throw new NotFoundException({ message: 'Pricing non trouvé', data: null });
    }

    return {
      message: 'Tarification récupérée',
      data: pricing,
    };
  }

  // ===============================
  // UPDATE
  // ===============================
  async update(id: string, dto: UpdatePricingDto) {
    const pricing = await this.pricingRepository.findOne({ where: { id } });

    if (!pricing) {
      throw new NotFoundException({ message: 'Pricing non trouvé', data: null });
    }

    Object.assign(pricing, dto);
    const updated = await this.pricingRepository.save(pricing);

    return {
      message: 'Tarification mise à jour',
      data: updated,
    };
  }

  // ===============================
  // REMOVE
  // ===============================
  async remove(id: string) {
    const pricing = await this.pricingRepository.findOne({ where: { id } });

    if (!pricing) {
      throw new NotFoundException({ message: 'Pricing non trouvé', data: null });
    }

    await this.pricingRepository.remove(pricing);

    return {
      message: 'Tarification supprimée',
      data: null,
    };
  }

  // ===============================
  // GET PRICING (pour calcul de course)
  // ===============================
  async getPricing(cityId: string, categoryId: string) {
    const pricing = await this.pricingRepository.findOne({
      where: { cityId, categoryId, isActive: true },
    });

    if (!pricing) {
      throw new NotFoundException({
        message: 'Aucun tarif actif pour cette ville et catégorie',
        data: null,
      });
    }

    return {
      message: 'Tarification active trouvée',
      data: pricing,
    };
  }
}
