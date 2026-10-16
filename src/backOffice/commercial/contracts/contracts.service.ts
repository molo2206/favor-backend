import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContractEntity } from './entities/contract.entity';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { ContractStatus } from '../common/enums/contract-status.enum';
import { CustomerEntity } from '../customers/entities/customer.entity';
import { UserEntity } from 'src/users/entities/user.entity';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { I18nService } from 'src/libs/common/src';

@Injectable()
export class ContractsService {
  constructor(
    @InjectRepository(ContractEntity)
    private readonly contractRepo: Repository<ContractEntity>,

    @InjectRepository(CustomerEntity)
    private readonly customerRepo: Repository<CustomerEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,

    private readonly i18nService: I18nService,
  ) {}

  // ============================================================
  // 🔢 GÉNÉRATION DU NUMÉRO DE CONTRAT
  // ============================================================
  private generateNumber(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `CTR-${year}-${random}`;
  }

  // ============================================================
  // 🔒 VÉRIFIER UN CLIENT
  // ============================================================
  private async validateCustomer(
    customerId: string,
    lang: string = 'fr',
  ): Promise<CustomerEntity> {
    const customer = await this.customerRepo.findOne({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException(
        await this.i18nService.translate('contract.customer_not_found', lang, {
          id: customerId,
        }),
      );
    }

    return customer;
  }

  // ============================================================
  // 🔒 VÉRIFIER UN MANAGER
  // ============================================================
  private async validateManager(
    managerId: string,
    lang: string = 'fr',
  ): Promise<UserEntity> {
    const manager = await this.userRepo.findOne({ where: { id: managerId } });

    if (!manager) {
      throw new NotFoundException(
        await this.i18nService.translate('contract.manager_not_found', lang, {
          id: managerId,
        }),
      );
    }

    if (!manager.isActive) {
      throw new BadRequestException(
        await this.i18nService.translate('contract.manager_inactive', lang, {
          name: manager.fullName,
        }),
      );
    }

    return manager;
  }

  // ============================================================
  // ➕ CRÉER UN CONTRAT
  // ============================================================
  async create(
    dto: CreateContractDto,
    lang: string = 'fr',
  ): Promise<{ message: string; data: ContractEntity }> {
    // 1. Validations de base
    if (!dto.type || dto.type.trim() === '') {
      throw new BadRequestException(
        await this.i18nService.translate('contract.type_required', lang),
      );
    }

    if (!dto.startDate) {
      throw new BadRequestException(
        await this.i18nService.translate('contract.start_date_required', lang),
      );
    }

    // 2. Validation des dates
    const startDate = new Date(dto.startDate);
    const endDate = dto.endDate ? new Date(dto.endDate) : undefined;

    if (endDate && endDate <= startDate) {
      throw new BadRequestException(
        await this.i18nService.translate('contract.end_date_before_start', lang),
      );
    }

    // 3. Vérifier le client (si fourni)
    if (dto.customerId) {
      await this.validateCustomer(dto.customerId, lang);
    }

    // 4. Vérifier le manager (si fourni)
    if (dto.managerId) {
      await this.validateManager(dto.managerId, lang);
    }

    // 5. Création
    const contract = this.contractRepo.create({
      ...dto,
      type: dto.type.trim(),
      number: this.generateNumber(),
      startDate,
      endDate,
      status: dto.status || ContractStatus.DRAFT,
    });

    const saved = await this.contractRepo.save(contract);

    return {
      message: await this.i18nService.translate('contract.created_success', lang, {
        number: saved.number,
      }),
      data: saved,
    };
  }

  // ============================================================
  // 📋 LISTER LES CONTRATS
  // ============================================================
  async findAll(
    status?: string,
    customerId?: string,
    managerId?: string,
    page: number = 1,
    limit: number = 10,
    lang: string = 'fr',
  ): Promise<{
    message: string;
    data: PaginatedResponseDto<ContractEntity>;
  }> {
    const query = this.contractRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.customer', 'customer')
      .leftJoinAndSelect('c.manager', 'manager')
      .orderBy('c.createdAt', 'DESC');

    if (status?.trim()) {
      query.andWhere('c.status = :status', { status: status.trim() });
    }
    if (customerId?.trim()) {
      query.andWhere('c.customerId = :customerId', { customerId: customerId.trim() });
    }
    if (managerId?.trim()) {
      query.andWhere('c.managerId = :managerId', { managerId: managerId.trim() });
    }

    // Pagination
    const currentPage = Math.max(1, Number(page) || 1);
    const currentLimit = Math.max(1, Number(limit) || 10);
    const skip = (currentPage - 1) * currentLimit;

    query.skip(skip).take(currentLimit);

    const [contracts, total] = await query.getManyAndCount();

    if (!contracts.length) {
      throw new NotFoundException(
        await this.i18nService.translate('contract.not_found', lang),
      );
    }

    return {
      message: await this.i18nService.translate('contract.list_retrieved', lang),
      data: new PaginatedResponseDto(
        contracts,
        total,
        currentPage,
        currentLimit,
      ),
    };
  }

  // ============================================================
  // 🔍 VOIR UN CONTRAT
  // ============================================================
  async findOne(
    id: string,
    lang: string = 'fr',
  ): Promise<{ message: string; data: ContractEntity }> {
    const contract = await this.contractRepo.findOne({
      where: { id },
      relations: ['customer', 'manager'],
    });

    if (!contract) {
      throw new NotFoundException(
        await this.i18nService.translate('contract.not_found_by_id', lang, { id }),
      );
    }

    return {
      message: await this.i18nService.translate('contract.found_success', lang, {
        number: contract.number,
      }),
      data: contract,
    };
  }

  // ============================================================
  // ✏️ MODIFIER UN CONTRAT
  // ============================================================
  async update(
    id: string,
    dto: UpdateContractDto,
    lang: string = 'fr',
  ): Promise<{ message: string; data: ContractEntity }> {
    const { data: contract } = await this.findOne(id, lang);

    // 1. Validation type
    if (dto.type !== undefined && (!dto.type || dto.type.trim() === '')) {
      throw new BadRequestException(
        await this.i18nService.translate('contract.type_required', lang),
      );
    }

    // 2. Validation dates
    const newStartDate = dto.startDate ? new Date(dto.startDate) : contract.startDate;
    const newEndDate = dto.endDate ? new Date(dto.endDate) : contract.endDate;

    if (newEndDate && newStartDate && newEndDate <= newStartDate) {
      throw new BadRequestException(
        await this.i18nService.translate('contract.end_date_before_start', lang),
      );
    }

    // 3. Vérifier le nouveau client (si changé)
    if (dto.customerId && dto.customerId !== contract.customerId) {
      await this.validateCustomer(dto.customerId, lang);
    }

    // 4. Vérifier le nouveau manager (si changé)
    if (dto.managerId && dto.managerId !== contract.managerId) {
      await this.validateManager(dto.managerId, lang);
    }

    // 5. Appliquer les modifs
    Object.assign(contract, {
      ...dto,
      ...(dto.type !== undefined && { type: dto.type.trim() }),
      ...(dto.startDate && { startDate: new Date(dto.startDate) }),
      ...(dto.endDate && { endDate: new Date(dto.endDate) }),
    });

    const updated = await this.contractRepo.save(contract);

    return {
      message: await this.i18nService.translate('contract.updated_success', lang, {
        number: updated.number,
      }),
      data: updated,
    };
  }

  // ============================================================
  // 🗑️ SUPPRIMER UN CONTRAT
  // ============================================================
  async remove(
    id: string,
    lang: string = 'fr',
  ): Promise<{ message: string }> {
    const { data: contract } = await this.findOne(id, lang);
    await this.contractRepo.remove(contract);

    return {
      message: await this.i18nService.translate('contract.deleted_success', lang, {
        number: contract.number,
      }),
    };
  }

  // ============================================================
  // ⏰ CONTRATS EXPIRANT BIENTÔT
  // ============================================================
  async findExpiring(
    days: number = 30,
    lang: string = 'fr',
  ): Promise<{ message: string; data: ContractEntity[] }> {
    const now = new Date();
    const limit = new Date();
    limit.setDate(limit.getDate() + days);

    const contracts = await this.contractRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.customer', 'customer')
      .leftJoinAndSelect('c.manager', 'manager')
      .where('c.endDate IS NOT NULL')
      .andWhere('c.endDate BETWEEN :now AND :limit', { now, limit })
      .andWhere('c.status = :status', { status: ContractStatus.ACTIVE })
      .orderBy('c.endDate', 'ASC')
      .getMany();

    return {
      message: await this.i18nService.translate('contract.expiring_retrieved', lang, {
        days,
        count: contracts.length,
      }),
      data: contracts,
    };
  }
}