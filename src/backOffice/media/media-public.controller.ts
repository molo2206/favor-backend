import { Controller, Get, Param, ParseUUIDPipe, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { langFrom } from 'src/backOffice/logistics/common/logistics-access';
import { MediaCatalogService } from './services/media-catalog.service';
import { MediaLibraryService } from './services/media-library.service';

/**
 * Média — routes publiques (sans connexion) pour le site / l'app :
 *  - portfolio et prestations d'une entreprise ;
 *  - galerie de livraison d'un client (lien privé avec jeton).
 * Préfixe : /media/public
 */
@Controller('media/public')
export class MediaPublicController {
  constructor(
    private readonly catalog: MediaCatalogService,
    private readonly library: MediaLibraryService,
  ) { }

  @Get('portfolio/:companyId')
  portfolio(
    @Req() req: Request,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('tag') tag?: string,
    @Query('type') type?: string,
  ) {
    return this.library.portfolio(companyId, langFrom(req), page, limit, tag, type);
  }

  @Get('services/:companyId')
  services(@Req() req: Request, @Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.catalog.publicServices(companyId, langFrom(req));
  }

  @Get('delivery/:token')
  delivery(@Req() req: Request, @Param('token') token: string) {
    return this.library.delivery(token, langFrom(req));
  }
}
