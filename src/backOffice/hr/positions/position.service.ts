import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PositionEntity, PositionStatus } from './entities/position.entity';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { ListPositionQueryDto } from './dto/list-position-query.dto';
import { I18nService } from 'src/libs/common/src';
import { UserEntity } from 'src/users/entities/user.entity';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';

@Injectable()
export class PositionService {
  constructor(
    @InjectRepository(PositionEntity)
    private readonly positionRepo: Repository<PositionEntity>,
    private readonly i18n: I18nService,
  ) {}

  // ============================================================
  // ➕ CRÉER
  // ============================================================
  async create(
    dto: CreatePositionDto,
    currentUser: UserEntity,
    lang: string = 'fr',
  ): Promise<{ message: string; data: PositionEntity }> {
    if (!dto.name || dto.name.trim() === '') {
      throw new BadRequestException(
        await this.i18n.translate('position.name_required', lang),
      );
    }

    const companyId = dto.companyId ?? currentUser.activeCompanyId;
    if (!companyId) {
      throw new BadRequestException(
        await this.i18n.translate('position.company_required', lang),
      );
    }

    // Vérifier doublon
    const exists = await this.positionRepo.findOne({
      where: { name: dto.name.trim(), companyId },
    });
    if (exists) {
      throw new BadRequestException(
        await this.i18n.translate('position.already_exists', lang, {
          name: dto.name,
        }),
      );
    }

    const position: PositionEntity = this.positionRepo.create({
      name: dto.name.trim(),
      description: dto.description?.trim() ?? undefined,
      status: dto.status ?? PositionStatus.ACTIVE,
      departmentId: dto.departmentId ?? undefined,
      companyId,
      managerId: dto.managerId ?? undefined,
      createdById: currentUser.id,
      updatedById: currentUser.id,
    });

    const saved: PositionEntity = await this.positionRepo.save(position);

    return {
      message: await this.i18n.translate('position.created_success', lang, {
        name: saved.name,
      }),
      data: saved,
    };
  }

  // ============================================================
  // 📋 LISTER
  // ============================================================
  async findAll(
    query: ListPositionQueryDto,
    currentUser: UserEntity,
    lang: string = 'fr',
  ): Promise<{ message: string; data: PaginatedResponseDto<PositionEntity> }> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const skip = (page - 1) * limit;

    const qb = this.positionRepo
      .createQueryBuilder('position')
      .leftJoinAndSelect('position.department', 'department')
      .leftJoinAndSelect('position.company', 'company')
      .leftJoinAndSelect('position.manager', 'manager')
      .leftJoinAndSelect('position.createdBy', 'createdBy')
      .leftJoinAndSelect('position.updatedBy', 'updatedBy')
      .orderBy('position.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const companyId = query.companyId ?? currentUser.activeCompanyId;
    if (companyId) {
      qb.andWhere('position.companyId = :companyId', { companyId });
    }

    if (query.departmentId) {
      qb.andWhere('position.departmentId = :departmentId', {
        departmentId: query.departmentId,
      });
    }

    if (query.status) {
      qb.andWhere('position.status = :status', { status: query.status });
    }

    if (query.search && query.search.trim() !== '') {
      qb.andWhere(
        '(position.name LIKE :search OR position.description LIKE :search)',
        { search: `%${query.search.trim()}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();

    return {
      message:
        data.length > 0
          ? await this.i18n.translate('position.list_success', lang, {
              count: data.length,
            })
          : await this.i18n.translate('position.list_empty', lang),
      data: new PaginatedResponseDto(data, total, page, limit),
    };
  }

  // ============================================================
  // 🔍 VOIR UNE
  // ============================================================
  async findOne(
    id: string,
    lang: string = 'fr',
  ): Promise<{ message: string; data: PositionEntity }> {
    const position = await this.positionRepo.findOne({
      where: { id },
      relations: [
        'department',
        'company',
        'manager',
        'createdBy',
        'updatedBy',
      ],
    });

    if (!position) {
      throw new NotFoundException(
        await this.i18n.translate('position.not_found', lang, { id }),
      );
    }

    return {
      message: await this.i18n.translate('position.found_success', lang),
      data: position,
    };
  }

  // ============================================================
  // ✏️ MODIFIER
  // ============================================================
  async update(
    id: string,
    dto: UpdatePositionDto,
    currentUser: UserEntity,
    lang: string = 'fr',
  ): Promise<{ message: string; data: PositionEntity }> {
    const position = await this.positionRepo.findOne({ where: { id } });
    if (!position) {
      throw new NotFoundException(
        await this.i18n.translate('position.not_found', lang, { id }),
      );
    }

    if (dto.name && dto.name.trim() !== position.name) {
      const exists = await this.positionRepo.findOne({
        where: {
          name: dto.name.trim(),
          companyId: position.companyId ?? '',
        },
      });
      if (exists && exists.id !== id) {
        throw new BadRequestException(
          await this.i18n.translate('position.already_exists', lang, {
            name: dto.name,
          }),
        );
      }
    }

    Object.assign(position, {
      ...(dto.name !== undefined && { name: dto.name.trim() }),
      ...(dto.description !== undefined && {
        description: dto.description?.trim(),
      }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.departmentId !== undefined && { departmentId: dto.departmentId }),
      ...(dto.companyId !== undefined && { companyId: dto.companyId }),
      ...(dto.managerId !== undefined && { managerId: dto.managerId }),
      updatedById: currentUser.id,
    });

    const updated = await this.positionRepo.save(position);

    return {
      message: await this.i18n.translate('position.updated_success', lang, {
        name: updated.name,
      }),
      data: updated,
    };
  }

  // ============================================================
  // 🗑️ SUPPRIMER
  // ============================================================
  async remove(
    id: string,
    currentUser: UserEntity,
    lang: string = 'fr',
  ): Promise<{ message: string }> {
    const position = await this.positionRepo.findOne({ where: { id } });
    if (!position) {
      throw new NotFoundException(
        await this.i18n.translate('position.not_found', lang, { id }),
      );
    }

    await this.positionRepo.remove(position);

    return {
      message: await this.i18n.translate('position.deleted_success', lang, {
        name: position.name,
      }),
    };
  }

  // ============================================================
  // 🔄 TOGGLE STATUS
  // ============================================================
  async toggleStatus(
    id: string,
    lang: string = 'fr',
  ): Promise<{ message: string; data: PositionEntity }> {
    const position = await this.positionRepo.findOne({ where: { id } });
    if (!position) {
      throw new NotFoundException(
        await this.i18n.translate('position.not_found', lang, { id }),
      );
    }

    position.status =
      position.status === PositionStatus.ACTIVE
        ? PositionStatus.INACTIVE
        : PositionStatus.ACTIVE;

    const updated = await this.positionRepo.save(position);

    return {
      message: await this.i18n.translate('position.status_updated', lang, {
        status: updated.status,
      }),
      data: updated,
    };
  }
}