import { Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { ClassifiedService } from './services/classified.service';
import { ClassifiedPricingService } from './services/classified-pricing.service';
import { langFrom } from './services/classified-common.service';
import { ClassifiedSearchDto, PricingQueryDto } from './dto/classified.dto';

/**
 * Annonces — accès public (sans connexion). Si un jeton est envoyé, « isFavorite » est renseigné.
 * Préfixe : /classifieds/public
 */
@Controller('classifieds/public')
export class ClassifiedsPublicController {
  constructor(
    private readonly ads: ClassifiedService,
    private readonly pricing: ClassifiedPricingService,
  ) { }

  /** Tarifs de publication pour une ville (et une catégorie) */
  @Get('pricing')
  pricingFor(@Req() req: Request, @Query() query: PricingQueryDto) {
    return this.pricing.publicPricing(query.cityId, query.categoryId, langFrom(req));
  }

  /** Recherche : mot-clé, catégorie (+ sous-catégories), ville, pays, prix, état, tri */
  @Get()
  search(@Req() req: Request, @Query() query: ClassifiedSearchDto, @CurrentUser() user: UserEntity | null) {
    return this.ads.search(query, user, langFrom(req));
  }

  @Get(':id')
  details(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity | null) {
    return this.ads.publicDetails(id, user, langFrom(req));
  }

  /** « Afficher le numéro » : renvoie téléphone / WhatsApp et compte le contact */
  @Post(':id/contact')
  contact(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity | null) {
    return this.ads.contact(id, user, langFrom(req));
  }
}
