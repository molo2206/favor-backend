import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateCompanyDto } from './dto/create-company.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { CompanyEntity } from './entities/company.entity';
import { Repository } from 'typeorm';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { CompanyStatus } from 'src/users/utility/common/company-status.enum';
import { RoleUser } from 'src/role_user/entities/role_user.entity';
import { CreateUserHasCompanyDto } from 'src/user_has_company/dto/create-user_has_company.dto';
import { instanceToPlain } from 'class-transformer';
import { TypeCompany } from 'src/type_company/entities/type_company.entity';

@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(CompanyEntity)
    private readonly companyRepository: Repository<CompanyEntity>,

    @InjectRepository(UserHasCompanyEntity)
    private readonly userHasCompanyRepository: Repository<UserHasCompanyEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,

    @InjectRepository(RoleUser)
    private roleRepository: Repository<RoleUser>,

    @InjectRepository(TypeCompany) // Ajout de l'injection du repository TypeCompany
    private readonly typeCompanyRepository: Repository<TypeCompany>, // Définition de la propriété
  ) { }

  // services/company.service.ts
  async createOrUpdateCompanyWithUser(
    dto: CreateCompanyDto,
    user: UserEntity,
    logoPath?: string,
  ): Promise<CompanyEntity> {
    // 1. Vérification des données d'entrée
    if (!dto || Object.keys(dto).length === 0) {
      throw new BadRequestException('Les données de l’entreprise sont requises');
    }

    if (!dto.companyName || dto.companyName.trim() === '') {
      throw new BadRequestException('Le nom de l’entreprise est obligatoire');
    }

    // 2. Chercher le type d'entreprise si fourni
    let typeCompanyEntity: TypeCompany | null = null;
    if (dto.typeCompany) {
      typeCompanyEntity = await this.typeCompanyRepository.findOne({
        where: { id: dto.typeCompany },
      });

      if (!typeCompanyEntity) {
        throw new NotFoundException(`TypeCompany avec l'id ${dto.typeCompany} introuvable`);
      }
    }

    // 3. Vérifier si l'entreprise existe déjà
    let company = await this.companyRepository.findOne({
      where: { companyName: dto.companyName },
    });

    // 4. Si l'entreprise existe, mettre à jour, sinon créer une nouvelle entreprise
    if (company) {
      // Mise à jour des champs de l'entreprise
      Object.assign(company, {
        companyAddress: dto.companyAddress ?? company.companyAddress,
        vatNumber: dto.vatNumber ?? company.vatNumber,
        registrationDocumentUrl: dto.registrationDocumentUrl ?? company.registrationDocumentUrl,
        warehouseLocation: dto.warehouseLocation ?? company.warehouseLocation,
        logo: logoPath ?? company.logo,
        typeCompany: typeCompanyEntity ?? company.typeCompany,
      });
    } else {
      // Création d'une nouvelle entreprise
      const companyData: Partial<CompanyEntity> = {
        companyName: dto.companyName,
        companyAddress: dto.companyAddress,
        vatNumber: dto.vatNumber,
        registrationDocumentUrl: dto.registrationDocumentUrl,
        warehouseLocation: dto.warehouseLocation,
        logo: logoPath ?? null,
        typeCompany: typeCompanyEntity,
      };

      company = this.companyRepository.create(companyData);
    }

    // Sauvegarder l'entreprise
    const savedCompany = await this.companyRepository.save(company);

    // 5. Vérifier l'association user ↔ entreprise
    let userHasCompany = await this.userHasCompanyRepository.findOne({
      where: { user: { id: user.id } },
      relations: ['user', 'company'],
    });

    if (!userHasCompany) {
      // Si l'association n'existe pas, créer une nouvelle association
      userHasCompany = this.userHasCompanyRepository.create({
        user,
        company: savedCompany,
        isOwner: true, // L'utilisateur est propriétaire
      });
    } else {
      // Si l'association existe, l'actualiser
      userHasCompany.company = savedCompany;
    }

    // Sauvegarder l'association user ↔ entreprise
    await this.userHasCompanyRepository.save(userHasCompany);

    // 6. Retourner l'entreprise mise à jour ou créée
    return savedCompany;
  }


  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async CreateUserToCompany(dto: CreateUserHasCompanyDto): Promise<any> {
    // Recherche de l'utilisateur
    const user = await this.userRepository.findOneOrFail({ where: { id: dto.userId } });

    // Recherche de l'entreprise
    const company = await this.companyRepository.findOneOrFail({ where: { id: dto.companyId } });

    // Recherche du rôle
    const role = await this.roleRepository.findOneOrFail({ where: { id: dto.roleId } });

    // Vérification si l'association existe déjà
    let userHasCompany = await this.userHasCompanyRepository.findOne({
      where: { user: { id: dto.userId }, company: { id: dto.companyId } },
      relations: ['user', 'company', 'role'],
    });

    if (userHasCompany) {
      // Mise à jour de l'association existante
      userHasCompany.company = company;
      userHasCompany.role = role;
      userHasCompany.isOwner = dto.isOwner ?? userHasCompany.isOwner;
    } else {
      // Création de la nouvelle association si elle n'existe pas
      userHasCompany = this.userHasCompanyRepository.create({
        user,
        company,
        role,
        isOwner: dto.isOwner ?? false,
      });
    }

    // Sauvegarde de l'association
    const saved = await this.userHasCompanyRepository.save(userHasCompany);

    // Retour de la réponse en excluant le mot de passe de l'utilisateur
    const result = instanceToPlain(saved);
    delete result.user?.password;

    return result;
  }

  async updateCompanyWithUser(
    dto: Partial<CreateCompanyDto>,
    companyId: string,
    userId: string,
    logoPath?: string,
  ): Promise<CompanyEntity> {
    // 1. Vérification de base : le DTO ne doit pas être vide
    if (!dto || Object.keys(dto).length === 0) {
      throw new BadRequestException("Les données de l'entreprise ne peuvent pas être vides");
    }

    // 2. Récupérer l'entreprise existante
    const company = await this.companyRepository.findOne({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException(`Entreprise avec l'ID ${companyId} introuvable`);
    }

    // 3. Validation : Si un nom est fourni, il ne doit pas être une chaîne vide
    if (dto.companyName !== undefined && dto.companyName.trim() === '') {
      throw new BadRequestException("Le nom de l'entreprise est requis");
    }

    // 4. Mise à jour dynamique des champs de l'entreprise
    const fieldsToUpdate: (keyof CreateCompanyDto)[] = [
      'companyName',
      'companyAddress',
      'vatNumber',
      'registrationDocumentUrl',
      'warehouseLocation',
    ];
    for (const field of fieldsToUpdate) {
      if (dto[field] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (company as any)[field] = dto[field];
      }
    }

    // 5. Gestion du logo : utiliser le logo uploadé en priorité sinon celui fourni dans le DTO
    if (logoPath) {
      company.logo = logoPath;
    } else if (dto.logo !== undefined) {
      company.logo = dto.logo;
    }

    // 6. Si typeCompany est présent, on récupère et on assigne l'entité
    if (dto.typeCompany) {
      const typeCompanyEntity = await this.typeCompanyRepository.findOne({
        where: { id: dto.typeCompany },
      });

      if (!typeCompanyEntity) {
        throw new NotFoundException(`TypeCompany avec l'ID ${dto.typeCompany} introuvable`);
      }

      company.typeCompany = typeCompanyEntity;
    }

    // 7. Sauvegarde de l'entreprise mise à jour
    const updatedCompany = await this.companyRepository.save(company);

    // 8. Vérifier si l'association user ↔ company existe déjà
    let userHasCompany = await this.userHasCompanyRepository.findOne({
      where: {
        user: { id: userId },
        company: { id: companyId },
      },
    });

    // 9. Création de l'association si elle n'existe pas
    if (!userHasCompany) {
      const user = await this.userRepository.findOneByOrFail({ id: userId });

      userHasCompany = this.userHasCompanyRepository.create({
        user,
        company: updatedCompany,
      });

      await this.userHasCompanyRepository.save(userHasCompany);
    }

    // 10. Retour de l'entreprise mise à jour
    return updatedCompany;
  }



  async toggleCompanyStatus(id: string): Promise<CompanyEntity> {
    const company = await this.companyRepository.findOne({ where: { id } });

    if (!company) {
      throw new NotFoundException('Entreprise non trouvée.');
    }
    // Toggle logique : si en attente → validée, sinon → en attente
    company.status =
      company.status === CompanyStatus.PENDING
        ? CompanyStatus.VALIDATED
        : CompanyStatus.PENDING;

    return await this.companyRepository.save(company);
  }

  async rejectCompany(id: string): Promise<CompanyEntity> {
    const company = await this.companyRepository.findOne({ where: { id } });

    if (!company) {
      throw new NotFoundException('Entreprise non trouvée.');
    }

    company.status = CompanyStatus.REJECTED;

    return await this.companyRepository.save(company);
  }

  async getAllCompanies(): Promise<CompanyEntity[]> {
    return this.companyRepository.find({
      relations: [
        'typeCompany',
      ],
      order: { companyName: 'ASC' }, // Optionnel : tri par nom
    });
  }

  // ✅ Récupérer une entreprise avec toutes ses relations
  async getCompanyById(id: string): Promise<CompanyEntity> {
    const company = await this.companyRepository.findOne({
      where: { id },
      relations: [
        'typeCompany',
      ],
    });

    if (!company) {
      throw new NotFoundException(`Entreprise avec l'ID ${id} introuvable`);
    }

    return company;
  }
}
