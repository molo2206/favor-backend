import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeEntity } from './entities/employee.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { I18nService } from 'src/libs/common/src';
import { PaginatedResponseDto } from 'src/products/dto/paginated-response.dto';
import { UserEntity } from 'src/users/entities/user.entity';
import { DepartmentEntity } from '../departments/entities/department.entity';
import { instanceToPlain } from 'class-transformer';
import { FilesService } from 'src/files/files.service';
import { EmployeeStatus } from '../common/enums/employee-status.enum';

@Injectable()
export class EmployeesService {
    constructor(
        @InjectRepository(EmployeeEntity)
        private readonly employeeRepo: Repository<EmployeeEntity>,

        @InjectRepository(DepartmentEntity)
        private readonly departmentRepo: Repository<DepartmentEntity>,

        private readonly i18nService: I18nService,
        private readonly filesService: FilesService,
    ) { }

    // ============================================================
    // ➕ CREATE
    // ============================================================
    async create(
        dto: CreateEmployeeDto,
        user: UserEntity,
        lang: string = 'fr',
        file?: Express.Multer.File,
    ): Promise<{ message: string; data: EmployeeEntity }> {
        // 🔍 Vérifications
        if (!dto.fullName || dto.fullName.trim() === '') {
            throw new BadRequestException(
                await this.i18nService.translate('employee.full_name_required', lang),
            );
        }

        // ============================================================
        // ⚠️ SUPPRIMÉ : vérification doublon email
        //    → email n'est plus unique
        // ============================================================

        // ============================================================
        // ✅ Vérifier unicité du fingerprint si fourni
        // ============================================================
        if (dto.fingerprint && dto.fingerprint.trim() !== '') {
            const fpExists = await this.employeeRepo.findOne({
                where: { fingerprint: dto.fingerprint.trim() },
                select: ['id'],
            });
            if (fpExists) {
                throw new BadRequestException(
                    await this.i18nService.translate(
                        'employee.fingerprint_already_used',
                        lang,
                    ),
                );
            }
        }

        // ============================================================
        // ✅ NOUVEAU : vérifier si un employé existe déjà avec ce userId
        //    (contrainte unique : uq_hr_employees_user)
        // ============================================================
        if (dto.userId) {
            const existingEmployee = await this.employeeRepo.findOne({
                where: { userId: dto.userId },
                select: ['id', 'fullName'],
            });

            if (existingEmployee) {
                throw new BadRequestException(
                    await this.i18nService.translate(
                        'employee.user_already_linked',
                        lang,
                        {
                            name: existingEmployee.fullName,
                        },
                    ),
                );
            }
        }

        // 🔹 Résoudre companyId
        let resolvedCompanyId: string | undefined = user.activeCompanyId;

        if (dto.departmentId) {
            const dept = await this.departmentRepo.findOne({
                where: { id: dto.departmentId },
            });
            if (!dept) {
                throw new NotFoundException(
                    await this.i18nService.translate(
                        'employee.department_not_found',
                        lang,
                        { id: dto.departmentId },
                    ),
                );
            }
            if (
                user.activeCompanyId &&
                dept.companyId &&
                dept.companyId !== user.activeCompanyId
            ) {
                throw new BadRequestException(
                    await this.i18nService.translate(
                        'employee.department_company_mismatch',
                        lang,
                        {
                            departmentCompanyId: dept.companyId,
                            userCompanyId: user.activeCompanyId,
                        },
                    ),
                );
            }
            if (dept.companyId) {
                resolvedCompanyId = dept.companyId;
            }
        }

        if (dto.userId) {
            const userExists = await this.employeeRepo.manager.findOne('users', {
                where: { id: dto.userId },
            });
            if (!userExists) {
                throw new NotFoundException(
                    await this.i18nService.translate(
                        'employee.user_not_found',
                        lang,
                        { id: dto.userId },
                    ),
                );
            }
        }

        // ============================================================
        // ✅ UPLOAD DE L'IMAGE (optionnel)
        // ============================================================
        let uploadedImageUrl: string | undefined;

        if (file) {
            try {
                const uploadedFile = await this.filesService.uploadFile(
                    file,
                    'employee',
                    'avatar',
                );
                uploadedImageUrl = uploadedFile.data;
                console.log(`✅ [create-employee] Image uploadée : ${uploadedImageUrl}`);
            } catch (err: any) {
                console.error('❌ [create-employee] Erreur upload image :', err.message);
                throw new BadRequestException(
                    await this.i18nService.translate('employee.image_upload_failed', lang),
                );
            }
        }

        // ============================================================
        // 🔨 Création
        // ============================================================
        const employee = this.employeeRepo.create({
            fullName: dto.fullName.trim(),
            // ✅ email et phone : libres, pas de contrainte unique
            email: dto.email ? dto.email.toLowerCase().trim() : undefined,
            phone: dto.phone ? dto.phone.trim() : undefined,
            address: dto.address?.trim() || undefined,
            position: dto.position?.trim() || undefined,
            hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined,

            status: dto.status ?? EmployeeStatus.ACTIVE,

            baseSalary: dto.baseSalary,
            currency: dto.currency,

            departmentId: dto.departmentId,
            branchId: dto.branchId,
            userId: dto.userId,

            companyId: resolvedCompanyId,

            image: uploadedImageUrl ?? dto.image?.trim() ?? undefined,

            fingerprint: dto.fingerprint?.trim() || undefined,
        } as Partial<EmployeeEntity>);

        const saved = await this.employeeRepo.save(employee);

        return {
            message: await this.i18nService.translate(
                'employee.created_success',
                lang,
                { name: saved.fullName },
            ),
            data: saved,
        };
    }
    // ============================================================
    // 📋 FIND ALL
    // ============================================================
    async findAll(
        user: UserEntity,
        filters: {
            branchId?: string;
            departmentId?: string;
            status?: string;
            search?: string;
            page?: number;
            limit?: number;
        },
        lang: string = 'fr',
    ): Promise<{
        message: string;
        data: PaginatedResponseDto<EmployeeEntity>;
    }> {
        // ============================================================
        // 1️⃣ Pagination sécurisée
        // ============================================================
        const safePage = Math.max(1, Number(filters.page) || 1);
        const safeLimit = Math.min(
            Math.max(1, Number(filters.limit) || 20),
            100,
        );
        const skip = (safePage - 1) * safeLimit;

        // ============================================================
        // 2️⃣ companyId depuis le user connecté
        // ============================================================
        const companyId = user.activeCompanyId;

        // ============================================================
        // 3️⃣ Query builder
        // ============================================================
        const qb = this.employeeRepo
            .createQueryBuilder('e')
            .leftJoinAndSelect('e.department', 'department')
            .leftJoinAndSelect('e.company', 'company')
            .leftJoinAndSelect('e.branch', 'branch')
            .leftJoinAndSelect('e.user', 'user')
            .leftJoinAndSelect('user.activeCompany', 'activeCompany')
            .orderBy('e.createdAt', 'DESC');

        // ============================================================
        // 4️⃣ Filtres
        // ============================================================
        if (companyId) {
            qb.andWhere('e.companyId = :companyId', { companyId });
        }

        if (filters.branchId?.trim()) {
            qb.andWhere('e.branchId = :branchId', {
                branchId: filters.branchId.trim(),
            });
        }

        if (filters.departmentId?.trim()) {
            qb.andWhere('e.departmentId = :departmentId', {
                departmentId: filters.departmentId.trim(),
            });
        }

        if (filters.status?.trim()) {
            qb.andWhere('e.status = :status', { status: filters.status.trim() });
        }

        if (filters.search?.trim()) {
            const s = `%${filters.search.trim()}%`;
            qb.andWhere(
                `(
                LOWER(e.fullName) LIKE LOWER(:s)
                OR LOWER(e.email) LIKE LOWER(:s)
                OR REPLACE(REPLACE(e.phone, ' ', ''), '+', '')
                   LIKE REPLACE(REPLACE(:s, ' ', ''), '+', '')
            )`,
                { s },
            );
        }

        // ============================================================
        // 5️⃣ Pagination
        // ============================================================
        qb.skip(skip).take(safeLimit);

        // ============================================================
        // 6️⃣ Exécution
        // ============================================================
        const [employees, total] = await qb.getManyAndCount();

        // ============================================================
        // 7️⃣ Exposition activeCompanyId au niveau de l'employé
        // ============================================================
        const employeesWithCompany = employees.map((emp: any) => ({
            ...emp,
            activeCompanyId: emp.user?.activeCompanyId ?? null,
            activeCompany: emp.user?.activeCompany ?? null,
        }));

        // ============================================================
        // 8️⃣ Retour
        // ============================================================
        const paginated = new PaginatedResponseDto(
            employeesWithCompany,
            total,
            safePage,
            safeLimit,
        );

        return {
            message:
                total > 0
                    ? await this.i18nService.translate('employee.list_retrieved', lang)
                    : await this.i18nService.translate('employee.not_found', lang),
            data: paginated,
        };
    }
    // ============================================================
    // 🔍 FIND ONE
    // ============================================================
    async findOne(
        id: string,
        lang: string = 'fr',
    ): Promise<{ message: string; data: EmployeeEntity }> {
        const employee = await this.employeeRepo.findOne({
            where: { id },
            relations: [
                'department',
                'company',
                'branch',
                'user',
                'user.activeCompany',
            ],
        });

        if (!employee) {
            throw new NotFoundException(
                await this.i18nService.translate(
                    'employee.not_found_by_id',
                    lang,
                    { id },
                ),
            );
        }

        // 🔥 Exposer activeCompanyId au niveau de l'employé
        const data: any = {
            ...employee,
            activeCompanyId: (employee as any).user?.activeCompanyId ?? null,
            activeCompany: (employee as any).user?.activeCompany ?? null,
        };

        return {
            message: await this.i18nService.translate(
                'employee.found_success',
                lang,
                { name: employee.fullName },
            ),
            data,
        };
    }

    // ============================================================
    // ✏️ UPDATE
    // ============================================================
    // ============================================================
    // ✏️ UPDATE
    // ============================================================
    async update(
        id: string,
        dto: UpdateEmployeeDto,
        user: UserEntity,
        lang: string = 'fr',
    ): Promise<{ message: string; data: EmployeeEntity }> {
        const { data: employee } = await this.findOne(id, lang);

        // 🔍 Vérifications
        if (dto.fullName !== undefined && dto.fullName.trim() === '') {
            throw new BadRequestException(
                await this.i18nService.translate('employee.full_name_required', lang),
            );
        }

        // ============================================================
        // ⚠️ SUPPRIMÉ : vérification doublon email
        //    → email n'est plus unique (cohérent avec create())
        // ============================================================

        // 🔹 Résoudre companyId : priorité au département, sinon user connecté
        let resolvedCompanyId: string | undefined = user.activeCompanyId;

        if (dto.departmentId) {
            const dept = await this.departmentRepo.findOne({
                where: { id: dto.departmentId },
            });
            if (!dept) {
                throw new NotFoundException(
                    await this.i18nService.translate(
                        'employee.department_not_found',
                        lang,
                        { id: dto.departmentId },
                    ),
                );
            }
            if (
                user.activeCompanyId &&
                dept.companyId &&
                dept.companyId !== user.activeCompanyId
            ) {
                throw new BadRequestException(
                    await this.i18nService.translate(
                        'employee.department_company_mismatch',
                        lang,
                        {
                            departmentCompanyId: dept.companyId,
                            userCompanyId: user.activeCompanyId,
                        },
                    ),
                );
            }
            if (dept.companyId) {
                resolvedCompanyId = dept.companyId;
            }
        }

        if (dto.userId) {
            const userExists = await this.employeeRepo.manager.findOne('users', {
                where: { id: dto.userId },
            });
            if (!userExists) {
                throw new NotFoundException(
                    await this.i18nService.translate(
                        'employee.user_not_found',
                        lang,
                        { id: dto.userId },
                    ),
                );
            }
        }

        // 🔨 Appliquer
        Object.assign(employee, {
            ...dto,
            ...(resolvedCompanyId && { companyId: resolvedCompanyId }),
            ...(dto.fullName && { fullName: dto.fullName.trim() }),
            ...(dto.email && { email: dto.email.toLowerCase().trim() }),
            ...(dto.phone && { phone: dto.phone.trim() }),
            ...(dto.hireDate && { hireDate: new Date(dto.hireDate) }),
        });

        const saved = await this.employeeRepo.save(employee);

        return {
            message: await this.i18nService.translate(
                'employee.updated_success',
                lang,
                { name: saved.fullName },
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
        const { data: employee } = await this.findOne(id, lang);

        // 🔒 Sécurité : l'employé doit appartenir à la company du user
        if (
            user.activeCompanyId &&
            employee.companyId &&
            employee.companyId !== user.activeCompanyId
        ) {
            throw new NotFoundException(
                await this.i18nService.translate(
                    'employee.not_found_by_id',
                    lang,
                    { id },
                ),
            );
        }

        await this.employeeRepo.remove(employee);

        return {
            message: await this.i18nService.translate(
                'employee.deleted_success',
                lang,
                { name: employee.fullName },
            ),
            data: { id },
        };
    }

    // ============================================================
    // 🖼️ MODIFIER LA PHOTO D'UN EMPLOYÉ
    // (même logique que UsersService.updateProfileImage)
    // ============================================================
    async updateEmployeeImage(
        employeeId: string,
        user: UserEntity,
        lang: string = 'fr',
        file?: Express.Multer.File,     // ✅ en dernier
    ): Promise<{ message: string; data: any }> {
        // ============================================================
        // 1️⃣ Récupérer l'employé
        // ============================================================
        let employee = await this.employeeRepo.findOne({
            where: { id: employeeId },
            relations: [
                'department',
                'company',
                'branch',
                'user',
                'user.activeCompany',
            ],
        });

        if (!employee) {
            throw new NotFoundException(
                await this.i18nService.translate(
                    'employee.not_found_by_id',
                    lang,
                    { id: employeeId },
                ),
            );
        }

        // ============================================================
        // 2️⃣ Sécurité multi-tenant
        // ============================================================
        if (
            user.activeCompanyId &&
            employee.companyId &&
            employee.companyId !== user.activeCompanyId
        ) {
            throw new NotFoundException(
                await this.i18nService.translate(
                    'employee.not_found_by_id',
                    lang,
                    { id: employeeId },
                ),
            );
        }

        // ============================================================
        // 3️⃣ Vérifier le fichier
        // ============================================================
        if (!file) {
            throw new BadRequestException(
                await this.i18nService.translate('employee.invalid_image', lang),
            );
        }

        // ============================================================
        // 4️⃣ Supprimer l'ancienne image si elle existe
        // ============================================================
        if (employee.image && employee.image.includes('/uploads/')) {
            try {
                const filename = employee.image.split('/').pop()!;
                await this.filesService.deleteFile('employee', filename);
            } catch (err: any) {
                console.warn('⚠️ Échec suppression ancienne image :', err.message);
            }
        }

        // ============================================================
        // 5️⃣ Uploader la nouvelle image
        // ============================================================
        const uploadedFile = await this.filesService.uploadFile(
            file,
            'employee',
            'avatar',
        );
        employee.image = uploadedFile.data;
        const updatedEmployee = await this.employeeRepo.save(employee);

        // ============================================================
        // 6️⃣ Retour
        // ============================================================
        return {
            message: await this.i18nService.translate(
                'employee.image_updated_success',
                lang,
                { name: updatedEmployee.fullName },
            ),
            data: instanceToPlain({
                id: updatedEmployee.id,
                fullName: updatedEmployee.fullName,
                email: updatedEmployee.email,
                phone: updatedEmployee.phone,
                address: updatedEmployee.address,
                position: updatedEmployee.position,
                hireDate: updatedEmployee.hireDate,
                status: updatedEmployee.status,
                baseSalary: updatedEmployee.baseSalary,
                currency: updatedEmployee.currency,
                image: updatedEmployee.image,
                fingerprint: updatedEmployee.fingerprint,
                departmentId: updatedEmployee.departmentId,
                companyId: updatedEmployee.companyId,
                branchId: updatedEmployee.branchId,
                userId: updatedEmployee.userId,
                department: updatedEmployee.department ?? null,
                company: updatedEmployee.company ?? null,
                branch: updatedEmployee.branch ?? null,
                user: updatedEmployee.user
                    ? {
                        id: updatedEmployee.user.id,
                        fullName: updatedEmployee.user.fullName,
                        email: updatedEmployee.user.email,
                        phone: updatedEmployee.user.phone,
                        activeCompanyId: updatedEmployee.user.activeCompanyId ?? null,
                        activeCompany: updatedEmployee.user.activeCompany ?? null,
                    }
                    : null,
                createdAt: updatedEmployee.createdAt,
                updatedAt: updatedEmployee.updatedAt,
            }),
        };
    }
}