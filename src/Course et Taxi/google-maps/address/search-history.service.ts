// search-history.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchHistory } from './entity/search-history.entity';
@Injectable()
export class SearchHistoryService {
  private readonly logger = new Logger(SearchHistoryService.name);

  constructor(
    @InjectRepository(SearchHistory)
    private searchHistoryRepository: Repository<SearchHistory>,
  ) {}

  async saveOrUpdateSearch(searchTerm: string, selectedAddress?: string, placeId?: string): Promise<SearchHistory> {
    try {
      let search = await this.searchHistoryRepository.findOne({
        where: { search_term: searchTerm.toLowerCase() },
      });

      if (search) {
        search.search_count += 1;
        search.last_searched_at = new Date();
        if (selectedAddress) search.selected_address = selectedAddress;
        if (placeId) search.place_id = placeId;
      } else {
        search = this.searchHistoryRepository.create({
          search_term: searchTerm.toLowerCase(),
          selected_address: selectedAddress,
          place_id: placeId,
          search_count: 1,
          first_searched_at: new Date(),
          last_searched_at: new Date(),
        });
      }

      return await this.searchHistoryRepository.save(search);
    } catch (error) {
      this.logger.error(`Failed to save search history: ${error.message}`);
      throw error;
    }
  }

  async getPopularSearches(limit: number = 10): Promise<SearchHistory[]> {
    return await this.searchHistoryRepository.find({
      order: { search_count: 'DESC' },
      take: limit,
    });
  }
}