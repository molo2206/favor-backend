import {
  Controller,
  Get,
  Query,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { GoogleService } from './google-maps.service';

@Controller('maps')
export class GoogleMapsController {
  constructor(private readonly googleService: GoogleService) { }

  @Get('autocomplete')
  async autocomplete(
    @Query('input') input: string,
    @Query('language') language?: string,
    @Query('components') components?: string,
    @Query('types') types?: string,
    @Query('radius') radius?: string,
    @Query('location') location?: string,
  ) {
    if (!input) throw new BadRequestException('Le paramètre input est requis');

    const data = await this.googleService.autocomplete(input, true, {
      language,
      components,
      types,
      radius: radius ? parseInt(radius) : undefined,
      location,
    });
    return { message: 'Suggestions récupérées avec succès', data };
  }

  // google-maps.controller.ts
  @Get('place-details')
  async getPlaceDetails(
    @Req() request: Request,
    @Query('placeId') placeId: string,
    @Query('language') language?: string,
    @Query('fields') fields?: string,
    @Query('region') region?: string,
  ) {
    if (!placeId)
      throw new BadRequestException('Le paramètre placeId est requis');

    const clientIp = this.getClientIp(request);

    console.log(`[PlaceDetails] IP: ${clientIp}, PlaceId: ${placeId}`);

    const data = await this.googleService.getPlaceDetails(placeId, true, {
      language: language || 'fr',
      fields,
      region: region, // La région peut être forcée par l'utilisateur
      clientIp: clientIp, // Passer l'IP pour la détection
    });

    return {
      message: 'Détails du lieu récupérés avec succès',
      client_ip: clientIp,
      region_used: region || 'auto-detected',
      data,
    };
  }
  private getClientIp(request: Request): string {
    // 1. Vérifier x-forwarded-for (proxy, load balancer)
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded : forwarded.split(',');
      const clientIp = ips[0].trim();
      if (clientIp && clientIp !== 'unknown') {
        return clientIp;
      }
    }

    // 2. Vérifier x-real-ip (nginx)
    const realIp = request.headers['x-real-ip'];
    if (realIp && typeof realIp === 'string' && realIp !== 'unknown') {
      return realIp;
    }

    // 3. Vérifier cf-connecting-ip (Cloudflare)
    const cfIp = request.headers['cf-connecting-ip'];
    if (cfIp && typeof cfIp === 'string') {
      return cfIp;
    }

    // 4. Utiliser la connexion (express)
    const connection = (request as any).connection;
    if (connection && connection.remoteAddress) {
      let ip = connection.remoteAddress;
      // Nettoyer l'IP (enlever ::ffff: si présent)
      if (ip === '::1') ip = '127.0.0.1';
      if (ip && ip.startsWith('::ffff:')) ip = ip.substring(7);
      return ip;
    }

    // 5. Fallback
    return '0.0.0.0';
  }
  @Get('search')
  async searchPlaces(
    @Req() request: Request,
    @Query('query') query: string,
    @Query('location') location?: string,
    @Query('radius') radius?: number,
    @Query('region') region?: string,
    @Query('save') save?: string,
    @Query('types') types?: string,          // ✅ nouveau paramètre
    @Query('language') language?: string,
  ) {
    if (!query) throw new BadRequestException('Le paramètre query est requis');

    const clientIp = this.getClientIp(request);
    const effectiveType = types ;   // priorité à 'types'

    const results = await this.googleService.searchPlaces(query, {
      location,
      radius,
      region,
      language: language || 'fr',
      types: effectiveType,
      saveToDatabase: save !== 'false',
      clientIp,
    });

    return {
      message: 'Résultats récupérés avec succès',
      client_ip: clientIp,
      location_detected: !location ? 'auto' : 'manual',
      saved: save !== 'false',
      count: results.results.length,
      data: results,
      filters: {
        type: effectiveType || 'any',
        language: language || 'fr',
      },
    };
  }
  @Get('distance')
  async getDistance(
    @Query('origin') origin: string,
    @Query('destination') destination: string,
    @Query('mode') mode?: string,
    @Query('language') language?: string,
  ) {
    if (!origin || !destination) {
      throw new BadRequestException(
        'Les paramètres origin et destination sont requis',
      );
    }

    const data = await this.googleService.getDistance(
      origin,
      destination,
      true,
      {
        mode,
        language,
      },
    );
    return { message: 'Distance calculée avec succès', data };
  }

  @Get('directions')
  async getDirections(
    @Query('origin') origin: string,
    @Query('destination') destination: string,
    @Query('mode') mode?: string,
    @Query('language') language?: string,
    @Query('alternatives') alternatives?: string,
  ) {
    if (!origin || !destination) {
      throw new BadRequestException(
        'Les paramètres origin et destination sont requis',
      );
    }

    const data = await this.googleService.getDirections(
      origin,
      destination,
      true,
      {
        mode,
        language,
        alternatives: alternatives === 'true',
      },
    );
    return { message: 'Itinéraire récupéré avec succès', data };
  }

  @Get('reverse-geocode')
  async reverseGeocode(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('language') language?: string,
    @Query('result_type') resultType?: string,
    @Query('location_type') locationType?: string,
  ) {
    if (!lat || !lng) {
      throw new BadRequestException('Les paramètres lat et lng sont requis');
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
      throw new BadRequestException(
        'lat et lng doivent être des nombres valides',
      );
    }

    const data = await this.googleService.reverseGeocode(
      latitude,
      longitude,
      language || 'fr',
      true,
      { resultType, locationType },
    );
    return {
      message: 'Adresse récupérée avec succès',
      data,
    };
  }
}
