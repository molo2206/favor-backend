/* eslint-disable @typescript-eslint/no-unused-vars */
// src/company-tariff/company-tariff.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CompanyTariffEntity,
  ServiceType,
} from './entities/company-tariff.entity';
import { CreateCompanyTariffDto } from './dto/create-company-tariff.dto';
import { UpdateCompanyTariffDto } from './dto/update-company-tariff.dto';
import { UserEntity } from 'src/users/entities/user.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';

// Dictionnaire interne des traductions
const translations: Record<string, Record<string, string>> = {
  'tariff.error.no_active_company': {
    fr: 'Aucune entreprise active pour cet utilisateur',
    en: 'No active company for this user',
    sw: 'Hakuna kampuni inayotumika kwa mtumiaji huyu',
    es: 'No hay empresa activa para este usuario',
  },
  'tariff.error.not_found': {
    fr: 'Tarif avec l\'ID {id} non trouvé',
    en: 'Tariff with ID {id} not found',
    sw: 'Bei yenye kitambulisho {id} haipatikani',
    es: 'Tarifa con ID {id} no encontrada',
  },
  'tariff.create_success': {
    fr: 'Tarif créé avec succès',
    en: 'Tariff created successfully',
    sw: 'Bei imeundwa kwa mafanikio',
    es: 'Tarifa creada con éxito',
  },
  'tariff.update_success': {
    fr: 'Tarif mis à jour avec succès',
    en: 'Tariff updated successfully',
    sw: 'Bei imesasishwa kwa mafanikio',
    es: 'Tarifa actualizada con éxito',
  },
  'tariff.delete_success': {
    fr: 'Tarif supprimé avec succès',
    en: 'Tariff deleted successfully',
    sw: 'Bei imefutwa kwa mafanikio',
    es: 'Tarifa eliminada con éxito',
  },
  'tariff.retrieve_success': {
    fr: 'Tarif récupéré avec succès',
    en: 'Tariff retrieved successfully',
    sw: 'Bei imepatikana kwa mafanikio',
    es: 'Tarifa recuperada con éxito',
  },
  'tariff.list_retrieved': {
    fr: 'Tarifs récupérés avec succès',
    en: 'Tariffs retrieved successfully',
    sw: 'Bei zimepatikana kwa mafanikio',
    es: 'Tarifas recuperadas con éxito',
  },
  'tariff.active_list_retrieved': {
    fr: 'Tarifs actifs récupérés avec succès',
    en: 'Active tariffs retrieved successfully',
    sw: 'Bei amilifu zimepatikana kwa mafanikio',
    es: 'Tarifas activas recuperadas con éxito',
  },
  'tariff.best_retrieved': {
    fr: 'Meilleur tarif récupéré avec succès',
    en: 'Best tariff retrieved successfully',
    sw: 'Bei bora imepatikana kwa mafanikio',
    es: 'Mejor tarifa recuperada con éxito',
  },
};

@Injectable()
export class CompanyTariffService {
  constructor(
    @InjectRepository(CompanyTariffEntity)
    private readonly tariffRepo: Repository<CompanyTariffEntity>,
    @InjectRepository(CompanyEntity)
    private readonly companyRepo: Repository<CompanyEntity>,
  ) { }

  private translate(key: string, lang: string, params?: any): string {
    let text = translations[key]?.[lang];
    if (!text) {
      console.warn(`Missing translation for key: ${key}, lang: ${lang}`);
      return key;
    }
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(new RegExp(`{${k}}`, 'g'), String(v));
      });
    }
    return text;
  }

  async create(
    dto: CreateCompanyTariffDto,
    user: UserEntity,
    lang: string = 'fr',
  ): Promise<CompanyTariffEntity> {
    const activeCompanyId = user.activeCompanyId;
    if (!activeCompanyId) {
      throw new BadRequestException(
        this.translate('tariff.error.no_active_company', lang),
      );
    }

    const company = await this.companyRepo.findOne({
      where: { id: activeCompanyId },
    });

    const tariff = this.tariffRepo.create({
      companyId: activeCompanyId,
      company_type: company?.typeCompany,
      service_type: dto.service_type,
      from_country: dto.from_country,
      from_city: dto.from_city,
      to_country: dto.to_country,
      to_city: dto.to_city,
      base_price: dto.base_price,
      price_per_km: dto.price_per_km,
      price_per_kg: dto.price_per_kg,
      price_per_item: dto.price_per_item,
      min_price: dto.min_price,
      max_price: dto.max_price,
      max_weight: dto.max_weight,
      max_distance: dto.max_distance,
      currency: dto.currency,
      is_active: dto.is_active,
    });
    return this.tariffRepo.save(tariff);
  }

  async findOne(id: string, lang: string = 'fr'): Promise<CompanyTariffEntity> {
    const tariff = await this.tariffRepo.findOne({
      where: { id },
      relations: ['company'],
    });
    if (!tariff) {
      throw new NotFoundException(
        this.translate('tariff.error.not_found', lang, { id }),
      );
    }
    return tariff;
  }

  async getTariffsByCompany(
    companyId: string,
    lang: string = 'fr',
    page: number = 1,
    limit: number = 10,
  ): Promise<{ data: CompanyTariffEntity[]; total: number; page: number; limit: number; totalPages: number }> {
    const skip = (page - 1) * limit;
    const [data, total] = await this.tariffRepo.findAndCount({
      where: { companyId: companyId },
      relations: ['company'],
      order: { created_at: 'DESC' },
      skip: skip,
      take: limit,
    });
    const totalPages = Math.ceil(total / limit);
    return { data, total, page, limit, totalPages };
  }

  async getTariffsByCompanys(
    companyId: string,
    lang: string = 'fr',
  ): Promise<CompanyTariffEntity[]> {
    return this.tariffRepo.find({
      where: { companyId: companyId },
      relations: ['company'],
      order: { created_at: 'DESC' },
    });
  }

  async getActiveTariffsByCompany(
    companyId: string,
    lang: string = 'fr',
    page: number = 1,
    limit: number = 10,
  ): Promise<{ data: CompanyTariffEntity[]; total: number; page: number; limit: number; totalPages: number }> {
    const skip = (page - 1) * limit;
    const [data, total] = await this.tariffRepo.findAndCount({
      where: { companyId: companyId, is_active: true },
      relations: ['company'],
      order: { created_at: 'DESC' },
      skip: skip,
      take: limit,
    });
    const totalPages = Math.ceil(total / limit);
    return { data, total, page, limit, totalPages };
  }

  async getTariffByCompanyAndServiceType(
    companyId: string,
    serviceType: ServiceType,
    lang: string = 'fr',
  ): Promise<CompanyTariffEntity | null> {
    return this.tariffRepo.findOne({
      where: {
        companyId: companyId,
        service_type: serviceType,
        is_active: true,
      },
      relations: ['company'],
    });
  }

  async update(
    id: string,
    dto: UpdateCompanyTariffDto,
    lang: string = 'fr',
  ): Promise<CompanyTariffEntity> {
    const tariff = await this.findOne(id, lang);
    Object.assign(tariff, dto);
    return this.tariffRepo.save(tariff);
  }

  async remove(id: string, lang: string = 'fr'): Promise<void> {
    const tariff = await this.findOne(id, lang);
    await this.tariffRepo.remove(tariff);
  }
}