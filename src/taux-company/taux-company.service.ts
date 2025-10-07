import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TauxCompany } from './entities/taux-company.entity';
import { CreateTauxCompanyDto } from './dto/create-taux-company.dto';
import { UpdateTauxCompanyDto } from './dto/update-taux-company.dto';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { UserEntity } from 'src/users/entities/user.entity';

@Injectable()
export class TauxCompanyService {
  constructor(
    @InjectRepository(TauxCompany)
    private readonly tauxCompanyRepository: Repository<TauxCompany>,

    @InjectRepository(CompanyEntity)
    private readonly companyRepository: Repository<CompanyEntity>,
  ) {}

  /** 🟢 Créer un nouveau taux pour une entreprise */
  async create(createTauxCompanyDto: CreateTauxCompanyDto, user: UserEntity) {
    // Déterminer l'entreprise cible
    const companyId = user.activeCompanyId;

    if (!companyId) {
      throw new NotFoundException('Aucune entreprise active trouvée pour cet utilisateur');
    }

    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException(`Entreprise avec ID ${companyId} non trouvée`);
    }

    await this.tauxCompanyRepository.update({ companyId, isActive: true }, { isActive: false });
    // Créer le taux avec les valeurs statiques
    const taux = this.tauxCompanyRepository.create({
      value: createTauxCompanyDto.value, // uniquement la valeur vient du client
      name: 'Taux initial CDF', // statique
      currency: 'CDF', // statique
      isActive: true, // statique
      company,
    });

    const saved = await this.tauxCompanyRepository.save(taux);

    return {
      message: 'Taux enregistré avec succès ✅',
      data: saved,
    };
  }

  /** 🟡 Récupérer tous les taux */
  async findAll(user: UserEntity) {
    const companyId = user.activeCompanyId;

    if (!companyId) {
      throw new NotFoundException('Aucune entreprise active trouvée pour cet utilisateur.');
    }

    const tauxList = await this.tauxCompanyRepository.find({
      where: { companyId },
    });

    return {
      message: 'Liste des taux récupérée avec succès ✅',
      data: tauxList,
    };
  }

  /** 🔵 Récupérer un taux par ID */
  async findOne(id: string) {
    const taux = await this.tauxCompanyRepository.findOne({
      where: { id },
      relations: ['company'],
    });

    if (!taux) {
      throw new NotFoundException(`Taux avec ID ${id} non trouvé`);
    }

    return {
      message: 'Taux trouvé avec succès',
      data: taux,
    };
  }

  /** 🟠 Mettre à jour un taux */
  async update(id: string, updateTauxCompanyDto: UpdateTauxCompanyDto) {
    const taux = await this.tauxCompanyRepository.findOne({ where: { id } });

    if (!taux) {
      throw new NotFoundException(`Taux avec ID ${id} non trouvé`);
    }

    if (updateTauxCompanyDto.isActive) {
      await this.tauxCompanyRepository.update(
        { companyId: taux.companyId, isActive: true },
        { isActive: false },
      );
    }
    // Mettre à jour tous les champs fournis dans le DTO
    Object.assign(taux, updateTauxCompanyDto);

    const updated = await this.tauxCompanyRepository.save(taux);

    return {
      message: 'Taux mis à jour avec succès ✅',
      data: updated,
    };
  }

  /** 🔴 Supprimer un taux */
  async remove(id: string) {
    const taux = await this.tauxCompanyRepository.findOne({ where: { id } });

    if (!taux) {
      throw new NotFoundException(`Taux avec ID ${id} non trouvé`);
    }

    await this.tauxCompanyRepository.remove(taux);

    return {
      message: 'Taux supprimé avec succès 🗑️',
    };
  }
}
