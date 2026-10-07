// src/voyage/meals/meals.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MealsService } from './meals.service';
import { MealsController } from './meals.controller';
import { CompanyEntity } from 'src/company/entities/company.entity';
import { Meal } from './entity/meal.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Meal, CompanyEntity])],
    controllers: [MealsController],
    providers: [MealsService],
    exports: [MealsService],
})
export class MealsModule { }