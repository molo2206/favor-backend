// src/modules/search-history/search-history.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchHistoryService } from './search-history.service';
import { SearchHistory } from './entity/search-history.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SearchHistory])],
  providers: [SearchHistoryService],
  exports: [SearchHistoryService], // Important: exporter pour que d'autres modules puissent l'utiliser
})
export class SearchHistoryModule {}