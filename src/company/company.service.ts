import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateCompanyDto } from './dto/create-company.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { CompanyEntity } from './entities/company.entity';
import { Repository } from 'typeorm';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { UserEntity } from 'src/users/entities/user.entity';

@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(CompanyEntity)
    private readonly companyRepository: Repository<CompanyEntity>,

    @InjectRepository(UserHasCompanyEntity)
    private readonly userHasCompanyRepository: Repository<UserHasCompanyEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) { }

  // services/company.service.ts
  async createOrUpdateCompanyWithUser(
    dto: CreateCompanyDto,
    user: UserEntity,
    logoPath?: string,
  ): Promise<CompanyEntity> {
    // 1. Vérification de base
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('The company data cannot be empty');
    }

    if (!dto.companyName) {
      throw new BadRequestException('Company name is required');
    }

    // 2. Vérifie si l'entreprise existe déjà (par nom)
    let company = await this.companyRepository.findOne({
      where: { companyName: dto.companyName },
    });

    if (company) {
      // Mise à jour de l'entreprise existante
      company.companyAddress = dto.companyAddress ?? company.companyAddress;
      company.vatNumber = dto.vatNumber ?? company.vatNumber;
      company.registrationDocumentUrl = dto.registrationDocumentUrl ?? company.registrationDocumentUrl;
      company.warehouseLocation = dto.warehouseLocation ?? company.warehouseLocation;
      company.logo = logoPath ?? company.logo;
    } else {
      // Création de la nouvelle entreprise
      company = this.companyRepository.create({
        ...dto,
        logo: logoPath ?? null,
      });
    }

    // 3. Sauvegarde de l'entreprise (créée ou mise à jour)
    const savedCompany = await this.companyRepository.save(company);

    // 4. Vérifie si l'association utilisateur <-> entreprise existe
    const existingAssociation = await this.userHasCompanyRepository.findOne({
      where: {
        user: { id: user.id },
        company: { id: savedCompany.id },
      },
    });

    if (!existingAssociation) {
      const userHasCompany = this.userHasCompanyRepository.create({
        user,
        company: savedCompany,
      });

      await this.userHasCompanyRepository.save(userHasCompany);
    }

    return savedCompany;
  }



  async updateCompanyWithUser(
    dto: Partial<CreateCompanyDto>,
    companyId: string,
    userId: string,
    logoPath?: string,
  ): Promise<CompanyEntity> {
    // Vérifier si le DTO est défini et contient des données valides
    if (!dto || Object.keys(dto).length === 0) {
      throw new BadRequestException('Company data cannot be empty');
    }

    // Récupérer l'entreprise existante
    const company = await this.companyRepository.findOne({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException(`Company with ID ${companyId} not found`);
    }

    // Vérification si le nom de l'entreprise est défini dans le DTO
    if (dto.companyName === undefined || dto.companyName.trim() === '') {
      throw new BadRequestException('Company name is required');
    }

    // Mise à jour des champs uniquement si définis
    if (dto.companyName !== undefined) company.companyName = dto.companyName;
    if (dto.companyAddress !== undefined) company.companyAddress = dto.companyAddress;
    if (dto.vatNumber !== undefined) company.vatNumber = dto.vatNumber;
    if (dto.registrationDocumentUrl !== undefined) company.registrationDocumentUrl = dto.registrationDocumentUrl;
    if (dto.warehouseLocation !== undefined) company.warehouseLocation = dto.warehouseLocation;

    // Mise à jour du logo si un nouveau chemin est fourni
    if (logoPath !== undefined) {
      company.logo = logoPath;
    } else if (dto.logo !== undefined) {
      company.logo = dto.logo;
    }

    // Sauvegarder l'entreprise mise à jour
    const updatedCompany = await this.companyRepository.save(company);

    // Vérification et création de l'association utilisateur-entreprise
    const userHasCompany = await this.userHasCompanyRepository.findOne({
      where: {
        user: { id: userId },
        company: { id: companyId },
      },
    });

    // Si l'association n'existe pas, en créer une nouvelle
    if (!userHasCompany) {
      const user = await this.userRepository.findOneByOrFail({ id: userId });
      const newUserHasCompany = this.userHasCompanyRepository.create({
        user,
        company: updatedCompany,
      });
      await this.userHasCompanyRepository.save(newUserHasCompany);
    }

    return updatedCompany;
  }

}
