// src/products/image-search/image-search.module.ts
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductSearchEmbedding } from './product-search-embedding.entity';
import { ImageSearchService } from './image-search.service';
import { ImageSearchController } from './image-search.controller';

/** ✅ Recherche par image (produits + images produits) — module global */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ProductSearchEmbedding])],
  controllers: [ImageSearchController],
  providers: [ImageSearchService],
  exports: [ImageSearchService],
})
export class ImageSearchModule {}
