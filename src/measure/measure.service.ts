import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MeasureEntity } from './entities/measure.entity';
import { CreateMeasureDto } from './dto/create-measure.dto';
import { UpdateMeasureDto } from './dto/update-measure.dto';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { UserEntity } from 'src/users/entities/user.entity';

@Injectable()
export class MeasureService {
  constructor(
    @InjectRepository(MeasureEntity)
    private readonly measureRepo: Repository<MeasureEntity>,

    @InjectRepository(CompanyEntity)
    private readonly companyRepo: Repository<CompanyEntity>,
  ) {}

  async create(
    createMeasureDto: CreateMeasureDto,
    user: UserEntity,
  ): Promise<{ message: string; data: MeasureEntity }> {
    if (!user.activeCompanyId) {
      throw new BadRequestException("Aucune entreprise active trouvée pour l'utilisateur.");
    }

    const company = await this.companyRepo.findOne({ where: { id: user.activeCompanyId } });
    if (!company) {
      throw new BadRequestException('Entreprise active introuvable');
    }

    const existing = await this.measureRepo.findOne({
      where: { name: createMeasureDto.name, company },
    });

    if (existing) {
      throw new BadRequestException('Cette unité de mesure existe déjà pour cette entreprise');
    }

    const measure = this.measureRepo.create({ ...createMeasureDto, company });
    const saved = await this.measureRepo.save(measure);
    return {
      message: 'Unité de mesure créée avec succès',
      data: saved,
    };
  }

  async findAll(companyId: string): Promise<{ message: string; data: MeasureEntity[] }> {
    // Vérifie si l’entreprise existe
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) {
      throw new BadRequestException('Entreprise introuvable');
    }

    // ✅ Filtrage via la relation (compatible avec ton entité actuelle)
    const measures = await this.measureRepo.find({
      where: { company: { id: companyId } },
      relations: ['company']
    });

    return {
      message: 'Liste des unités de mesure récupérée avec succès',
      data: measures,
    };
  }

  async findOne(
    id: string,
    companyId: string,
  ): Promise<{ message: string; data: MeasureEntity }> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) {
      throw new BadRequestException('Entreprise introuvable');
    }

    const measure = await this.measureRepo.findOne({
      where: { id, company },
    });

    if (!measure) {
      throw new NotFoundException(
        `Unité de mesure avec l'ID ${id} introuvable pour cette entreprise`,
      );
    }

    return {
      message: 'Unité de mesure récupérée avec succès',
      data: measure,
    };
  }

  async update(
    id: string,
    updateMeasureDto: UpdateMeasureDto,
    user: UserEntity,
  ): Promise<{ message: string; data: MeasureEntity }> {
    if (!user.activeCompanyId) {
      throw new BadRequestException("Aucune entreprise active trouvée pour l'utilisateur.");
    }

    const company = await this.companyRepo.findOne({ where: { id: user.activeCompanyId } });
    if (!company) {
      throw new BadRequestException('Entreprise active introuvable');
    }

    const measure = await this.findOne(id, user.activeCompanyId).then((res) => res.data);

    if (updateMeasureDto.name && updateMeasureDto.name !== measure.name) {
      const existing = await this.measureRepo.findOne({
        where: { name: updateMeasureDto.name, company },
      });

      if (existing) {
        throw new BadRequestException(
          'Une unité de mesure avec ce nom existe déjà pour cette entreprise',
        );
      }
    }

    Object.assign(measure, updateMeasureDto);
    const updated = await this.measureRepo.save(measure);

    return {
      message: 'Unité de mesure mise à jour avec succès',
      data: updated,
    };
  }

  async remove(id: string, companyId: string): Promise<{ message: string; data: null }> {
    const measure = await this.findOne(id, companyId).then((res) => res.data);
    await this.measureRepo.remove(measure);
    return {
      message: 'Unité de mesure supprimée avec succès',
      data: null,
    };
  }
}
