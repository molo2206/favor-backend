import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerEntity } from './entities/customer.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';
import { CustomerStatus, CustomerType } from '../common/enums/customer.enum';
import { UserEntity } from 'src/users/entities/user.entity';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { BranchEntity } from 'src/branch/entity/branch.entity';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { I18nService } from 'src/libs/common/src';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(CustomerEntity)
    private readonly customerRepo: Repository<CustomerEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,

    @InjectRepository(CompanyEntity)
    private readonly companyRepo: Repository<CompanyEntity>,

    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,

    private readonly i18nService: I18nService,
  ) { }

  // ============================================================
  // 🔒 VÉRIFIER UN UTILISATEUR
  // ============================================================
  private async validateUser(
    userId: string,
    lang: string = 'fr',
  ): Promise<UserEntity> {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException(
        await this.i18nService.translate('customer.user_not_found', lang, {
          id: userId,
        }),
      );
    }

    return user;
  }

  // ============================================================
  // 🔒 VÉRIFIER UN COMMERCIAL RESPONSABLE
  // ============================================================
  private async validateCommercialManager(
    managerId: string,
    lang: string = 'fr',
  ): Promise<UserEntity> {
    const manager = await this.userRepo.findOne({ where: { id: managerId } });

    if (!manager) {
      throw new NotFoundException(
        await this.i18nService.translate('customer.manager_not_found', lang, {
          id: managerId,
        }),
      );
    }

    if (!manager.isActive) {
      throw new BadRequestException(
        await this.i18nService.translate('customer.manager_inactive', lang, {
          name: manager.fullName,
        }),
      );
    }

    return manager;
  }

  // ============================================================
  // 🔒 VÉRIFIER UNE ENTREPRISE
  // ============================================================
  private async validateCompany(
    companyId: string,
    lang: string = 'fr',
  ): Promise<CompanyEntity> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });

    if (!company) {
      throw new NotFoundException(
        await this.i18nService.translate('customer.company_not_found', lang, {
          id: companyId,
        }),
      );
    }

    return company;
  }

  // ============================================================
  // 🔒 VÉRIFIER UNE BRANCHE
  // ============================================================
  private async validateBranch(
    branchId: string,
    lang: string = 'fr',
  ): Promise<BranchEntity> {
    const branch = await this.branchRepo.findOne({ where: { id: branchId } });

    if (!branch) {
      throw new NotFoundException(
        await this.i18nService.translate('customer.branch_not_found', lang, {
          id: branchId,
        }),
      );
    }

    return branch;
  }

  // ============================================================
  // ➕ CRÉER UN CLIENT
  // ============================================================
  async create(
    dto: CreateCustomerDto,
    lang: string = 'fr',
  ): Promise<{ message: string; data: CustomerEntity }> {
    // 1. Validations de base
    if (!dto.fullName || dto.fullName.trim() === '') {
      throw new BadRequestException(
        await this.i18nService.translate('customer.full_name_required', lang),
      );
    }

    // 2. Déduire le type si non fourni
    const type = dto.type || (dto.companyName ? CustomerType.COMPANY : CustomerType.INDIVIDUAL);
    const status = dto.status || CustomerStatus.LEAD;

    // 3. Vérifier l'utilisateur lié (si fourni)
    if (dto.userId) {
      await this.validateUser(dto.userId, lang);

      // Vérifier qu'aucun autre Customer n'est lié à ce User
      const existing = await this.customerRepo.findOne({
        where: { userId: dto.userId },
      });
      if (existing) {
        throw new BadRequestException(
          await this.i18nService.translate('customer.user_already_linked', lang, {
            userId: dto.userId,
          }),
        );
      }
    }

    // 4. Vérifier le commercial (si fourni)
    if (dto.commercialManagerId) {
      await this.validateCommercialManager(dto.commercialManagerId, lang);
    }

    // 5. Vérifier la company (si fournie)
    if (dto.companyId) {
      await this.validateCompany(dto.companyId, lang);
    }

    // 6. Vérifier la branche (si fournie)
    if (dto.branchId) {
      await this.validateBranch(dto.branchId, lang);
    }

    // 7. Création
    const customer = this.customerRepo.create({
      ...dto,
      fullName: dto.fullName.trim(),
      email: dto.email?.toLowerCase().trim(),
      type,
      status,
    });

    const saved = await this.customerRepo.save(customer);

    return {
      message: await this.i18nService.translate('customer.created_success', lang, {
        name: saved.fullName,
      }),
      data: saved,
    };
  }

  // ============================================================
  // 📋 LISTER LES CLIENTS
  // ============================================================
  async findAll(
    query: QueryCustomerDto,
    lang: string = 'fr',
  ): Promise<{
    message: string;
    data: PaginatedResponseDto<CustomerEntity>;
  }> {
    const { page = 1, limit = 10, status, type, commercialManagerId, companyId, search } = query;

    const qb = this.customerRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.user', 'user')
      .leftJoinAndSelect('c.commercialManager', 'commercialManager')
      .leftJoinAndSelect('c.company', 'company')
      .leftJoinAndSelect('c.branch', 'branch')
      .orderBy('c.createdAt', 'DESC');

    if (status) {
      qb.andWhere('c.status = :status', { status });
    }
    if (type) {
      qb.andWhere('c.type = :type', { type });
    }
    if (commercialManagerId?.trim()) {
      qb.andWhere('c.commercialManagerId = :mid', { mid: commercialManagerId.trim() });
    }
    if (companyId?.trim()) {
      qb.andWhere('c.companyId = :companyId', { companyId: companyId.trim() });
    }
    if (search?.trim()) {
      qb.andWhere(
        '(c.fullName LIKE :s OR c.email LIKE :s OR c.phone LIKE :s OR c.companyName LIKE :s)',
        { s: `%${search.trim()}%` },
      );
    }

    // Pagination
    const currentPage = Math.max(1, Number(page) || 1);
    const currentLimit = Math.max(1, Number(limit) || 10);
    const skip = (currentPage - 1) * currentLimit;

    qb.skip(skip).take(currentLimit);

    const [customers, total] = await qb.getManyAndCount();

    if (!customers.length) {
      throw new NotFoundException(
        await this.i18nService.translate('customer.not_found', lang),
      );
    }

    return {
      message: await this.i18nService.translate('customer.list_retrieved', lang),
      data: new PaginatedResponseDto(customers, total, currentPage, currentLimit),
    };
  }

  // ============================================================
  // 🔍 VOIR UN CLIENT
  // ============================================================
  async findOne(
    id: string,
    lang: string = 'fr',
  ): Promise<{ message: string; data: CustomerEntity }> {
    const customer = await this.customerRepo.findOne({
      where: { id },
      relations: ['user', 'commercialManager', 'company', 'branch'],
    });

    if (!customer) {
      throw new NotFoundException(
        await this.i18nService.translate('customer.not_found_by_id', lang, { id }),
      );
    }

    return {
      message: await this.i18nService.translate('customer.found_success', lang, {
        name: customer.fullName,
      }),
      data: customer,
    };
  }

  // ============================================================
  // ✏️ MODIFIER UN CLIENT
  // ============================================================
  async update(
    id: string,
    dto: UpdateCustomerDto,
    lang: string = 'fr',
  ): Promise<{ message: string; data: CustomerEntity }> {
    const { data: customer } = await this.findOne(id, lang);

    // 1. Validation fullName
    if (dto.fullName !== undefined && (!dto.fullName || dto.fullName.trim() === '')) {
      throw new BadRequestException(
        await this.i18nService.translate('customer.full_name_required', lang),
      );
    }

    // 2. Vérifier le nouvel utilisateur (si changé)
    if (dto.userId && dto.userId !== customer.userId) {
      await this.validateUser(dto.userId, lang);

      const existing = await this.customerRepo.findOne({
        where: { userId: dto.userId },
      });
      if (existing && existing.id !== customer.id) {
        throw new BadRequestException(
          await this.i18nService.translate('customer.user_already_linked', lang, {
            userId: dto.userId,
          }),
        );
      }
    }

    // 3. Vérifier le nouveau commercial (si changé)
    if (dto.commercialManagerId && dto.commercialManagerId !== customer.commercialManagerId) {
      await this.validateCommercialManager(dto.commercialManagerId, lang);
    }

    // 4. Vérifier la nouvelle company (si changée)
    if (dto.companyId && dto.companyId !== customer.companyId) {
      await this.validateCompany(dto.companyId, lang);
    }

    // 5. Vérifier la nouvelle branche (si changée)
    if (dto.branchId && dto.branchId !== customer.branchId) {
      await this.validateBranch(dto.branchId, lang);
    }

    // 6. Appliquer les modifs
    Object.assign(customer, {
      ...dto,
      ...(dto.fullName !== undefined && { fullName: dto.fullName.trim() }),
      ...(dto.email !== undefined && { email: dto.email?.toLowerCase().trim() }),
    });

    const updated = await this.customerRepo.save(customer);

    return {
      message: await this.i18nService.translate('customer.updated_success', lang, {
        name: updated.fullName,
      }),
      data: updated,
    };
  }

  // ============================================================
  // 🗑️ SUPPRIMER UN CLIENT
  // ============================================================
  async remove(
    id: string,
    lang: string = 'fr',
  ): Promise<{ message: string }> {
    const { data: customer } = await this.findOne(id, lang);
    await this.customerRepo.remove(customer);

    return {
      message: await this.i18nService.translate('customer.deleted_success', lang, {
        name: customer.fullName,
      }),
    };
  }

  // ============================================================
  // 🔍 TROUVER UN CLIENT PAR userId
  // ============================================================
  async findByUserId(
    userId: string,
    lang: string = 'fr',
  ): Promise<{ message: string; data: CustomerEntity | null }> {
    const customer = await this.customerRepo.findOne({
      where: { userId },
      relations: ['user', 'commercialManager', 'company', 'branch'],
    });

    return {
      message: await this.i18nService.translate(
        customer ? 'customer.found_success' : 'customer.not_found_by_user',
        lang,
        { userId, name: customer?.fullName ?? '' },
      ),
      data: customer ?? null,
    };
  }
}