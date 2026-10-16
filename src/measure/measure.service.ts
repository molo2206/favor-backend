import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MeasureEntity } from './entities/measure.entity';
import { CreateMeasureDto } from './dto/create-measure.dto';
import { UpdateMeasureDto } from './dto/update-measure.dto';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { PermissionHelper } from 'src/users/utility/helpers/permission.helper';

// Dictionnaire interne des traductions
const translations: Record<string, Record<string, string>> = {
  'measure.error.no_company_specified': {
    fr: 'Aucune entreprise spécifiée. Veuillez fournir un company_id ou activer une entreprise.',
    en: 'No company specified. Please provide a company_id or activate a company.',
    sw: 'Hakuna kampuni iliyobainishwa. Tafadhali toa company_id au wezesha kampuni.',
    es: 'No se especificó ninguna empresa. Proporcione un company_id o active una empresa.',
  },
  'measure.error.company_not_found': {
    fr: 'Entreprise avec l\'ID {companyId} introuvable',
    en: 'Company with ID {companyId} not found',
    sw: 'Kampuni yenye kitambulisho {companyId} haipatikani',
    es: 'Empresa con ID {companyId} no encontrada',
  },
  'measure.error.duplicate_name': {
    fr: 'L\'unité de mesure "{name}" existe déjà pour cette entreprise',
    en: 'The unit of measure "{name}" already exists for this company',
    sw: 'Kipimo "{name}" tayari kinapatikana kwa kampuni hii',
    es: 'La unidad de medida "{name}" ya existe para esta empresa',
  },
  'measure.error.not_found': {
    fr: 'Unité de mesure avec l\'ID {id} introuvable pour cette entreprise',
    en: 'Unit of measure with ID {id} not found for this company',
    sw: 'Kipimo chenye kitambulisho {id} hakipatikani kwa kampuni hii',
    es: 'Unidad de medida con ID {id} no encontrada para esta empresa',
  },
  'measure.error.public_not_found': {
    fr: 'Unité de mesure avec l\'ID {id} introuvable',
    en: 'Unit of measure with ID {id} not found',
    sw: 'Kipimo chenye kitambulisho {id} hakipatikani',
    es: 'Unidad de medida con ID {id} no encontrada',
  },
  'measure.error.no_active_company': {
    fr: 'Aucune entreprise active pour cet utilisateur',
    en: 'No active company for this user',
    sw: 'Hakuna kampuni inayotumika kwa mtumiaji huyu',
    es: 'No hay empresa activa para este usuario',
  },
  'measure.error.measure_not_belong': {
    fr: 'Unité de mesure avec l\'ID {id} introuvable ou n\'appartient pas à cette entreprise',
    en: 'Unit of measure with ID {id} not found or does not belong to this company',
    sw: 'Kipimo chenye kitambulisho {id} hakipatikani au sio cha kampuni hii',
    es: 'Unidad de medida con ID {id} no encontrada o no pertenece a esta empresa',
  },
  'measure.error.duplicate_on_update': {
    fr: 'Une unité de mesure avec le nom "{name}" existe déjà pour cette entreprise',
    en: 'A unit of measure with the name "{name}" already exists for this company',
    sw: 'Kipimo chenye jina "{name}" tayari kinapatikana kwa kampuni hii',
    es: 'Ya existe una unidad de medida con el nombre "{name}" para esta empresa',
  },
  'measure.create_success': {
    fr: 'Unité de mesure créée avec succès',
    en: 'Unit of measure created successfully',
    sw: 'Kipimo kimeundwa kwa mafanikio',
    es: 'Unidad de medida creada con éxito',
  },
  'measure.list_success': {
    fr: 'Liste des unités de mesure récupérée avec succès',
    en: 'List of units of measure retrieved successfully',
    sw: 'Orodha ya vipimo imepatikana kwa mafanikio',
    es: 'Lista de unidades de medida recuperada con éxito',
  },
  'measure.retrieve_success': {
    fr: 'Unité de mesure récupérée avec succès',
    en: 'Unit of measure retrieved successfully',
    sw: 'Kipimo kimepatikana kwa mafanikio',
    es: 'Unidad de medida recuperada con éxito',
  },
  'measure.public_retrieve_success': {
    fr: 'Unité de mesure récupérée avec succès (mode public)',
    en: 'Unit of measure retrieved successfully (public mode)',
    sw: 'Kipimo kimepatikana kwa mafanikio (hali ya umma)',
    es: 'Unidad de medida recuperada con éxito (modo público)',
  },
  'measure.update_success': {
    fr: 'Unité de mesure mise à jour avec succès',
    en: 'Unit of measure updated successfully',
    sw: 'Kipimo kimesasishwa kwa mafanikio',
    es: 'Unidad de medida actualizada con éxito',
  },
  'measure.delete_success': {
    fr: 'Unité de mesure supprimée avec succès',
    en: 'Unit of measure deleted successfully',
    sw: 'Kipimo kimefutwa kwa mafanikio',
    es: 'Unidad de medida eliminada con éxito',
  },
  'measure.no_active_company_message': {
    fr: 'Aucune entreprise active pour cet utilisateur',
    en: 'No active company for this user',
    sw: 'Hakuna kampuni inayotumika kwa mtumiaji huyu',
    es: 'No hay empresa activa para este usuario',
  },
};

@Injectable()
export class MeasureService {
  constructor(
    @InjectRepository(MeasureEntity)
    private readonly measureRepo: Repository<MeasureEntity>,
    @InjectRepository(CompanyEntity)
    private readonly companyRepo: Repository<CompanyEntity>,
    private readonly permissionHelper: PermissionHelper,
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
    createMeasureDto: CreateMeasureDto,
    user: UserEntity,
    lang: string = 'fr',
  ): Promise<{ message: string; data: MeasureEntity }> {
    let companyId: string;

    if (createMeasureDto.company_id) {
      companyId = createMeasureDto.company_id;
    } else if (user.activeCompanyId) {
      companyId = user.activeCompanyId;
    } else {
      throw new BadRequestException(
        this.translate('measure.error.no_company_specified', lang),
      );
    }

    const company = await this.companyRepo.findOne({
      where: { id: companyId },
    });
    if (!company) {
      throw new BadRequestException(
        this.translate('measure.error.company_not_found', lang, { companyId }),
      );
    }

    const existing = await this.measureRepo.findOne({
      where: {
        name: createMeasureDto.name,
        company: { id: companyId },
      },
    });

    if (existing) {
      throw new BadRequestException(
        this.translate('measure.error.duplicate_name', lang, {
          name: createMeasureDto.name,
        }),
      );
    }

    const measure = this.measureRepo.create({
      name: createMeasureDto.name,
      abbreviation: createMeasureDto.abbreviation,
      company: company,
    });

    const saved = await this.measureRepo.save(measure);

    return {
      message: this.translate('measure.create_success', lang),
      data: saved,
    };
  }

  async findAll(
    companyId: string,
    lang: string = 'fr',
  ): Promise<{ message: string; data: MeasureEntity[] }> {
    const company = await this.companyRepo.findOne({
      where: { id: companyId },
    });
    if (!company) {
      throw new BadRequestException(
        this.translate('measure.error.company_not_found', lang, { companyId }),
      );
    }

    const measures = await this.measureRepo.find({
      where: { company: { id: companyId } },
      relations: ['company'],
    });

    return {
      message: this.translate('measure.list_success', lang),
      data: measures,
    };
  }

  async findAllMeseare(
    currentUser: UserEntity,
    lang: string = 'fr',
  ): Promise<{ message: string; data: MeasureEntity[] }> {
    const canManageAll = await this.permissionHelper.hasManageOnResource(
      currentUser,
      'MEASURES',
    );

    let measures: MeasureEntity[];

    if (canManageAll) {
      measures = await this.measureRepo.find({ relations: ['company'] });
    } else {
      if (!currentUser.activeCompanyId) {
        return {
          message: this.translate('measure.no_active_company_message', lang),
          data: [],
        };
      }
      measures = await this.measureRepo.find({
        where: { company: { id: currentUser.activeCompanyId } },
        relations: ['company'],
      });
    }

    return {
      message: this.translate('measure.list_success', lang),
      data: measures,
    };
  }

  async findOne(
    id: string,
    companyId: string,
    lang: string = 'fr',
  ): Promise<{ message: string; data: MeasureEntity }> {
    const company = await this.companyRepo.findOne({
      where: { id: companyId },
    });
    if (!company) {
      throw new BadRequestException(
        this.translate('measure.error.company_not_found', lang, { companyId }),
      );
    }

    const measure = await this.measureRepo.findOne({
      where: { id, company },
      relations: ['company'],
    });

    if (!measure) {
      throw new NotFoundException(
        this.translate('measure.error.not_found', lang, { id }),
      );
    }

    return {
      message: this.translate('measure.retrieve_success', lang),
      data: measure,
    };
  }

  async findOnePublic(
    id: string,
    lang: string = 'fr',
  ): Promise<{ message: string; data: MeasureEntity }> {
    const measure = await this.measureRepo.findOne({
      where: { id },
      relations: ['company'],
    });

    if (!measure) {
      throw new NotFoundException(
        this.translate('measure.error.public_not_found', lang, { id }),
      );
    }

    return {
      message: this.translate('measure.public_retrieve_success', lang),
      data: measure,
    };
  }

  async update(
    id: string,
    updateMeasureDto: UpdateMeasureDto,
    user: UserEntity,
    lang: string = 'fr',
  ): Promise<{ message: string; data: MeasureEntity }> {
    const companyId = updateMeasureDto.company_id || user.activeCompanyId;

    if (!companyId) {
      throw new BadRequestException(
        this.translate('measure.error.no_company_specified', lang),
      );
    }

    const company = await this.companyRepo.findOne({
      where: { id: companyId },
    });
    if (!company) {
      throw new BadRequestException(
        this.translate('measure.error.company_not_found', lang, { companyId }),
      );
    }

    const measure = await this.measureRepo.findOne({
      where: {
        id: id,
        company: { id: companyId },
      },
      relations: ['company'],
    });

    if (!measure) {
      throw new BadRequestException(
        this.translate('measure.error.measure_not_belong', lang, { id }),
      );
    }

    if (updateMeasureDto.name && updateMeasureDto.name !== measure.name) {
      const existing = await this.measureRepo.findOne({
        where: {
          name: updateMeasureDto.name,
          company: { id: companyId },
        },
      });

      if (existing) {
        throw new BadRequestException(
          this.translate('measure.error.duplicate_on_update', lang, {
            name: updateMeasureDto.name,
          }),
        );
      }
    }

    if (
      updateMeasureDto.company_id &&
      updateMeasureDto.company_id !== measure.company.id
    ) {
      measure.company = company;
    }

    Object.assign(measure, {
      name: updateMeasureDto.name ?? measure.name,
      abbreviation: updateMeasureDto.abbreviation ?? measure.abbreviation,
    });

    const updated = await this.measureRepo.save(measure);

    return {
      message: this.translate('measure.update_success', lang),
      data: updated,
    };
  }

  async remove(
    id: string,
    companyId: string,
    lang: string = 'fr',
  ): Promise<{ message: string; data: null }> {
    const measure = await this.findOne(id, companyId, lang).then(
      (res) => res.data,
    );
    await this.measureRepo.remove(measure);
    return {
      message: this.translate('measure.delete_success', lang),
      data: null,
    };
  }
}