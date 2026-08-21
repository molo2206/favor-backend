import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Cache } from 'cache-manager';
import { firstValueFrom } from 'rxjs';
import { AddressService } from './address/address.service';
import { SearchHistoryService } from './address/search-history.service';
import { Address } from './address/entity/address.entity';

interface GoogleAutocompleteResponse {
  status: string;
  predictions: Array<{
    description: string;
    place_id: string;
    structured_formatting?: {
      main_text: string;
      secondary_text?: string;
    };
  }>;
  html_attributions?: string[];
}
@Injectable()
export class GoogleService {
  private readonly apiKey: string;
  private readonly logger = new Logger(GoogleService.name);
  private readonly urls: Record<string, string>;
  private readonly TTLs = { short: 3600, long: 86400 }; // 1h et 24h
  private readonly defaultLocation: string; // Ajout de la localisation par défaut

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private addressService: AddressService,
    private searchHistoryService: SearchHistoryService,
  ) {
    this.apiKey = this.configService.getOrThrow<string>('GOOGLE_API_KEY');

    // Localisation par défaut (peut être configurée dans les variables d'environnement)
    this.defaultLocation =
      this.configService.get<string>('GOOGLE_DEFAULT_LOCATION') ||
      '48.8566,2.3522';

    this.urls = {
      distance: this.configService.getOrThrow('GOOGLE_DISTANCE_MATRIX_URL'),
      directions: this.configService.getOrThrow('GOOGLE_DIRECTIONS_URL'),
      placeDetails: this.configService.getOrThrow('GOOGLE_PLACE_DETAILS_URL'),
      autocomplete: this.configService.getOrThrow('GOOGLE_AUTOCOMPLETE_URL'),
      geocode: this.configService.getOrThrow('GOOGLE_GEOCODE_URL'),
    };
  }

  // ------------------------------------
  // Normalisation clé cache
  // ------------------------------------
  private normalizeKey(prefix: string, ...values: string[]) {
    return `${prefix}:${values
      .map((v) => v.trim().toLowerCase())
      .sort()
      .join(':')}`;
  }

  // ------------------------------------
  // Méthode générique cache + Google
  // ------------------------------------
  private async getCached<T>(
    url: string,
    cacheKey: string,
    ttl: number,
  ): Promise<T> {
    const cached = await this.cacheManager.get<T>(cacheKey);
    if (cached) return cached;

    try {
      const response = await firstValueFrom(this.httpService.get<T>(url));
      const data: any = response.data;

      if (
        data?.status &&
        data.status !== 'OK' &&
        data.status !== 'ZERO_RESULTS'
      ) {
        this.logger.error(
          `Google API error: ${data.status}`,
          JSON.stringify(data),
        );
        throw new InternalServerErrorException(
          `Google API error: ${data.status}`,
        );
      }

      await this.cacheManager.set(cacheKey, data, ttl);
      return data;
    } catch (error: any) {
      this.logger.error(
        `Google API call failed: ${error?.message || error}`,
        error?.stack,
      );
      throw new InternalServerErrorException('Erreur appel Google API');
    }
  }

  // ------------------------------------
  // Wrapper pour renvoyer format uniforme
  // ------------------------------------
  private wrapGoogleResponse(
    results: any[],
    html_attributions: any[] = [],
    status: string = 'OK',
  ) {
    return { html_attributions, results, status };
  }

  async searchPlaces(
    query: string,
    options?: {
      language?: string;
      region?: string;
      location?: string;
      radius?: number;
      minprice?: number;
      maxprice?: number;
      opennow?: boolean;
      type?: string;
      types?: string;
      pagetoken?: string;
      fields?: string;
      saveToDatabase?: boolean;
      clientIp?: string;
    },
  ) {
    this.logger.log(
      `🔍 Searching places for query: "${query}"`,
    );

    // =====================================================
    // 1. VALIDATION
    // =====================================================

    if (!query || !query.trim()) {
      return this.wrapGoogleResponse(
        [],
        [],
        'INVALID_REQUEST',
      );
    }

    query = query.trim();

    // =====================================================
    // 2. DÉTECTION DE LA LOCALISATION
    // =====================================================

    let locationToUse = options?.location;

    if (!locationToUse && options?.clientIp) {
      try {
        const ipLocation =
          await this.getLocationFromIp(
            options.clientIp,
          );

        if (ipLocation) {
          locationToUse =
            `${ipLocation.lat},${ipLocation.lng}`;

          this.logger.log(
            `📍 Location detected from IP: ${locationToUse}`,
          );

          if (
            !options?.region &&
            ipLocation.country
          ) {
            options = {
              ...options,
              region:
                ipLocation.country.toLowerCase(),
            };
          }
        }
      } catch (error) {
        this.logger.warn(
          `⚠️ Unable to detect location from IP: ${error?.message || error
          }`,
        );
      }
    }

    // =====================================================
    // 3. LOCALISATION PAR DÉFAUT : GOMA
    // =====================================================

    if (!locationToUse) {
      locationToUse = '-1.6586,29.2204';

      this.logger.log(
        `📍 Using default location: ${locationToUse}`,
      );
    }

    // =====================================================
    // 4. NORMALISATION DU TYPE
    // =====================================================

    const rawType =
      options?.type ||
      options?.types ||
      '';

    const normalizedType =
      rawType
        .replace(/[()]/g, '')
        .trim()
        .toLowerCase();

    const isCitySearch =
      normalizedType === 'cities' ||
      normalizedType === 'locality';

    this.logger.log(
      `🔍 Raw type: "${rawType}"`,
    );

    this.logger.log(
      `🔍 Normalized type: "${normalizedType}"`,
    );

    this.logger.log(
      `🏙️ City search: ${isCitySearch}`,
    );

    // =====================================================
    // 5. RECHERCHE LOCALE DB
    // =====================================================
    //
    // Pour les villes, on ne cherche PAS dans la DB.
    // On utilise directement Google Autocomplete.
    //

    if (!isCitySearch) {
      try {
        const dbResults =
          await this.addressService.searchAddressesByQuery(
            query,
            {
              location: locationToUse,
              radius: options?.radius
                ? options.radius / 1000
                : 10,
              type: normalizedType,
              limit: 20,
            },
          );

        if (
          dbResults &&
          dbResults.length > 0
        ) {
          this.logger.log(
            `✅ Found ${dbResults.length} results in database for "${query}"`,
          );

          for (const address of dbResults) {
            try {
              await this.addressService.incrementRequestCount(
                address.id,
              );
            } catch (error) {
              this.logger.warn(
                `⚠️ Unable to increment request count for address ${address.id}`,
              );
            }
          }

          const formattedResults =
            dbResults.map(
              (address: any) => ({
                formatted_address:
                  address.formatted_address,

                geometry:
                  address.geometry,

                icon:
                  address.icon,

                icon_background_color:
                  address.icon_background_color,

                icon_mask_base_uri:
                  address.icon_mask_base_uri,

                name:
                  address.name,

                photos:
                  address.photos || [],

                place_id:
                  address.place_id,

                reference:
                  address.reference,

                types:
                  address.types,

                opening_hours:
                  address.opening_hours,

                price_level:
                  address.price_level,

                rating:
                  address.rating,

                user_ratings_total:
                  address.user_ratings_total,

                vicinity:
                  address.vicinity,

                plus_code:
                  address.plus_code,

                business_status:
                  address.business_status,

                fromDatabase: true,
              }),
            );

          return this.wrapGoogleResponse(
            formattedResults,
            [],
            'OK',
          );
        }
      } catch (error) {
        this.logger.warn(
          `⚠️ Database search failed: ${error?.message || error
          }`,
        );

        // On continue avec Google
      }
    }

    // =====================================================
    // 6. VARIABLES GOOGLE
    // =====================================================

    let results: any[] = [];

    let htmlAttributions: string[] = [];

    let status = 'OK';

    // =====================================================
    // 7. RECHERCHE DES VILLES
    // =====================================================

    if (isCitySearch) {
      this.logger.log(
        `🏙️ Using Google Autocomplete API for city search: "${query}"`,
      );

      try {
        // -------------------------------------------------
        // Construction propre de l'URL
        // -------------------------------------------------

        const params =
          new URLSearchParams();

        params.set(
          'input',
          query,
        );

        params.set(
          'key',
          this.apiKey,
        );

        params.set(
          'types',
          '(cities)',
        );

        params.set(
          'language',
          options?.language || 'fr',
        );

        // -------------------------------------------------
        // Location
        // -------------------------------------------------

        if (locationToUse) {
          params.set(
            'location',
            locationToUse,
          );

          params.set(
            'radius',
            String(
              options?.radius || 50000,
            ),
          );
        }

        // -------------------------------------------------
        // Region
        // -------------------------------------------------

        if (options?.region) {
          params.set(
            'region',
            options.region,
          );
        }

        const autocompleteUrl =
          `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`;

        this.logger.log(
          `🌐 Google Autocomplete URL: ${this.maskApiKey(
            autocompleteUrl,
          )}`,
        );

        // -------------------------------------------------
        // Cache
        // -------------------------------------------------

        const cacheKey =
          this.normalizeKey(
            'autocomplete',
            query,
            locationToUse,
          );

        // -------------------------------------------------
        // Appel Google
        // -------------------------------------------------

        let autocompleteData: any;

        try {
          autocompleteData =
            await this.getCached<any>(
              autocompleteUrl,
              cacheKey,
              this.TTLs.short,
            );
        } catch (error) {
          this.logger.error(
            `❌ Google Autocomplete HTTP error: ${error?.response?.data
              ? JSON.stringify(
                error.response.data,
              )
              : error?.message || error
            }`,
          );

          return this.wrapGoogleResponse(
            [],
            [],
            'UNKNOWN_ERROR',
          );
        }

        // -------------------------------------------------
        // LOG réponse Google
        // -------------------------------------------------

        this.logger.log(
          `📡 Google Autocomplete response: ${JSON.stringify(
            autocompleteData,
            null,
            2,
          )}`,
        );

        // -------------------------------------------------
        // Vérification réponse
        // -------------------------------------------------

        if (!autocompleteData) {
          this.logger.error(
            `❌ Google returned an empty response`,
          );

          return this.wrapGoogleResponse(
            [],
            [],
            'UNKNOWN_ERROR',
          );
        }

        status =
          autocompleteData.status ||
          'UNKNOWN_ERROR';

        // -------------------------------------------------
        // Google OK
        // -------------------------------------------------

        if (status === 'OK') {
          const predictions =
            autocompleteData.predictions ||
            [];

          results =
            predictions.map(
              (prediction: any) => ({
                formatted_address:
                  prediction.description,

                place_id:
                  prediction.place_id,

                reference:
                  prediction.place_id,

                name:
                  prediction
                    .structured_formatting
                    ?.main_text ||
                  prediction.description,

                types: [
                  'locality',
                  'geocode',
                ],

                geometry: null,

                icon: null,

                icon_background_color:
                  null,

                icon_mask_base_uri:
                  null,

                photos: [],

                opening_hours: null,

                price_level: null,

                rating: null,

                user_ratings_total:
                  null,

                vicinity: null,

                plus_code: null,

                business_status:
                  'OPERATIONAL',

                fromDatabase: false,
              }),
            );

          htmlAttributions =
            autocompleteData
              .html_attributions ||
            [];

          this.logger.log(
            `✅ Google found ${results.length} cities for "${query}"`,
          );
        }

        // -------------------------------------------------
        // ZERO_RESULTS
        // -------------------------------------------------

        else if (
          status === 'ZERO_RESULTS'
        ) {
          results = [];

          this.logger.log(
            `ℹ️ No cities found for "${query}"`,
          );
        }

        // -------------------------------------------------
        // REQUEST_DENIED
        // -------------------------------------------------

        else if (
          status === 'REQUEST_DENIED'
        ) {
          results = [];

          this.logger.error(
            `❌ Google REQUEST_DENIED: ${autocompleteData.error_message ||
            'API key or API configuration problem'
            }`,
          );
        }

        // -------------------------------------------------
        // INVALID_REQUEST
        // -------------------------------------------------

        else if (
          status === 'INVALID_REQUEST'
        ) {
          results = [];

          this.logger.error(
            `❌ Google INVALID_REQUEST: ${autocompleteData.error_message ||
            'Invalid Google Places request'
            }`,
          );
        }

        // -------------------------------------------------
        // Autres erreurs Google
        // -------------------------------------------------

        else {
          results = [];

          this.logger.error(
            `❌ Google Autocomplete error: ${status} - ${autocompleteData.error_message ||
            'Unknown Google error'
            }`,
          );
        }
      } catch (error) {
        this.logger.error(
          `❌ Unexpected city search error: ${error?.message || error
          }`,
          error?.stack,
        );

        return this.wrapGoogleResponse(
          [],
          [],
          'UNKNOWN_ERROR',
        );
      }
    }

    // =====================================================
    // 8. RECHERCHE POI / BUSINESSES
    // =====================================================

    else {
      this.logger.log(
        `📍 Using Google Text Search API for POI search: "${query}"`,
      );

      try {
        const params =
          new URLSearchParams();

        params.set(
          'query',
          query,
        );

        params.set(
          'key',
          this.apiKey,
        );

        // -------------------------------------------------
        // Location
        // -------------------------------------------------

        if (locationToUse) {
          params.set(
            'location',
            locationToUse,
          );
        }

        // -------------------------------------------------
        // Radius
        // -------------------------------------------------

        params.set(
          'radius',
          String(
            options?.radius || 10000,
          ),
        );

        // -------------------------------------------------
        // Region
        // -------------------------------------------------

        if (options?.region) {
          params.set(
            'region',
            options.region,
          );
        }

        // -------------------------------------------------
        // Language
        // -------------------------------------------------

        if (options?.language) {
          params.set(
            'language',
            options.language,
          );
        }

        // -------------------------------------------------
        // Price
        // -------------------------------------------------

        if (
          options?.minprice !==
          undefined
        ) {
          params.set(
            'minprice',
            String(
              options.minprice,
            ),
          );
        }

        if (
          options?.maxprice !==
          undefined
        ) {
          params.set(
            'maxprice',
            String(
              options.maxprice,
            ),
          );
        }

        // -------------------------------------------------
        // Open now
        // -------------------------------------------------

        if (options?.opennow) {
          params.set(
            'opennow',
            'true',
          );
        }

        // -------------------------------------------------
        // Type
        // -------------------------------------------------

        if (
          normalizedType &&
          normalizedType !== 'cities' &&
          normalizedType !== 'locality'
        ) {
          params.set(
            'type',
            normalizedType,
          );
        }

        // -------------------------------------------------
        // Pagination
        // -------------------------------------------------

        if (options?.pagetoken) {
          params.set(
            'pagetoken',
            options.pagetoken,
          );
        }

        // -------------------------------------------------
        // Fields
        // -------------------------------------------------

        if (options?.fields) {
          params.set(
            'fields',
            options.fields,
          );
        }

        const url =
          `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`;

        this.logger.log(
          `🌐 Google TextSearch URL: ${this.maskApiKey(
            url,
          )}`,
        );

        // -------------------------------------------------
        // Cache
        // -------------------------------------------------

        const cacheKey =
          this.normalizeKey(
            'searchPlaces',
            query,
            locationToUse,
          );

        let data: any;

        try {
          data =
            await this.getCached<any>(
              url,
              cacheKey,
              this.TTLs.short,
            );
        } catch (error) {
          this.logger.error(
            `❌ Google TextSearch HTTP error: ${error?.response?.data
              ? JSON.stringify(
                error.response.data,
              )
              : error?.message || error
            }`,
          );

          return this.wrapGoogleResponse(
            [],
            [],
            'UNKNOWN_ERROR',
          );
        }

        // -------------------------------------------------
        // LOG réponse
        // -------------------------------------------------

        this.logger.log(
          `📡 Google TextSearch response: ${JSON.stringify(
            data,
            null,
            2,
          )}`,
        );

        if (!data) {
          return this.wrapGoogleResponse(
            [],
            [],
            'UNKNOWN_ERROR',
          );
        }

        status =
          data.status ||
          'UNKNOWN_ERROR';

        // -------------------------------------------------
        // OK
        // -------------------------------------------------

        if (status === 'OK') {
          results =
            (data.results || []).map(
              (r: any) => ({
                ...r,
                fromDatabase: false,
              }),
            );

          htmlAttributions =
            data.html_attributions ||
            [];

          this.logger.log(
            `✅ Google found ${results.length} POIs for "${query}"`,
          );
        }

        // -------------------------------------------------
        // ZERO_RESULTS
        // -------------------------------------------------

        else if (
          status === 'ZERO_RESULTS'
        ) {
          results = [];

          this.logger.log(
            `ℹ️ No POI found for "${query}"`,
          );
        }

        // -------------------------------------------------
        // GOOGLE ERROR
        // -------------------------------------------------

        else {
          results = [];

          this.logger.error(
            `❌ Google TextSearch error: ${status} - ${data.error_message ||
            'Unknown Google error'
            }`,
          );
        }
      } catch (error) {
        this.logger.error(
          `❌ Unexpected POI search error: ${error?.message || error
          }`,
          error?.stack,
        );

        return this.wrapGoogleResponse(
          [],
          [],
          'UNKNOWN_ERROR',
        );
      }
    }

    // =====================================================
    // 9. SAUVEGARDE EN DB
    // =====================================================

    const shouldSave =
      options?.saveToDatabase !== false;

    // Ne jamais sauvegarder les villes
    if (
      shouldSave &&
      results.length > 0 &&
      !isCitySearch
    ) {
      this.saveSearchResultsToDatabase(
        query,
        results,
      ).catch((error) => {
        this.logger.error(
          `❌ Background save failed: ${error?.message || error
          }`,
        );
      });
    }

    // =====================================================
    // 10. LOG FINAL
    // =====================================================

    this.logger.log(
      `✅ Search completed | query="${query}" | type="${normalizedType || 'default'
      }" | citySearch=${isCitySearch} | results=${results.length
      } | status=${status}`,
    );

    // =====================================================
    // 11. RESPONSE
    // =====================================================

    return this.wrapGoogleResponse(
      results,
      htmlAttributions,
      status,
    );
  }

  private maskApiKey(url: string): string {
    if (!url) {
      return url;
    }

    return url.replace(
      /([?&]key=)[^&]+/i,
      '$1***',
    );
  }
  // =====================================
  // Search Places (Text Search) - CORRIGÉ

  /**
   * Sauvegarde asynchrone des résultats de recherche en base de données
   */
  private async saveSearchResultsToDatabase(query: string, results: any[]) {
    try {
      this.logger.log(
        `Saving ${results.length} search results for "${query}" to database...`,
      );
      let savedCount = 0;
      let updatedCount = 0;

      for (const result of results) {
        // Vérifier si le lieu existe déjà
        const existingAddress = await this.addressService.findByPlaceId(
          result.place_id,
        );

        if (!existingAddress) {
          // Nouveau lieu - préparation et sauvegarde
          const addressData = this.prepareAddressData(result);
          await this.addressService.saveOrUpdateAddress(addressData);
          savedCount++;
          this.logger.debug(
            `📝 New place saved: ${result.name} (${result.place_id})`,
          );
        } else {
          // Lieu existant - mise à jour du compteur seulement
          await this.addressService.incrementRequestCount(existingAddress.id);
          updatedCount++;

          // Optionnel : Vérifier si certaines données ont changé (rating, etc.)
          if (result.rating !== existingAddress.rating) {
            this.logger.debug(
              `⭐ Rating changed for ${result.name}: ${existingAddress.rating} -> ${result.rating}`,
            );
            // Mettre à jour le rating si nécessaire
            await this.addressService.saveOrUpdateAddress({
              ...this.prepareAddressData(result),
              id: existingAddress.id,
            });
          }
        }
      }

      this.logger.log(
        `✅ Search results saved: ${savedCount} new places, ${updatedCount} already existed for query: "${query}"`,
      );

      // Sauvegarder dans l'historique des recherches si disponible
      if (this.searchHistoryService) {
        await this.searchHistoryService.saveOrUpdateSearch(
          query,
          `${results.length} results found (${savedCount} new)`,
          undefined,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to save search results: ${error.message}`,
        error.stack,
      );
      // Ne pas relancer l'erreur pour ne pas bloquer la réponse
    }
  }

  // Dans google-maps.service.ts
  /**
   * Récupère la localisation approximative à partir de l'IP via Google
   */
  private async getLocationFromIp(
    ip: string,
  ): Promise<{ lat: number; lng: number; country: string } | null> {
    // Ignorer les IPs locales
    if (
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip.startsWith('192.168.') ||
      ip.startsWith('10.')
    ) {
      return null;
    }

    try {
      // Utiliser l'API Google Maps Geocoding avec l'IP
      // Note: Google utilise la géolocalisation approximative basée sur l'IP
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${ip}&key=${this.apiKey}`;
      const response = await firstValueFrom(this.httpService.get(url));

      if (response.data.results && response.data.results.length > 0) {
        const location = response.data.results[0].geometry.location;
        const country = this.getCountryFromAddressComponents(
          response.data.results[0].address_components,
        );

        this.logger.log(
          `IP ${ip} geolocated to: ${location.lat}, ${location.lng} - ${country}`,
        );

        return {
          lat: location.lat,
          lng: location.lng,
          country: country,
        };
      }
      return null;
    } catch (error) {
      this.logger.error(`Failed to geolocate IP ${ip}: ${error.message}`);
      return null;
    }
  }

  /**
   * Extrait le pays des composants d'adresse
   */
  private getCountryFromAddressComponents(components: any[]): string {
    const countryComponent = components?.find((c: any) =>
      c.types.includes('country'),
    );
    return countryComponent?.short_name || 'fr';
  }
  /**
   * Prépare les données d'adresse pour l'enregistrement en base de données
   */
  private prepareAddressData(result: any): Partial<Address> {
    // Extraire les composants d'adresse
    const latitude = result.geometry?.location?.lat;
    const longitude = result.geometry?.location?.lng;

    // Extraire les composants d'adresse à partir de formatted_address
    const addressComponents = this.parseAddressComponents(
      result.formatted_address,
    );

    // Préparer les données pour l'enregistrement
    return {
      place_id: result.place_id,
      formatted_address: result.formatted_address,
      name: result.name,
      types: result.types,
      geometry: result.geometry,
      latitude: latitude,
      longitude: longitude,
      icon: result.icon,
      icon_background_color: result.icon_background_color,
      icon_mask_base_uri: result.icon_mask_base_uri,
      photos: result.photos || [],
      rating: result.rating,
      user_ratings_total: result.user_ratings_total,
      business_status: result.business_status,
      opening_hours: result.opening_hours,
      price_level: result.price_level,
      vicinity: result.vicinity,
      reference: result.reference,
      plus_code: result.plus_code?.global_code,
      // Ajouter les composants extraits
      route: addressComponents.route,
      locality: addressComponents.city,
      country: addressComponents.country,
      postal_code: addressComponents.postalCode,
      street_number: addressComponents.streetNumber,
      administrative_area_level_1: addressComponents.state,
    };
  }

  /**
   * Parse une adresse formatée pour en extraire les composants
   * Exemple: "23 Rue de Dunkerque, 75010 Paris, France"
   */
  private parseAddressComponents(formattedAddress: string): {
    streetNumber?: string;
    route?: string;
    city?: string;
    postalCode?: string;
    country?: string;
    state?: string;
  } {
    const components: any = {};

    if (!formattedAddress) return components;

    const parts = formattedAddress.split(',');

    // Extraire le pays (dernier élément)
    if (parts.length > 0) {
      components.country = parts[parts.length - 1]?.trim();
    }

    // Extraire le code postal et la ville
    if (parts.length >= 2) {
      const cityPart = parts[parts.length - 2]?.trim();
      const postalCodeMatch = cityPart?.match(/\b(\d{5})\s+(.+)/);
      if (postalCodeMatch) {
        components.postalCode = postalCodeMatch[1];
        components.city = postalCodeMatch[2];
      } else {
        components.city = cityPart;
      }
    }

    // Extraire la rue et le numéro
    if (parts.length >= 3) {
      const streetPart = parts[0]?.trim();
      const streetNumberMatch = streetPart?.match(/^(\d+)\s+(.+)/);
      if (streetNumberMatch) {
        components.streetNumber = streetNumberMatch[1];
        components.route = streetNumberMatch[2];
      } else {
        components.route = streetPart;
      }
    }

    return components;
  }
  // =====================================
  // Search Nearby Places - NOUVELLE MÉTHODE
  // =====================================
  async searchNearbyPlaces(
    location: string,
    options?: {
      radius?: number;
      keyword?: string;
      language?: string;
      minprice?: number;
      maxprice?: number;
      opennow?: boolean;
      type?: string;
      rankby?: 'prominence' | 'distance';
    },
  ) {
    this.logger.log(`Searching nearby places at location: "${location}"`);

    let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${encodeURIComponent(location)}&key=${this.apiKey}`;

    const radius = options?.radius || 5000;
    url += `&radius=${radius}`;

    if (options?.keyword)
      url += `&keyword=${encodeURIComponent(options.keyword)}`;
    if (options?.language) url += `&language=${options.language}`;
    if (options?.minprice) url += `&minprice=${options.minprice}`;
    if (options?.maxprice) url += `&maxprice=${options.maxprice}`;
    if (options?.opennow) url += `&opennow=${options.opennow}`;
    if (options?.type) url += `&type=${options.type}`;
    if (options?.rankby) url += `&rankby=${options.rankby}`;

    const cacheKey = this.normalizeKey(
      'nearbyPlaces',
      location,
      radius.toString(),
      options?.keyword || 'default',
      options?.type || 'default',
    );

    const data = await this.getCached<any>(url, cacheKey, this.TTLs.short);

    const results = (data.results || []).map((r: any) => ({
      formatted_address: r.vicinity || r.formatted_address,
      geometry: r.geometry,
      icon: r.icon,
      icon_background_color: r.icon_background_color,
      icon_mask_base_uri: r.icon_mask_base_uri,
      name: r.name,
      photos: r.photos || [],
      place_id: r.place_id,
      reference: r.reference,
      types: r.types,
      opening_hours: r.opening_hours,
      price_level: r.price_level,
      rating: r.rating,
      user_ratings_total: r.user_ratings_total,
      vicinity: r.vicinity,
      business_status: r.business_status,
    }));

    return this.wrapGoogleResponse(
      results,
      data.html_attributions || [],
      data.status || 'OK',
    );
  }

  // =====================================
  // Distance Matrix (simple)
  // =====================================
  async getDistance(
    origin: string,
    destination: string,
    saveToDatabase: boolean = true,
    options?: {
      mode?: string;
      language?: string;
    },
  ) {
    // Normaliser les adresses pour la recherche
    const normalizedOrigin = origin.trim().toLowerCase();
    const normalizedDestination = destination.trim().toLowerCase();

    // ÉTAPE 1: Chercher d'abord dans la base de données
    this.logger.log(
      `Searching in database for distance between "${origin}" and "${destination}"`,
    );
    const existingDistance = await this.addressService.findDistanceByOrigins(
      normalizedOrigin,
      normalizedDestination,
    );

    if (existingDistance) {
      this.logger.log(
        `Distance found in database for "${origin}" -> "${destination}"`,
      );

      // Mettre à jour le compteur de requêtes
      await this.addressService.incrementDistanceRequestCount(
        existingDistance.id,
      );

      // Retourner les données formatées comme Google API
      return {
        status: 'OK',
        origin_addresses: [origin],
        destination_addresses: [destination],
        rows: [
          {
            elements: [
              {
                status: 'OK',
                distance: {
                  text: existingDistance.distance_text,
                  value: existingDistance.distance_meters,
                },
                duration: {
                  text: existingDistance.duration_text,
                  value: existingDistance.duration_seconds,
                },
                fromDatabase: true,
              },
            ],
          },
        ],
      };
    }

    // ÉTAPE 2: Si non trouvé en BD, appeler Google API
    this.logger.log(
      `Distance not found in database, calling Google API for "${origin}" -> "${destination}"`,
    );

    let url = `${this.urls.distance}?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${this.apiKey}`;

    if (options?.mode) url += `&mode=${options.mode}`;
    if (options?.language) url += `&language=${options.language}`;

    const cacheKey = this.normalizeKey('distance', origin, destination);
    const data = await this.getCached<any>(url, cacheKey, this.TTLs.short);

    const element = data?.rows?.[0]?.elements?.[0];
    if (!element || element.status !== 'OK') {
      return {
        status: 'NOT_FOUND',
        origin_addresses: [origin],
        destination_addresses: [destination],
        rows: [
          {
            elements: [
              {
                status: 'NOT_FOUND',
              },
            ],
          },
        ],
      };
    }

    // ÉTAPE 3: Sauvegarder en base de données
    if (saveToDatabase) {
      try {
        await this.addressService.saveOrUpdateDistance({
          origin_address: origin,
          destination_address: destination,
          origin_normalized: normalizedOrigin,
          destination_normalized: normalizedDestination,
          distance_meters: element.distance.value,
          distance_text: element.distance.text,
          duration_seconds: element.duration.value,
          duration_text: element.duration.text,
          status: element.status,
        });
        this.logger.log(
          `Distance saved to database for "${origin}" -> "${destination}"`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to save distance to database: ${error.message}`,
        );
      }
    }

    return data;
  }

  // =====================================
  // Directions
  // =====================================
  async getDirections(
    origin: string,
    destination: string,
    saveToDatabase: boolean = true,
    options?: {
      mode?: string;
      waypoints?: string[];
      alternatives?: boolean;
      avoid?: string;
      language?: string;
      units?: string;
      region?: string;
      departure_time?: number;
      arrival_time?: number;
      traffic_model?: string;
      transit_mode?: string;
      transit_routing_preference?: string;
      optimize_waypoints?: boolean;
    },
  ) {
    // Normaliser les adresses
    const normalizedOrigin = origin.trim().toLowerCase();
    const normalizedDestination = destination.trim().toLowerCase();

    // Chercher en base de données
    const existingDirection = await this.addressService.findDirectionByOrigins(
      normalizedOrigin,
      normalizedDestination,
    );

    if (existingDirection) {
      this.logger.log(
        `Directions found in database for "${origin}" -> "${destination}"`,
      );
      await this.addressService.incrementDirectionRequestCount(
        existingDirection.id,
      );

      // Retourner la structure Google complète
      return {
        status: 'OK',
        routes: [
          {
            legs: [
              {
                distance: {
                  text: this.formatDistance(existingDirection.distance_meters),
                  value: existingDirection.distance_meters,
                },
                duration: {
                  text: this.formatDuration(existingDirection.duration_seconds),
                  value: existingDirection.duration_seconds,
                },
                start_address: existingDirection.start_address,
                end_address: existingDirection.end_address,
              },
            ],
            overview_polyline: { points: existingDirection.polyline },
            fromDatabase: true,
          },
        ],
      };
    }

    // Construire l'URL Google
    let url = `${this.urls.directions}?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&key=${this.apiKey}`;

    // Ajouter les options
    if (options?.mode) url += `&mode=${options.mode}`;
    if (options?.waypoints)
      url += `&waypoints=${options.waypoints.map((w) => encodeURIComponent(w)).join('|')}`;
    if (options?.alternatives) url += `&alternatives=${options.alternatives}`;
    if (options?.avoid) url += `&avoid=${options.avoid}`;
    if (options?.language) url += `&language=${options.language}`;
    if (options?.units) url += `&units=${options.units}`;
    if (options?.region) url += `&region=${options.region}`;
    if (options?.departure_time)
      url += `&departure_time=${options.departure_time}`;
    if (options?.arrival_time) url += `&arrival_time=${options.arrival_time}`;
    if (options?.traffic_model)
      url += `&traffic_model=${options.traffic_model}`;
    if (options?.transit_mode) url += `&transit_mode=${options.transit_mode}`;
    if (options?.transit_routing_preference)
      url += `&transit_routing_preference=${options.transit_routing_preference}`;
    if (options?.optimize_waypoints)
      url += `&optimize_waypoints=${options.optimize_waypoints}`;

    const cacheKey = this.normalizeKey(
      'directions',
      origin,
      destination,
      options?.mode || 'default',
      options?.alternatives ? 'alt' : 'direct',
    );

    const data = await this.getCached<any>(url, cacheKey, this.TTLs.short);

    // Sauvegarder en base de données
    if (saveToDatabase && data?.routes?.[0]) {
      const route = data.routes[0];
      const leg = route.legs[0];

      if (leg) {
        await this.addressService.saveOrUpdateDirection({
          origin_address: origin,
          destination_address: destination,
          origin_normalized: normalizedOrigin,
          destination_normalized: normalizedDestination,
          distance_meters: leg.distance.value,
          duration_seconds: leg.duration.value,
          polyline: route.overview_polyline.points,
          start_address: leg.start_address,
          end_address: leg.end_address,
          full_route: route,
          status: data.status,
        } as any);
        this.logger.log(
          `Directions saved to database for "${origin}" -> "${destination}"`,
        );
      }
    }

    return data;
  }

  // Méthodes utilitaires pour formater les distances et durées
  private formatDistance(meters: number): string {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${meters} m`;
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours} h ${minutes} min`;
    }
    return `${minutes} min`;
  }

  // =====================================
  // Place Details
  // =====================================
  // google-maps.service.ts
  async getPlaceDetails(
    placeId: string,
    saveToDatabase: boolean = true,
    options?: {
      language?: string;
      fields?: string;
      region?: string;
      sessiontoken?: string;
      clientIp?: string; // 👈 AJOUTER L'IP
    },
  ) {
    // 🔍 ÉTAPE 1: Chercher d'abord dans la base de données
    this.logger.log(`Searching in database for place_id: "${placeId}"`);
    const existingAddress = await this.addressService.findByPlaceId(placeId);

    if (existingAddress) {
      this.logger.log(`Place found in database for place_id: "${placeId}"`);
      await this.addressService.incrementRequestCount(existingAddress.id);

      const result = {
        formatted_address: existingAddress.formatted_address,
        geometry: existingAddress.geometry,
        name: existingAddress.name,
        place_id: existingAddress.place_id,
        types: existingAddress.types || [],
        icon: existingAddress.icon,
        icon_background_color: existingAddress.icon_background_color,
        icon_mask_base_uri: existingAddress.icon_mask_base_uri,
        photos: existingAddress.photos || [],
        reference: existingAddress.reference,
        address_components: existingAddress.address_components,
        adr_address: existingAddress.adr_address,
        business_status: existingAddress.business_status,
        current_opening_hours: existingAddress.current_opening_hours,
        formatted_phone_number: existingAddress.formatted_phone_number,
        international_phone_number: existingAddress.international_phone_number,
        opening_hours: existingAddress.opening_hours,
        price_level: existingAddress.price_level,
        rating: existingAddress.rating,
        user_ratings_total: existingAddress.user_ratings_total,
        website: existingAddress.website,
        utc_offset: existingAddress.utc_offset,
        vicinity: existingAddress.vicinity,
        wheelchair_accessible_entrance:
          existingAddress.wheelchair_accessible_entrance,
        fromDatabase: true,
      };

      return this.wrapGoogleResponse([result], [], 'OK');
    }

    // 🌐 ÉTAPE 2: Appeler Google API
    this.logger.log(`Calling Google API for place_id: "${placeId}"`);

    let url = `${this.urls.placeDetails}?place_id=${placeId}&key=${this.apiKey}`;

    // 🎯 DÉTECTION DYNAMIQUE DE LA RÉGION VIA IP
    let regionToUse = options?.region;

    // Si aucune région fournie, essayer de détecter via l'IP
    if (!regionToUse && options?.clientIp) {
      const ipRegion = await this.getRegionFromIp(options.clientIp);
      if (ipRegion) {
        regionToUse = ipRegion;
        this.logger.log(
          `🌍 Region detected from IP ${options.clientIp}: ${regionToUse}`,
        );
      }
    }

    if (options?.language) url += `&language=${options.language}`;
    if (options?.fields) {
      url += `&fields=${options.fields}`;
    } else {
      url += `&fields=formatted_address,geometry,name,place_id,types,icon,photos,address_components,formatted_phone_number,international_phone_number,opening_hours,rating,user_ratings_total,website,utc_offset,vicinity,price_level,business_status`;
    }
    if (regionToUse) url += `&region=${regionToUse}`;
    if (options?.sessiontoken) url += `&sessiontoken=${options.sessiontoken}`;

    this.logger.debug(
      `Place Details URL: ${url.replace(this.apiKey, 'HIDDEN')}`,
    );

    const cacheKey = this.normalizeKey(
      'place',
      placeId,
      options?.language || 'default',
      options?.fields || 'default',
      regionToUse || 'default',
    );
    const data = await this.getCached<any>(url, cacheKey, this.TTLs.long);

    const result = data?.result;
    if (!result) return this.wrapGoogleResponse([], [], 'NOT_FOUND');

    const placeData = {
      formatted_address: result.formatted_address,
      geometry: result.geometry,
      name: result.name,
      place_id: result.place_id,
      types: result.types,
      icon: result.icon,
      icon_background_color: result.icon_background_color,
      icon_mask_base_uri: result.icon_mask_base_uri,
      photos: result.photos || [],
      reference: result.reference,
      address_components: result.address_components,
      adr_address: result.adr_address,
      business_status: result.business_status,
      current_opening_hours: result.current_opening_hours,
      formatted_phone_number: result.formatted_phone_number,
      international_phone_number: result.international_phone_number,
      opening_hours: result.opening_hours,
      price_level: result.price_level,
      rating: result.rating,
      user_ratings_total: result.user_ratings_total,
      website: result.website,
      utc_offset: result.utc_offset,
      vicinity: result.vicinity,
      wheelchair_accessible_entrance: result.wheelchair_accessible_entrance,
      reviews: result.reviews,
      fromDatabase: false,
    };

    // 💾 Sauvegarder en base de données
    if (saveToDatabase && result) {
      try {
        const latitude = result.geometry?.location?.lat;
        const longitude = result.geometry?.location?.lng;

        await this.addressService.saveOrUpdateAddress({
          place_id: result.place_id,
          formatted_address: result.formatted_address,
          name: result.name,
          types: result.types,
          geometry: result.geometry,
          latitude: latitude,
          longitude: longitude,
          street_number: this.getAddressComponentFromDetails(
            result,
            'street_number',
          ),
          route: this.getAddressComponentFromDetails(result, 'route'),
          locality: this.getAddressComponentFromDetails(result, 'locality'),
          administrative_area_level_1: this.getAddressComponentFromDetails(
            result,
            'administrative_area_level_1',
          ),
          administrative_area_level_2: this.getAddressComponentFromDetails(
            result,
            'administrative_area_level_2',
          ),
          country: this.getAddressComponentFromDetails(result, 'country'),
          postal_code: this.getAddressComponentFromDetails(
            result,
            'postal_code',
          ),
          icon: result.icon,
          photos: result.photos,
          rating: result.rating,
          user_ratings_total: result.user_ratings_total,
          formatted_phone_number: result.formatted_phone_number,
          website: result.website,
          opening_hours: result.opening_hours,
          price_level: result.price_level,
        });
        this.logger.log(
          `Place details saved to database for place_id: "${placeId}"`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to save place details to database: ${error.message}`,
        );
      }
    }

    return this.wrapGoogleResponse(
      [placeData],
      data.html_attributions || [],
      data.status || 'OK',
    );
  }

  /**
   * Récupère le code pays à partir de l'IP
   */
  private async getRegionFromIp(ip: string): Promise<string | null> {
    // Ignorer les IPs locales
    if (
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip.startsWith('192.168.') ||
      ip.startsWith('10.')
    ) {
      return null;
    }

    try {
      // Utiliser l'API Google Maps Geocoding avec l'IP
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${ip}&key=${this.apiKey}`;
      const response = await firstValueFrom(this.httpService.get(url));

      if (response.data.results && response.data.results.length > 0) {
        const countryComponent =
          response.data.results[0].address_components?.find((c: any) =>
            c.types.includes('country'),
          );
        if (countryComponent) {
          const countryCode = countryComponent.short_name.toLowerCase();
          this.logger.log(`IP ${ip} detected country: ${countryCode}`);
          return countryCode;
        }
      }
      return null;
    } catch (error) {
      this.logger.error(`Failed to get region from IP ${ip}: ${error.message}`);
      return null;
    }
  }

  // =====================================
  // Autocomplete
  // =====================================
  async autocomplete(
    input: string,
    saveToDatabase: boolean = true,
    options?: {
      language?: string;
      components?: string;
      types?: string;
      radius?: number;
      location?: string;
      strictbounds?: boolean;
      offset?: number;
      origin?: string;
      sessiontoken?: string;
    },
  ) {
    this.logger.log(`Searching in database for autocomplete: "${input}"`);
    const dbResults = await this.addressService.searchAddressesByInput(input);

    let results: any[] = [];

    if (dbResults && dbResults.length > 0) {
      this.logger.log(
        `Found ${dbResults.length} addresses in database for "${input}"`,
      );
      results = dbResults.slice(0, 5).map((address: any) => ({
        description: address.formatted_address,
        place_id: address.place_id,
        types: address.types || [],
        fromDatabase: true,
        structured_formatting: {
          main_text: address.name || address.formatted_address,
          secondary_text: address.locality || address.country,
        },
        terms: [
          { offset: 0, value: address.name || address.formatted_address },
          { offset: address.name?.length || 0, value: address.locality },
        ].filter((term) => term.value),
        location: {
          lat: address.latitude,
          lng: address.longitude,
        },
      }));
    } else {
      this.logger.log(`Calling Google API for autocomplete: "${input}"`);

      let url = `${this.urls.autocomplete}?input=${encodeURIComponent(input)}&key=${this.apiKey}`;

      if (options?.language) url += `&language=${options.language}`;
      if (options?.components) url += `&components=${options.components}`;
      if (options?.types) url += `&types=${options.types}`;
      if (options?.radius) url += `&radius=${options.radius}`;
      if (options?.location) url += `&location=${options.location}`;
      if (options?.strictbounds) url += `&strictbounds=${options.strictbounds}`;
      if (options?.offset) url += `&offset=${options.offset}`;
      if (options?.origin) url += `&origin=${options.origin}`;
      if (options?.sessiontoken) url += `&sessiontoken=${options.sessiontoken}`;

      const cacheKey = this.normalizeKey(
        'autocomplete',
        input,
        options?.language || 'default',
        options?.components || 'default',
      );
      const data = await this.getCached<any>(url, cacheKey, this.TTLs.short);

      results = (data.predictions || []).slice(0, 5).map((r: any) => ({
        description: r.description,
        place_id: r.place_id,
        types: r.types,
        structured_formatting: r.structured_formatting,
        terms: r.terms,
        matched_substrings: r.matched_substrings,
        fromDatabase: false,
      }));
    }

    if (
      saveToDatabase &&
      input &&
      input.trim().length >= 3 &&
      results.length > 0
    ) {
      try {
        if (this.searchHistoryService) {
          const placeId = results[0].place_id || undefined;
          await this.searchHistoryService.saveOrUpdateSearch(
            input,
            results[0].description,
            placeId,
          );
          this.logger.log(`Search term "${input}" saved to search history`);
        }
      } catch (error) {
        this.logger.error(`Failed to save search history: ${error.message}`);
      }
    }

    return this.wrapGoogleResponse(results, [], 'OK');
  }

  // =====================================
  // Reverse Geocode
  // =====================================
  async reverseGeocode(
    latitude: number,
    longitude: number,
    language: string = 'fr',
    saveToDatabase: boolean = true,
    options?: {
      resultType?: string;
      locationType?: string;
    },
  ) {
    this.logger.log(
      `Searching in database for coordinates (${latitude}, ${longitude})`,
    );
    const existingAddress = await this.addressService.findByCoordinates(
      latitude,
      longitude,
    );

    if (existingAddress) {
      this.logger.log(
        `Address found in database for (${latitude}, ${longitude})`,
      );
      await this.addressService.incrementRequestCount(existingAddress.id);

      const result = {
        formatted_address: existingAddress.formatted_address,
        latitude: existingAddress.latitude,
        longitude: existingAddress.longitude,
        place_id: existingAddress.place_id,
        types: existingAddress.types || [],
        address_components: null,
        street_number: existingAddress.street_number,
        route: existingAddress.route,
        locality: existingAddress.locality,
        administrative_area_level_1:
          existingAddress.administrative_area_level_1,
        administrative_area_level_2:
          existingAddress.administrative_area_level_2,
        country: existingAddress.country,
        postal_code: existingAddress.postal_code,
        geometry: existingAddress.geometry,
        name: existingAddress.name,
        fromDatabase: true,
      };

      return this.wrapGoogleResponse([result], [], 'OK');
    }

    this.logger.log(
      `Address not found in database, calling Google API for (${latitude}, ${longitude})`,
    );

    let url = `${this.urls.geocode}?latlng=${latitude},${longitude}&key=${this.apiKey}&language=${language}`;

    if (options?.resultType) {
      url += `&result_type=${options.resultType}`;
    }
    if (options?.locationType) {
      url += `&location_type=${options.locationType}`;
    }

    const cacheKey = this.normalizeKey(
      'geocode',
      `${latitude}`,
      `${longitude}`,
      language,
      options?.resultType || 'default',
      options?.locationType || 'default',
    );

    const data = await this.getCached<any>(url, cacheKey, this.TTLs.long);

    if (!data.results || data.results.length === 0) {
      return this.wrapGoogleResponse([], [], 'NOT_FOUND');
    }

    const results = data.results.map((result: any) => ({
      address_components: result.address_components,
      formatted_address: result.formatted_address,
      geometry: result.geometry,
      place_id: result.place_id,
      plus_code: result.plus_code,
      types: result.types,
      latitude: latitude,
      longitude: longitude,
      fromDatabase: false,
      street_number: this.getAddressComponent(result, 'street_number'),
      route: this.getAddressComponent(result, 'route'),
      locality: this.getAddressComponent(result, 'locality'),
      administrative_area_level_1: this.getAddressComponent(
        result,
        'administrative_area_level_1',
      ),
      administrative_area_level_2: this.getAddressComponent(
        result,
        'administrative_area_level_2',
      ),
      country: this.getAddressComponent(result, 'country'),
      postal_code: this.getAddressComponent(result, 'postal_code'),
      name: result.name,
    }));

    if (saveToDatabase && results[0]) {
      try {
        await this.addressService.saveOrUpdateAddress({
          latitude,
          longitude,
          formatted_address: results[0].formatted_address,
          place_id: results[0].place_id,
          street_number: results[0].street_number,
          route: results[0].route,
          locality: results[0].locality,
          administrative_area_level_1: results[0].administrative_area_level_1,
          administrative_area_level_2: results[0].administrative_area_level_2,
          country: results[0].country,
          postal_code: results[0].postal_code,
          geometry: results[0].geometry,
          name: results[0].name,
          types: results[0].types,
        });
        this.logger.log(
          `Address saved to database for (${latitude}, ${longitude})`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to save address to database: ${error.message}`,
        );
      }
    }

    return this.wrapGoogleResponse(
      results,
      data.html_attributions || [],
      data.status || 'OK',
    );
  }

  // =====================================
  // Méthodes utilitaires
  // =====================================
  async getAddressFromCoordinates(
    latitude: number,
    longitude: number,
    language: string = 'fr',
    saveToDatabase: boolean = true,
  ) {
    const response = await this.reverseGeocode(
      latitude,
      longitude,
      language,
      saveToDatabase,
    );

    if (!response.results || response.results.length === 0) {
      return {
        address: null,
        latitude,
        longitude,
        error: 'No address found for these coordinates',
      };
    }

    const mainResult = response.results[0];
    return {
      address: mainResult.formatted_address,
      latitude,
      longitude,
      placeId: mainResult.place_id,
      fromDatabase: mainResult.fromDatabase || false,
      components: {
        street: mainResult.route
          ? `${mainResult.street_number ? mainResult.street_number + ' ' : ''}${mainResult.route}`
          : null,
        city: mainResult.locality,
        state: mainResult.administrative_area_level_1,
        country: mainResult.country,
        postalCode: mainResult.postal_code,
      },
      fullDetails: mainResult,
    };
  }

  private getAddressComponent(result: any, type: string): string | null {
    const component = result.address_components?.find((comp: any) =>
      comp.types.includes(type),
    );
    return component ? component.long_name : null;
  }

  private getAddressComponentFromDetails(
    result: any,
    type: string,
  ): string | undefined {
    const component = result.address_components?.find((comp: any) =>
      comp.types.includes(type),
    );
    return component ? component.long_name : undefined;
  }
}
