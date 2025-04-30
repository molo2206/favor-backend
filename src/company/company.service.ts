import { BadRequestException,ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';
import { CompanyType } from 'src/users/utility/common/type.company.enum';

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

    private readonly cloudinary: CloudinaryService,

  ) { }

  // services/company.service.ts
  async createOrUpdateCompanyWithUser(
    dto: CreateCompanyDto,
    user: UserEntity,
    logoFile?: Express.Multer.File,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ message: string, data: any }> {
    if (!dto || Object.keys(dto).length === 0) {
      throw new BadRequestException('Les données de l’entreprise sont requises');
    }

    if (!dto.companyName || dto.companyName.trim() === '') {
      throw new BadRequestException('Le nom de l’entreprise est obligatoire');
    }

    let logoUrl: string | null = null;
    if (logoFile) {
      logoUrl = await this.cloudinary.handleUploadImage(logoFile, 'company');
    }

    // Vérifier si l'entreprise existe déjà
    let company = await this.companyRepository.findOne({
      where: { companyName: dto.companyName },
    });

    if (company) {
      // Si l'entreprise existe, mettre à jour les champs
      Object.assign(company, {
        companyAddress: dto.companyAddress ?? company.companyAddress,
        vatNumber: dto.vatNumber ?? company.vatNumber,
        registrationDocumentUrl: dto.registrationDocumentUrl ?? company.registrationDocumentUrl,
        warehouseLocation: dto.warehouseLocation ?? company.warehouseLocation,
        logo: logoUrl ?? company.logo,
        typeCompany: company.typeCompany,
        phone: dto.phone ?? company.phone,
      });
    } else {
      // Sinon, créer une nouvelle entreprise
      const companyData: Partial<CompanyEntity> = {
        companyName: dto.companyName,
        companyAddress: dto.companyAddress,
        vatNumber: dto.vatNumber,
        registrationDocumentUrl: dto.registrationDocumentUrl,
        warehouseLocation: dto.warehouseLocation,
        logo: logoUrl,
        typeCompany: dto.typeCompany!,
        phone: dto.phone,
      };
      company = this.companyRepository.create(companyData);
    }

    // Sauvegarde de l'entreprise
    const savedCompany = await this.companyRepository.save(company);

    // Vérifier et créer l'association utilisateur-entreprise si nécessaire
    let userHasCompanies = await this.userHasCompanyRepository.findOne({
      where: { user: { id: user.id } },
      relations: ['user', 'company'],
    });

    if (!userHasCompanies) {
      userHasCompanies = this.userHasCompanyRepository.create({
        user,
        company: savedCompany,
        isOwner: true,
      });
    } else {
      userHasCompanies.company = savedCompany;
    }

    await this.userHasCompanyRepository.save(userHasCompanies);

    // Mise à jour de l'utilisateur avec la nouvelle entreprise active
    user.activeCompany = savedCompany;
    user.activeCompanyId = savedCompany.id;
    const updatedUser = await this.userRepository.save(user);

    // Désintégration des données inutiles
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { userHasCompany, ...userClean } = updatedUser;

    const fullUser = await this.userRepository.findOne({
      where: { id: updatedUser.id },
      relations: ['activeCompany','userHasCompany.company'],
    });

    return {
      message: `Companie enregistrée avec succès.`,
      data: fullUser!,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async CreateUserToCompany(dto: CreateUserHasCompanyDto): Promise<{ message: string, data: any }> {  // Retourne 'data' dans l'objet
    const user = await this.userRepository.findOneOrFail({ where: { id: dto.userId } });
    const company = await this.companyRepository.findOneOrFail({ where: { id: dto.companyId } });
    const role = await this.roleRepository.findOneOrFail({ where: { id: dto.roleId } });

    let userHasCompany = await this.userHasCompanyRepository.findOne({
      where: { user: { id: dto.userId }, company: { id: dto.companyId } },
      relations: ['user', 'company', 'role'],
    });

    if (userHasCompany) {
      userHasCompany.company = company;
      userHasCompany.role = role;
      userHasCompany.isOwner = dto.isOwner ?? userHasCompany.isOwner;
    } else {
      userHasCompany = this.userHasCompanyRepository.create({
        user,
        company,
        role,
        isOwner: dto.isOwner ?? false,
      });
    }

    const saved = await this.userHasCompanyRepository.save(userHasCompany);

    const result = instanceToPlain(saved);
    delete result.user?.password;

    return { message: "Enregistrée avec succès", data: result };  // Encapsule la réponse dans un objet 'data'
  }

  async updateCompanyWithUser(
    dto: Partial<CreateCompanyDto>,
    companyId: string,
    userId: string,
    logoFile?: Express.Multer.File, // Modification pour prendre un fichier logo
  ): Promise<{ message: string, data: CompanyEntity }> {  // Retourne un objet avec la clé 'data'
    if (!dto || Object.keys(dto).length === 0) {
      throw new BadRequestException("Les données de l'entreprise ne peuvent pas être vides");
    }

    const company = await this.companyRepository.findOne({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException(`Entreprise avec l'ID ${companyId} introuvable`);
    }

    if (dto.companyName !== undefined && dto.companyName.trim() === '') {
      throw new BadRequestException("Le nom de l'entreprise est requis");
    }

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

    // Si un nouveau logo est téléchargé, on utilise Cloudinary
    let logoUrl: string | null = null;
    if (logoFile) {
      logoUrl = await this.cloudinary.handleUploadImage(logoFile, 'company');
      company.logo = logoUrl;
    } else if (dto.logo !== undefined) {
      company.logo = dto.logo;
    }

    // Si un type d'entreprise est fourni, on le met à jour
    if (dto.typeCompany) {
      if (!Object.values(CompanyType).includes(dto.typeCompany as CompanyType)) {
        throw new BadRequestException(`TypeCompany invalide: ${dto.typeCompany}`);
      }
      company.typeCompany = dto.typeCompany as CompanyType;
    }
    // Sauvegarde de l'entreprise mise à jour
    const updatedCompany = await this.companyRepository.save(company);

    // Recherche et création de l'association utilisateur-entreprise
    let userHasCompany = await this.userHasCompanyRepository.findOne({
      where: {
        user: { id: userId },
        company: { id: companyId },
      },
    });

    if (!userHasCompany) {
      const user = await this.userRepository.findOneByOrFail({ id: userId });

      userHasCompany = this.userHasCompanyRepository.create({
        user,
        company: updatedCompany,
      });

      await this.userHasCompanyRepository.save(userHasCompany);
    }

    return { message: 'Companie mise à jour avec succès', data: updatedCompany };  // Retourne l'entreprise mise à jour dans 'data'
  }


  async toggleCompanyStatus(id: string): Promise<{ data: CompanyEntity }> {
    const company = await this.companyRepository.findOne({ where: { id } });

    if (!company) {
      throw new NotFoundException('Entreprise non trouvée.');
    }

    company.status =
      company.status === CompanyStatus.PENDING
        ? CompanyStatus.VALIDATED
        : CompanyStatus.PENDING;

    const updatedCompany = await this.companyRepository.save(company);
    return { data: updatedCompany };
  }

  async rejectCompany(id: string): Promise<{ data: CompanyEntity }> {
    const company = await this.companyRepository.findOne({ where: { id } });

    if (!company) {
      throw new NotFoundException('Entreprise non trouvée.');
    }

    company.status = CompanyStatus.REJECTED;

    const rejectedCompany = await this.companyRepository.save(company);
    return { data: rejectedCompany };  // Structure correcte avec 'data'
  }



  async getAllCompanies(): Promise<{ data: CompanyEntity[] }> {
    const companies = await this.companyRepository.find({
      relations: [
        'typeCompany',
        'userHasCompany',
        'userHasCompany.user',
        'userHasCompany.role',
        'userHasCompany.permissions',
        'userHasCompany.permissions.permission',
      ],
      order: { companyName: 'ASC' },
    });

    return { data: companies };
  }

  async getCompanyById(id: string): Promise<{ data: CompanyEntity }> {
    const company = await this.companyRepository.findOne({
      where: { id },
      relations: [
        'typeCompany',
        'userHasCompany',
        'userHasCompany.user',
        'userHasCompany.role',
        'userHasCompany.permissions',
        'userHasCompany.permissions.permission',
      ],
    });

    if (!company) {
      throw new NotFoundException(`Entreprise avec l'ID ${id} introuvable`);
    }

    return { data: company };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async findByCompany(companyId: string): Promise<{ data: any }> {
    // Récupère la compagnie avec ses relations nécessaires
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['typeCompany'], // ou d'autres relations utiles
    });

    if (!company) {
      throw new NotFoundException(`Entreprise avec l'ID ${companyId} introuvable`);
    }

    // Récupère les produits liés à la compagnie
    const products = await this.companyRepository.find({
      where: {
        company: {
          id: companyId,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any, // <- permet à TypeScript de comprendre que tu cibles une relation
      relations: ['category', 'images'],
    });
    // Retourne tous les champs de la compagnie + les produits
    return {
      data: {
        ...company, // toutes les propriétés de l'objet company à plat
        products,   // les produits dans un tableau
      },
    };
  }

  async setActiveCompany(userId: string, companyId: string): Promise<UserEntity> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const company = await this.companyRepository.findOne({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException('Entreprise introuvable');
    }

    const userHasCompany = await this.userHasCompanyRepository.findOne({
      where: {
        user: { id: userId },
        company: { id: companyId },
      },
    });

    if (!userHasCompany) {
      throw new ForbiddenException("Cet utilisateur n'est pas lié à cette entreprise");
    }

    user.activeCompany = company;
    user.activeCompanyId = company.id;
    return await this.userRepository.save(user);
  }

}
