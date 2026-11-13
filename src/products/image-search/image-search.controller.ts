// src/products/image-search/image-search.controller.ts
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from 'src/users/utility/decorators/public.decorator';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { langFrom } from 'src/backOffice/logistics/common/logistics-access';
import { ImageSearchService } from './image-search.service';

export const imageSearchUpload = FileInterceptor('image', { limits: { fileSize: 15 * 1024 * 1024 } });

/** Adresse IP réelle (derrière Apache / proxy) */
export function clientIp(req: Request): string {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || (req as any).ip || (req.socket as any)?.remoteAddress || 'unknown';
}

/** Filtres communs (query string ou champs du formulaire multipart) */
export function imageSearchOptions(req: Request, body: any = {}) {
  const q: any = { ...(body || {}), ...(req.query || {}) };
  const num = (v: any) => (v === undefined || v === null || v === '' ? undefined : Number(v));
  return {
    page: num(q.page),
    limit: num(q.limit),
    minScore: num(q.minScore),
    q: q.q ? String(q.q).slice(0, 200) : undefined,
    categoryId: q.categoryId || undefined,
    companyId: q.companyId || undefined,
    brandId: q.brandId || undefined,
    minPrice: num(q.minPrice),
    maxPrice: num(q.maxPrice),
    ip: clientIp(req),
  };
}

/**
 * ✅ RECHERCHE PAR IMAGE
 *  POST /image-search                   (public) multipart « image » + filtres :
 *                                       q, categoryId, companyId, brandId, minPrice, maxPrice, minScore, page, limit
 *  GET  /image-search/status            (admin) état de l'index (empreintes, embeddings, IA)
 *  POST /image-search/reindex           (admin) indexer tout maintenant { full?: true = tout recalculer }
 *
 *  L'ancienne route POST /products/image/search-by-image utilise le même moteur.
 */
@ApiTags('Recherche par image')
@Controller('image-search')
export class ImageSearchController {
  constructor(private readonly service: ImageSearchService) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(imageSearchUpload)
  search(@Req() req: Request, @UploadedFile() file: Express.Multer.File, @Body() body: any) {
    return this.service.search(file, imageSearchOptions(req, body), langFrom(req));
  }

  @Get('status')
  @ApiBearerAuth()
  @UseGuards(AuthentificationGuard)
  status(@Req() req: Request, @CurrentUser() user: UserEntity) {
    return this.service.status(user, langFrom(req));
  }

  @Post('reindex')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthentificationGuard)
  reindex(@Req() req: Request, @CurrentUser() user: UserEntity, @Body('full') full?: boolean | string, @Query('full') fullQ?: string) {
    const isFull = full === true || full === 'true' || fullQ === 'true';
    return this.service.reindex(user, isFull, langFrom(req));
  }
}
