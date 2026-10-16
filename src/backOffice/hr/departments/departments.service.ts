import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DepartmentEntity } from './entities/department.entity';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { I18nService } from 'src/libs/common/src';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { UserEntity } from 'src/users/entities/user.entity';

@Injectable()
export class DepartmentsService {
    constructor(
        @InjectRepository(DepartmentEntity)
        private readonly deptRepo: Repository<DepartmentEntity>,
        private readonly i18nService: I18nService,
    ) { }

    // ============================================================
    // ➕ CREATE
    // ============================================================
    async create(
        dto: CreateDepartmentDto,
        user: UserEntity,
        lang: string = 'fr',
    ): Promise<{ message: string; data: DepartmentEntity }> {
        // 🔍 Vérifications
        if (!dto.name || dto.name.trim() === '') {
            throw new BadRequestException(
                await this.i18nService.translate('department.name_required', lang),
            );
        }

        if (dto.companyId) {
            const exists = await this.deptRepo.findOne({
                where: {
                    name: dto.name.trim(),
                    companyId: dto.companyId,
                },
            });
            if (exists) {
                throw new BadRequestException(
                    await this.i18nService.translate(
                        'department.name_already_exists',
                        lang,
                        { name: dto.name },
                    ),
                );
            }
        }

        if (dto.managerId) {
            const managerExists = await this.deptRepo.manager.findOne('users', {
                where: { id: dto.managerId },
            });
            if (!managerExists) {
                throw new NotFoundException(
                    await this.i18nService.translate(
                        'department.manager_not_found',
                        lang,
                        { id: dto.managerId },
                    ),
                );
            }
        }

        if (dto.parentDepartmentId) {
            const parentExists = await this.deptRepo.findOne({
                where: { id: dto.parentDepartmentId },
            });
            if (!parentExists) {
                throw new NotFoundException(
                    await this.i18nService.translate(
                        'department.parent_not_found',
                        lang,
                        { id: dto.parentDepartmentId },
                    ),
                );
            }
        }

        // 🔨 Création
        const dept = this.deptRepo.create({
            ...dto,
            name: dto.name.trim(),
            // createdById: user.id,   // ⬅️ décommenter si votre entité a ce champ
        });

        const saved = await this.deptRepo.save(dept);

        return {
            message: await this.i18nService.translate(
                'department.created_success',
                lang,
                { name: saved.name },
            ),
            data: saved,
        };
    }

    // ============================================================
    // 📋 FIND ALL (avec pagination + search)
    // ============================================================
    async findAll(
        companyId?: string,
        search?: string,
        page: number = 1,
        limit: number = 10,
        lang: string = 'fr',
    ): Promise<{
        message: string;
        data: PaginatedResponseDto<DepartmentEntity>;
    }> {
        const safePage = page > 0 ? page : 1;
        const safeLimit = limit > 0 ? Math.min(limit, 100) : 10;

        const qb = this.deptRepo
            .createQueryBuilder('d')
            .leftJoinAndSelect('d.manager', 'manager')
            .leftJoinAndSelect('d.parentDepartment', 'parentDepartment')
            .leftJoinAndSelect('d.company', 'company')
            .orderBy('d.createdAt', 'DESC');

        // 🔍 Filtres
        if (companyId) {
            qb.andWhere('d.companyId = :companyId', { companyId });
        }

        if (search && search.trim() !== '') {
            qb.andWhere(
                '(LOWER(d.name) LIKE LOWER(:search) OR LOWER(d.description) LIKE LOWER(:search))',
                { search: `%${search.trim()}%` },
            );
        }

        // 📄 Pagination
        qb.skip((safePage - 1) * safeLimit).take(safeLimit);

        const [departments, total] = await qb.getManyAndCount();

        const paginated = new PaginatedResponseDto(
            departments,
            total,
            safePage,
            safeLimit,
        );

        return {
            message:
                total > 0
                    ? await this.i18nService.translate('department.list_retrieved', lang)
                    : await this.i18nService.translate('department.not_found', lang),
            data: paginated,
        };
    }

    // ============================================================
    // 🔍 FIND ONE
    // ============================================================
    async findOne(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: DepartmentEntity }> {
        const dept = await this.deptRepo.findOne({
            where: { id },
            relations: ['manager', 'parentDepartment', 'company'],
        });

        if (!dept) {
            throw new NotFoundException(
                await this.i18nService.translate(
                    'department.not_found_by_id',
                    lang,
                    { id },
                ),
            );
        }

        return {
            message: await this.i18nService.translate(
                'department.found_success',
                lang,
                { name: dept.name },
            ),
            data: dept,
        };
    }

    // ============================================================
    // ✏️ UPDATE
    // ============================================================
    async update(
        id: string,
        dto: UpdateDepartmentDto,
        user: UserEntity,
        lang: string = 'fr',
    ): Promise<{ message: string; data: DepartmentEntity }> {
        const { data: dept } = await this.findOne(id, lang);

        // 🔍 Vérifications
        if (dto.name !== undefined && dto.name.trim() === '') {
            throw new BadRequestException(
                await this.i18nService.translate('department.name_required', lang),
            );
        }

        if (dto.name && dto.name.trim() !== dept.name && dept.companyId) {
            const exists = await this.deptRepo.findOne({
                where: {
                    name: dto.name.trim(),
                    companyId: dept.companyId,
                },
            });
            if (exists && exists.id !== id) {
                throw new BadRequestException(
                    await this.i18nService.translate(
                        'department.name_already_exists',
                        lang,
                        { name: dto.name },
                    ),
                );
            }
        }

        if (dto.managerId) {
            const managerExists = await this.deptRepo.manager.findOne('users', {
                where: { id: dto.managerId },
            });
            if (!managerExists) {
                throw new NotFoundException(
                    await this.i18nService.translate(
                        'department.manager_not_found',
                        lang,
                        { id: dto.managerId },
                    ),
                );
            }
        }

        if (dto.parentDepartmentId) {
            if (dto.parentDepartmentId === id) {
                throw new BadRequestException(
                    await this.i18nService.translate(
                        'department.parent_cannot_be_self',
                        lang,
                    ),
                );
            }
            const parentExists = await this.deptRepo.findOne({
                where: { id: dto.parentDepartmentId },
            });
            if (!parentExists) {
                throw new NotFoundException(
                    await this.i18nService.translate(
                        'department.parent_not_found',
                        lang,
                        { id: dto.parentDepartmentId },
                    ),
                );
            }
        }

        // 🔨 Appliquer les changements
        if (dto.name) dto.name = dto.name.trim();
        Object.assign(dept, dto);
        // dept.updatedById = user.id;   // ⬅️ décommenter si applicable

        const saved = await this.deptRepo.save(dept);

        return {
            message: await this.i18nService.translate(
                'department.updated_success',
                lang,
                { name: saved.name },
            ),
            data: saved,
        };
    }

    // ============================================================
    // 👤 ASSIGN MANAGER
    // ============================================================
    async assign(
        id: string,
        managerId: string,
        user: UserEntity,
        lang: string = 'fr',
    ): Promise<{ message: string; data: DepartmentEntity }> {
        const { data: dept } = await this.findOne(id, lang);

        const managerExists = await this.deptRepo.manager.findOne('users', {
            where: { id: managerId },
        });
        if (!managerExists) {
            throw new NotFoundException(
                await this.i18nService.translate(
                    'department.manager_not_found',
                    lang,
                    { id: managerId },
                ),
            );
        }

        dept.managerId = managerId;
        const saved = await this.deptRepo.save(dept);

        return {
            message: await this.i18nService.translate(
                'department.assigned_success',
                lang,
                {
                    name: saved.name,
                    managerName: managerExists.id ?? 'N/A',
                },
            ),
            data: saved,
        };
    }

    // ============================================================
    // 🗑️ REMOVE
    // ============================================================
    async remove(
        id: string,
        user: UserEntity,
        lang: string = 'fr',
    ): Promise<{ message: string; data: { id: string } }> {
        const { data: dept } = await this.findOne(id, lang);

        // 🔍 Bloquer la suppression s'il y a des sous-départements
        const children = await this.deptRepo.count({
            where: { parentDepartmentId: id },
        });
        if (children > 0) {
            throw new BadRequestException(
                await this.i18nService.translate(
                    'department.cannot_delete_has_children',
                    lang,
                    { count: children },
                ),
            );
        }

        await this.deptRepo.remove(dept);

        return {
            message: await this.i18nService.translate(
                'department.deleted_success',
                lang,
                { name: dept.name },
            ),
            data: { id },
        };
    }
}