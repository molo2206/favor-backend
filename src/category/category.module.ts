import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';
import { CategoryEntity } from './entities/category.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CategoryEntity])], // 👈 Importation de l'entité
  controllers: [CategoryController],
  providers: [CategoryService],
  exports: [CategoryService], // 👈 Optionnel si tu veux utiliser ce service ailleurs
})
export class CategoryModule {}
