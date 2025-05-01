import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateCompanyDto } from './dto/create-company.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { CompanyEntity } from './entities/company.entity';
import { Repository } from 'typeorm';
import { UserHasCompanyEntity } from 'src/user_has_company/entities/user_has_company.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { RoleUser } from 'src/role_user/entities/role_user.entity';
import { CreateUserHasCompanyDto } from 'src/user_has_company/dto/create-user_has_company.dto';
import { instanceToPlain } from 'class-transformer';
import { TypeCompany } from 'src/type_company/entities/type_company.entity';
import { CloudinaryService } from 'src/users/utility/helpers/cloudinary.service';
import { CompanyType } from 'src/users/utility/common/type.company.enum';
import { UpdateCompanyStatusDto } from './dto/update-company-status.dto';
import { MailService } from 'src/email/email.service';
import { CompanyStatus } from 'src/users/utility/common/company-status.enum';

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
    private readonly mailService: MailService,

  ) { }

  // services/company.service.ts
  async createCompanyWithUser(
    dto: CreateCompanyDto,
    user: UserEntity,
    logoFile?: Express.Multer.File,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ message: string; data: any }> {
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

    const company = this.companyRepository.create({
      companyName: dto.companyName,
      companyAddress: dto.companyAddress,
      vatNumber: dto.vatNumber,
      registrationDocumentUrl: dto.registrationDocumentUrl,
      warehouseLocation: dto.warehouseLocation,
      logo: logoUrl,
      typeCompany: dto.typeCompany!,
      phone: dto.phone,
    });

    const savedCompany = await this.companyRepository.save(company);

    const userHasCompany = this.userHasCompanyRepository.create({
      user,
      company: savedCompany,
      isOwner: true,
    });
    await this.userHasCompanyRepository.save(userHasCompany);

    user.activeCompany = savedCompany;
    user.activeCompanyId = savedCompany.id;
    await this.userRepository.save(user);

    const fullUser = await this.userRepository.findOne({
      where: { id: user.id },
      relations: ['activeCompany', 'userHasCompany.company'],
    });

    return {
      message: 'Entreprise créée avec succès.',
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

  async updateCompanyStatus(
    id: string,
    dto: UpdateCompanyStatusDto,
  ): Promise<{ data: CompanyEntity }> {
    const company = await this.companyRepository.findOne({ where: { id } });

    if (!company) {
      throw new NotFoundException('Entreprise non trouvée.');
    }

    // Mettre à jour le statut
    company.status = dto.status;
    const updatedCompany = await this.companyRepository.save(company);

    // Récupérer l'utilisateur lié (propriétaire ou lié à cette entreprise)
    const userHasCompany = await this.userHasCompanyRepository.findOne({
      where: { company: { id: company.id } },
      relations: ['user'],
    });

    if (userHasCompany && userHasCompany.user?.email) {
      const user = userHasCompany.user;

      // Supprimer le mot de passe pour ne pas l’envoyer dans l’email
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...userWithoutPassword } = user;

      await this.mailService.sendHtmlEmail(
        user.email,
        'Mise à jour du statut de votre entreprise sur FavorHelp',
        'company-status-update.html', // Ton template d’email HTML
        {
          user: userWithoutPassword,
          companyName: company.companyName,
          status: company.status,
          year: new Date().getFullYear(),
        }
      );
    }

    return { data: updatedCompany };
  }


  async getAllCompanies(): Promise<{ data: CompanyEntity[] }> {
    const companies = await this.companyRepository.find({
      relations: [
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
      where: { id: companyId }
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
    // Récupérer l'utilisateur
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    // Récupérer l'entreprise
    const company = await this.companyRepository.findOne({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException('Entreprise introuvable');
    }

    // Vérifier si le statut de l'entreprise est "VALIDATED"
    if (company.status !== CompanyStatus.VALIDATED) {
      throw new ForbiddenException('L\'entreprise n\'est pas validée. Impossible de définir cette entreprise comme active.');
    }

    // Vérifier si l'utilisateur est lié à cette entreprise
    const userHasCompany = await this.userHasCompanyRepository.findOne({
      where: {
        user: { id: userId },
        company: { id: companyId },
      },
    });

    if (!userHasCompany) {
      throw new ForbiddenException("Cet utilisateur n'est pas lié à cette entreprise");
    }

    // Mettre à jour l'entreprise active pour l'utilisateur
    user.activeCompany = company;
    user.activeCompanyId = company.id;

    return await this.userRepository.save(user);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async findAllByUser(userId: string): Promise<Record<string, any>> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: [
        'activeCompany',
        'userHasCompany.company',
      ],
    });
  
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable.');
    }
  
    // Extraire les entreprises depuis les relations
    const companies = user.userHasCompany?.map((uhc) => ({
      ...uhc.company,
      role: uhc.role,
      permissions: uhc.permissions?.map((perm) => ({
        ...perm.permission,
      })),
      isOwner: uhc.isOwner,
    })) || [];
  
    const sanitizedUser = instanceToPlain(user);
    delete sanitizedUser.userHasCompany; // enlever si pas besoin brut
  
    return {
      ...sanitizedUser,
      companies,
    };
  }
  
}
