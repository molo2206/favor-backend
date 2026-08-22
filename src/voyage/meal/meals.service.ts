// src/voyage/meals/meals.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateMealDto } from './dto/create-meal.dto';
import { UpdateMealDto } from './dto/update-meal.dto';
import { UserEntity } from 'src/users/entities/user.entity';
import { Meal } from './entity/meal.entity';

@Injectable()
export class MealsService {
    constructor(
        @InjectRepository(Meal)
        private mealRepository: Repository<Meal>,
    ) { }

    async create(createMealDto: CreateMealDto, user: UserEntity): Promise<{ message: string; data: Meal }> {
        if (!user.activeCompanyId) {
            throw new BadRequestException('Aucune entreprise active trouvée');
        }
        const meal = this.mealRepository.create({
            ...createMealDto,
            companyId: user.activeCompanyId,
        });
        const saved = await this.mealRepository.save(meal);
        return {
            message: 'Repas créé avec succès',
            data: saved,
        };
    }

    async findAll(
        user: UserEntity,
        page: number = 1,
        limit: number = 10,
        isAvailable?: boolean,
    ): Promise<{
        message: string;
        data: { data: Meal[]; total: number; page: number; limit: number };
    }> {
        if (!user.activeCompanyId) {
            throw new BadRequestException('Aucune entreprise active trouvée');
        }
        const skip = (page - 1) * limit;
        const queryBuilder = this.mealRepository
            .createQueryBuilder('meal')
            .where('meal.companyId = :companyId', { companyId: user.activeCompanyId });

        if (isAvailable !== undefined) {
            queryBuilder.andWhere('meal.isAvailable = :isAvailable', { isAvailable });
        }
        const [data, total] = await queryBuilder
            .orderBy('meal.createdAt', 'DESC')
            .skip(skip)
            .take(limit)
            .getManyAndCount();

        return {
            message: 'Liste des repas',
            data: {
                data,
                total,
                page,
                limit,
            },
        };
    }

    async findOne(id: string, user: UserEntity): Promise<{ message: string; data: Meal }> {
        const meal = await this.mealRepository.findOne({
            where: { id, companyId: user.activeCompanyId },
        });
        if (!meal) {
            throw new NotFoundException(`Repas ${id} non trouvé`);
        }
        return {
            message: 'Repas trouvé',
            data: meal,
        };
    }

    async update(id: string, updateMealDto: UpdateMealDto, user: UserEntity): Promise<{ message: string; data: Meal }> {
        const { data: meal } = await this.findOne(id, user);
        Object.assign(meal, updateMealDto);
        const updated = await this.mealRepository.save(meal);
        return {
            message: 'Repas mis à jour avec succès',
            data: updated,
        };
    }

    async remove(id: string, user: UserEntity): Promise<{ message: string }> {
        await this.findOne(id, user);
        await this.mealRepository.delete(id);
        return {
            message: 'Repas supprimé avec succès',
        };
    }
}