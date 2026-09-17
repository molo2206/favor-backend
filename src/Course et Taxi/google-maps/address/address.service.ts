import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Address } from './entity/address.entity';
import { Distance } from './entity/distance.entity';
import { Direction } from './entity/direction.entity';

@Injectable()
export class AddressService {
  private readonly logger = new Logger(AddressService.name);

  constructor(
    @InjectRepository(Address)
    private addressRepository: Repository<Address>,
    @InjectRepository(Distance)
    private distanceRepository: Repository<Distance>,
    @InjectRepository(Direction)
    private directionRepository: Repository<Direction>,
  ) {}

  async saveOrUpdateAddress(addressData: Partial<Address>): Promise<Address> {
    try {
      // Vérifier si l'adresse existe déjà avec ces coordonnées ou place_id
      let address = await this.addressRepository.findOne({
        where: [
          { latitude: addressData.latitude, longitude: addressData.longitude },
          { place_id: addressData.place_id },
        ],
      });

      if (address) {
        // Mettre à jour l'existante
        this.logger.log(
          `Updating existing address for (${addressData.latitude}, ${addressData.longitude})`,
        );

        // Fusionner les données existantes avec les nouvelles
        const updatedAddress = {
          ...address,
          ...addressData,
          id: address.id, // Garder l'ID original
          request_count: address.request_count + 1,
          last_request_at: new Date(),
          // Ne pas écraser created_at
          created_at: address.created_at,
        };

        return await this.addressRepository.save(updatedAddress);
      } else {
        // Créer une nouvelle entrée avec UUID automatique
        this.logger.log(
          `Creating new address for (${addressData.latitude}, ${addressData.longitude})`,
        );

        // Normaliser les champs de recherche
        const normalizedData = {
          ...addressData,
          normalized_name: addressData.name?.toLowerCase(),
          normalized_city: addressData.locality?.toLowerCase(),
          request_count: 1,
          last_request_at: new Date(),
        };

        const newAddress = this.addressRepository.create(normalizedData);
        return await this.addressRepository.save(newAddress);
      }
    } catch (error) {
      this.logger.error(
        `Failed to save address: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async findByCoordinates(
    latitude: number,
    longitude: number,
  ): Promise<Address | null> {
    return await this.addressRepository.findOne({
      where: { latitude, longitude },
    });
  }

  async findById(id: string): Promise<Address | null> {
    return await this.addressRepository.findOne({
      where: { id },
    });
  }

  async findByPlaceId(placeId: string): Promise<Address | null> {
    return await this.addressRepository.findOne({
      where: { place_id: placeId },
    });
  }

  async incrementRequestCount(id: string): Promise<void> {
    await this.addressRepository.increment({ id }, 'request_count', 1);
    await this.addressRepository.update(id, { last_request_at: new Date() });
  }

  async findMostRequested(limit: number = 10): Promise<Address[]> {
    return await this.addressRepository.find({
      order: { request_count: 'DESC' },
      take: limit,
    });
  }

  async findByCountry(country: string, limit: number = 50): Promise<Address[]> {
    return await this.addressRepository.find({
      where: { country },
      order: { request_count: 'DESC' },
      take: limit,
    });
  }

  async getStatistics() {
    const total = await this.addressRepository.count();
    const uniqueLocations = await this.addressRepository
      .createQueryBuilder('address')
      .select(
        'COUNT(DISTINCT CONCAT(address.latitude, ",", address.longitude))',
        'count',
      )
      .getRawOne();

    const topCountries = await this.addressRepository
      .createQueryBuilder('address')
      .select('address.country', 'country')
      .addSelect('COUNT(*)', 'count')
      .where('address.country IS NOT NULL')
      .groupBy('address.country')
      .orderBy('count', 'DESC')
      .limit(5)
      .getRawMany();

    const topRated = await this.addressRepository
      .createQueryBuilder('address')
      .select(['address.name', 'address.rating', 'address.user_ratings_total'])
      .where('address.rating IS NOT NULL')
      .orderBy('address.rating', 'DESC')
      .addOrderBy('address.user_ratings_total', 'DESC')
      .limit(10)
      .getMany();

    return {
      total_requests: total,
      unique_locations: parseInt(uniqueLocations.count),
      top_countries: topCountries,
      top_rated: topRated,
    };
  }

  async deleteOldAddresses(daysOld: number = 365): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.addressRepository
      .createQueryBuilder()
      .delete()
      .where('last_request_at < :cutoffDate', { cutoffDate })
      .andWhere('request_count < 5') // Garder les adresses populaires même si anciennes
      .execute();

    return result.affected || 0;
  }

  async searchAddressesByInput(
    searchTerm: string,
    limit: number = 5,
  ): Promise<Address[]> {
    if (!searchTerm || searchTerm.trim().length < 3) {
      return [];
    }

    try {
      const searchPattern = `%${searchTerm.trim().toLowerCase()}%`;

      // Recherche dans les champs pertinents avec les nouveaux champs
      const results = await this.addressRepository
        .createQueryBuilder('address')
        .where('LOWER(address.formatted_address) LIKE :search', {
          search: searchPattern,
        })
        .orWhere('LOWER(address.locality) LIKE :search', {
          search: searchPattern,
        })
        .orWhere('LOWER(address.route) LIKE :search', { search: searchPattern })
        .orWhere('LOWER(address.country) LIKE :search', {
          search: searchPattern,
        })
        .orWhere('LOWER(address.name) LIKE :search', { search: searchPattern })
        .orWhere('LOWER(address.normalized_name) LIKE :search', {
          search: searchPattern,
        })
        .orWhere('LOWER(address.normalized_city) LIKE :search', {
          search: searchPattern,
        })
        .orWhere('LOWER(address.neighborhood) LIKE :search', {
          search: searchPattern,
        })
        .orWhere('LOWER(address.sublocality) LIKE :search', {
          search: searchPattern,
        })
        .orderBy('address.request_count', 'DESC') // Les plus populaires d'abord
        .addOrderBy('address.rating', 'DESC') // Les mieux notés ensuite
        .addOrderBy('address.last_request_at', 'DESC') // Les plus récents ensuite
        .take(limit)
        .getMany();

      this.logger.log(
        `Found ${results.length} addresses matching "${searchTerm}" in database`,
      );
      return results;
    } catch (error) {
      this.logger.error(`Error searching addresses: ${error.message}`);
      return [];
    }
  }

  async searchAddressesByPlaceId(placeId: string): Promise<Address | null> {
    return await this.addressRepository.findOne({
      where: { place_id: placeId },
    });
  }

  async advancedSearch(options: {
    query?: string;
    country?: string;
    city?: string;
    minRating?: number;
    businessStatus?: string;
    type?: string;
    limit?: number;
  }): Promise<Address[]> {
    const queryBuilder = this.addressRepository.createQueryBuilder('address');

    if (options.query) {
      const searchPattern = `%${options.query.toLowerCase()}%`;
      queryBuilder.andWhere(
        '(LOWER(address.formatted_address) LIKE :query OR LOWER(address.name) LIKE :query OR LOWER(address.normalized_name) LIKE :query)',
        { query: searchPattern },
      );
    }

    if (options.country) {
      queryBuilder.andWhere('address.country = :country', {
        country: options.country,
      });
    }

    if (options.city) {
      queryBuilder.andWhere('address.locality = :city', { city: options.city });
    }

    if (options.minRating) {
      queryBuilder.andWhere('address.rating >= :minRating', {
        minRating: options.minRating,
      });
    }

    if (options.businessStatus) {
      queryBuilder.andWhere('address.business_status = :businessStatus', {
        businessStatus: options.businessStatus,
      });
    }

    if (options.type && options.type !== 'all') {
      queryBuilder.andWhere('address.types LIKE :type', {
        type: `%${options.type}%`,
      });
    }

    queryBuilder
      .orderBy('address.request_count', 'DESC')
      .addOrderBy('address.rating', 'DESC')
      .take(options.limit || 20);

    return await queryBuilder.getMany();
  }

  async findNearby(
    latitude: number,
    longitude: number,
    radiusKm: number = 5,
    limit: number = 20,
  ): Promise<Address[]> {
    // Utiliser une requête approximative pour la proximité
    // En degrés, 1km ≈ 0.009 degrés de latitude
    const degreeRange = radiusKm * 0.009;

    return await this.addressRepository
      .createQueryBuilder('address')
      .where(
        'address.latitude BETWEEN :minLat AND :maxLat AND address.longitude BETWEEN :minLng AND :maxLng',
        {
          minLat: latitude - degreeRange,
          maxLat: latitude + degreeRange,
          minLng: longitude - degreeRange,
          maxLng: longitude + degreeRange,
        },
      )
      .orderBy('address.request_count', 'DESC')
      .take(limit)
      .getMany();
  }

  async getAddressByType(type: string, limit: number = 50): Promise<Address[]> {
    return await this.addressRepository
      .createQueryBuilder('address')
      .where('address.types LIKE :type', { type: `%${type}%` })
      .orderBy('address.rating', 'DESC')
      .addOrderBy('address.user_ratings_total', 'DESC')
      .take(limit)
      .getMany();
  }

  // =====================================
  // Distance Methods (existantes)
  // =====================================

  async findDistanceByOrigins(
    origin: string,
    destination: string,
  ): Promise<Distance | null> {
    return await this.distanceRepository.findOne({
      where: {
        origin_normalized: origin,
        destination_normalized: destination,
      },
    });
  }

  async saveOrUpdateDistance(
    distanceData: Partial<Distance>,
  ): Promise<Distance> {
    try {
      let distance = await this.distanceRepository.findOne({
        where: {
          origin_normalized: distanceData.origin_normalized,
          destination_normalized: distanceData.destination_normalized,
        },
      });

      if (distance) {
        Object.assign(distance, distanceData);
        distance.request_count += 1;
        distance.last_request_at = new Date();
        return await this.distanceRepository.save(distance);
      } else {
        const newDistance = this.distanceRepository.create({
          ...distanceData,
          request_count: 1,
          last_request_at: new Date(),
        });
        return await this.distanceRepository.save(newDistance);
      }
    } catch (error) {
      this.logger.error(
        `Failed to save distance: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async incrementDistanceRequestCount(id: string): Promise<void> {
    await this.distanceRepository.increment({ id }, 'request_count', 1);
    await this.distanceRepository.update(id, { last_request_at: new Date() });
  }

  async getDistanceStatistics() {
    const total = await this.distanceRepository.count();
    const uniquePairs = await this.distanceRepository
      .createQueryBuilder('distance')
      .select(
        'COUNT(DISTINCT CONCAT(distance.origin_normalized, "-", distance.destination_normalized))',
        'count',
      )
      .getRawOne();

    const mostRequested = await this.distanceRepository.find({
      order: { request_count: 'DESC' },
      take: 10,
    });

    return {
      total_requests: total,
      unique_pairs: parseInt(uniquePairs.count),
      most_requested: mostRequested.map((d) => ({
        from: d.origin_address,
        to: d.destination_address,
        requests: d.request_count,
        distance: d.distance_text,
        duration: d.duration_text,
      })),
    };
  }

  // =====================================
  // Direction Methods (existantes)
  // =====================================

  async findDirectionByOrigins(
    origin: string,
    destination: string,
  ): Promise<Direction | null> {
    return await this.directionRepository.findOne({
      where: {
        origin_normalized: origin,
        destination_normalized: destination,
      },
    });
  }

  async saveOrUpdateDirection(
    directionData: Partial<Direction>,
  ): Promise<Direction> {
    try {
      let direction = await this.directionRepository.findOne({
        where: {
          origin_normalized: directionData.origin_normalized,
          destination_normalized: directionData.destination_normalized,
        },
      });

      if (direction) {
        Object.assign(direction, directionData);
        direction.request_count += 1;
        direction.last_request_at = new Date();
        return await this.directionRepository.save(direction);
      } else {
        const newDirection = this.directionRepository.create({
          ...directionData,
          request_count: 1,
          last_request_at: new Date(),
        });
        return await this.directionRepository.save(newDirection);
      }
    } catch (error) {
      this.logger.error(
        `Failed to save direction: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async incrementDirectionRequestCount(id: string): Promise<void> {
    await this.directionRepository.increment({ id }, 'request_count', 1);
    await this.directionRepository.update(id, { last_request_at: new Date() });
  }

  async getDirectionStatistics() {
    const total = await this.directionRepository.count();
    const uniquePairs = await this.directionRepository
      .createQueryBuilder('direction')
      .select(
        'COUNT(DISTINCT CONCAT(direction.origin_normalized, "-", direction.destination_normalized))',
        'count',
      )
      .getRawOne();

    const mostRequested = await this.directionRepository.find({
      order: { request_count: 'DESC' },
      take: 10,
    });

    return {
      total_requests: total,
      unique_pairs: parseInt(uniquePairs.count),
      most_requested: mostRequested.map((d) => ({
        from: d.origin_address,
        to: d.destination_address,
        requests: d.request_count,
        distance: d.distance_meters,
        duration: d.duration_seconds,
      })),
    };
  }

  // =====================================
  // Nouvelles méthodes utilitaires
  // =====================================

  async batchSaveAddresses(addresses: Partial<Address>[]): Promise<Address[]> {
    const savedAddresses: Address[] = [];

    for (const addressData of addresses) {
      try {
        const saved = await this.saveOrUpdateAddress(addressData);
        savedAddresses.push(saved);
      } catch (error) {
        this.logger.error(`Failed to save address batch: ${error.message}`);
      }
    }

    return savedAddresses;
  }

  async getAddressesByRating(
    minRating: number = 4.0,
    limit: number = 50,
  ): Promise<Address[]> {
    return await this.addressRepository
      .createQueryBuilder('address')
      .where('address.rating >= :minRating', { minRating })
      .andWhere('address.user_ratings_total >= 10') // Au moins 10 avis
      .orderBy('address.rating', 'DESC')
      .addOrderBy('address.user_ratings_total', 'DESC')
      .take(limit)
      .getMany();
  }

  async getAddressesWithPhotos(limit: number = 50): Promise<Address[]> {
    return await this.addressRepository
      .createQueryBuilder('address')
      .where('address.photos IS NOT NULL')
      .andWhere('address.photos != "[]"')
      .orderBy('address.request_count', 'DESC')
      .take(limit)
      .getMany();
  }

  async getAddressesByBusinessStatus(
    status: string = 'OPERATIONAL',
    limit: number = 50,
  ): Promise<Address[]> {
    return await this.addressRepository.find({
      where: { business_status: status },
      order: { rating: 'DESC' },
      take: limit,
    });
  }

  async getAddressesWithPhone(limit: number = 50): Promise<Address[]> {
    return await this.addressRepository
      .createQueryBuilder('address')
      .where('address.formatted_phone_number IS NOT NULL')
      .orderBy('address.request_count', 'DESC')
      .take(limit)
      .getMany();
  }

  async getAddressesWithWebsite(limit: number = 50): Promise<Address[]> {
    return await this.addressRepository
      .createQueryBuilder('address')
      .where('address.website IS NOT NULL')
      .orderBy('address.request_count', 'DESC')
      .take(limit)
      .getMany();
  }

  async getAddressesWithOpeningHours(limit: number = 50): Promise<Address[]> {
    return await this.addressRepository
      .createQueryBuilder('address')
      .where('address.opening_hours IS NOT NULL')
      .orderBy('address.request_count', 'DESC')
      .take(limit)
      .getMany();
  }

  async getAddressCountByCountry(): Promise<Map<string, number>> {
    const results = await this.addressRepository
      .createQueryBuilder('address')
      .select('address.country', 'country')
      .addSelect('COUNT(*)', 'count')
      .where('address.country IS NOT NULL')
      .groupBy('address.country')
      .getRawMany();

    const countMap = new Map<string, number>();
    results.forEach((result) => {
      countMap.set(result.country, parseInt(result.count));
    });

    return countMap;
  }

  async getAddressesByPriceLevel(
    priceLevel: number,
    limit: number = 50,
  ): Promise<Address[]> {
    return await this.addressRepository.find({
      where: { price_level: priceLevel },
      order: { rating: 'DESC' },
      take: limit,
    });
  }

  async cleanupDuplicateAddresses(): Promise<number> {
    // Trouver les doublons basés sur les coordonnées
    const duplicates = await this.addressRepository
      .createQueryBuilder('address')
      .select('address.latitude', 'latitude')
      .addSelect('address.longitude', 'longitude')
      .addSelect('COUNT(*)', 'count')
      .groupBy('address.latitude')
      .addGroupBy('address.longitude')
      .having('COUNT(*) > 1')
      .getRawMany();

    let deletedCount = 0;

    for (const dup of duplicates) {
      const addresses = await this.addressRepository.find({
        where: {
          latitude: dup.latitude,
          longitude: dup.longitude,
        },
        order: {
          request_count: 'DESC',
          last_request_at: 'DESC',
        },
      });

      // Garder le plus récent/populaire, supprimer les autres
      const [keep, ...toDelete] = addresses;

      for (const address of toDelete) {
        await this.addressRepository.remove(address);
        deletedCount++;
      }

      this.logger.log(
        `Merged ${toDelete.length} duplicate(s) for (${dup.latitude}, ${dup.longitude}) into ID ${keep.id}`,
      );
    }

    return deletedCount;
  }

  // address.service.ts - Ajouter cette méthode

  /**
   * Recherche avancée d'adresses avec critères multiples
   * Utilisée par searchPlaces pour vérifier en base avant d'appeler Google
   */
  async searchAddressesByQuery(
    query: string,
    options?: {
      location?: string; // Format: "lat,lng"
      radius?: number; // Rayon en km
      type?: string; // Type de lieu (bar, restaurant, etc.)
      limit?: number; // Nombre max de résultats
      minRating?: number; // Note minimale
    },
  ): Promise<Address[]> {
    if (!query || query.trim().length < 2) {
      return [];
    }

    try {
      const queryBuilder = this.addressRepository.createQueryBuilder('address');
      const searchPattern = `%${query.trim().toLowerCase()}%`;

      // Recherche dans les champs de texte
      queryBuilder.where(
        '(LOWER(address.name) LIKE :query OR ' +
          'LOWER(address.formatted_address) LIKE :query OR ' +
          'LOWER(address.normalized_name) LIKE :query OR ' +
          'LOWER(address.locality) LIKE :query OR ' +
          'LOWER(address.route) LIKE :query)',
        { query: searchPattern },
      );

      // Filtrer par type si spécifié
      if (options?.type) {
        queryBuilder.andWhere('address.types LIKE :type', {
          type: `%${options.type}%`,
        });
      }

      // Filtrer par note minimale
      if (options?.minRating) {
        queryBuilder.andWhere('address.rating >= :minRating', {
          minRating: options.minRating,
        });
      }

      // Filtrer par localisation (rayon)
      if (options?.location) {
        const [lat, lng] = options.location.split(',');
        if (lat && lng) {
          const latNum = parseFloat(lat);
          const lngNum = parseFloat(lng);
          const radiusKm = options?.radius || 10;

          // 1 degré ≈ 111 km
          const delta = radiusKm / 111;

          queryBuilder.andWhere(
            'address.latitude BETWEEN :minLat AND :maxLat AND ' +
              'address.longitude BETWEEN :minLng AND :maxLng',
            {
              minLat: latNum - delta,
              maxLat: latNum + delta,
              minLng: lngNum - delta,
              maxLng: lngNum + delta,
            },
          );
        }
      }

      // Trier par popularité et note
      queryBuilder
        .orderBy('address.request_count', 'DESC')
        .addOrderBy('address.rating', 'DESC')
        .addOrderBy('address.user_ratings_total', 'DESC')
        .take(options?.limit || 20);

      const results = await queryBuilder.getMany();

      this.logger.log(
        `Found ${results.length} addresses in database matching "${query}"` +
          (options?.location ? ` near ${options.location}` : ''),
      );

      return results;
    } catch (error) {
      this.logger.error(`Error in searchAddressesByQuery: ${error.message}`);
      return [];
    }
  }

  /**
   * Recherche par similarité de nom (plus flexible)
   */
  async searchAddressesByName(
    name: string,
    options?: {
      location?: string;
      radius?: number;
      limit?: number;
    },
  ): Promise<Address[]> {
    if (!name || name.trim().length < 2) {
      return [];
    }

    try {
      const queryBuilder = this.addressRepository.createQueryBuilder('address');
      const searchPattern = `%${name.trim().toLowerCase()}%`;

      // Recherche exacte d'abord
      queryBuilder.where(
        '(LOWER(address.name) LIKE :query OR LOWER(address.normalized_name) LIKE :query)',
        { query: searchPattern },
      );

      // Filtrer par localisation
      if (options?.location) {
        const [lat, lng] = options.location.split(',');
        if (lat && lng) {
          const latNum = parseFloat(lat);
          const lngNum = parseFloat(lng);
          const radiusKm = options?.radius || 10;
          const delta = radiusKm / 111;

          queryBuilder.andWhere(
            'address.latitude BETWEEN :minLat AND :maxLat AND ' +
              'address.longitude BETWEEN :minLng AND :maxLng',
            {
              minLat: latNum - delta,
              maxLat: latNum + delta,
              minLng: lngNum - delta,
              maxLng: lngNum + delta,
            },
          );
        }
      }

      queryBuilder
        .orderBy('address.request_count', 'DESC')
        .addOrderBy('address.rating', 'DESC')
        .take(options?.limit || 20);

      return await queryBuilder.getMany();
    } catch (error) {
      this.logger.error(`Error in searchAddressesByName: ${error.message}`);
      return [];
    }
  }

  /**
   * Vérifie si un lieu existe déjà avec des critères similaires
   */
  async existsSimilarAddress(
    name: string,
    latitude: number,
    longitude: number,
    toleranceKm: number = 1,
  ): Promise<Address | null> {
    const delta = toleranceKm / 111; // Convertir km en degrés

    return await this.addressRepository
      .createQueryBuilder('address')
      .where('LOWER(address.name) LIKE :name', {
        name: `%${name.toLowerCase()}%`,
      })
      .andWhere(
        'address.latitude BETWEEN :minLat AND :maxLat AND ' +
          'address.longitude BETWEEN :minLng AND :maxLng',
        {
          minLat: latitude - delta,
          maxLat: latitude + delta,
          minLng: longitude - delta,
          maxLng: longitude + delta,
        },
      )
      .orderBy('address.request_count', 'DESC')
      .getOne();
  }

  /**
   * Récupère les lieux les plus populaires pour un type et une localisation
   */
  async getPopularPlaces(
    type?: string,
    options?: {
      location?: string;
      radius?: number;
      limit?: number;
    },
  ): Promise<Address[]> {
    const queryBuilder = this.addressRepository.createQueryBuilder('address');

    if (type) {
      queryBuilder.where('address.types LIKE :type', {
        type: `%${type}%`,
      });
    }

    if (options?.location) {
      const [lat, lng] = options.location.split(',');
      if (lat && lng) {
        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lng);
        const radiusKm = options?.radius || 10;
        const delta = radiusKm / 111;

        queryBuilder.andWhere(
          'address.latitude BETWEEN :minLat AND :maxLat AND ' +
            'address.longitude BETWEEN :minLng AND :maxLng',
          {
            minLat: latNum - delta,
            maxLat: latNum + delta,
            minLng: lngNum - delta,
            maxLng: lngNum + delta,
          },
        );
      }
    }

    queryBuilder
      .orderBy('address.request_count', 'DESC')
      .addOrderBy('address.rating', 'DESC')
      .take(options?.limit || 20);

    return await queryBuilder.getMany();
  }
}
