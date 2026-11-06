import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AuditAction } from 'src/audit/decorator/audit.decorator';
import { ActionType } from 'src/audit/enum/action-type.enum';
import { ClassifiedService } from './services/classified.service';
import { ClassifiedPaymentService } from './services/classified-payment.service';
import { langFrom } from './services/classified-common.service';
import { CreateClassifiedDto, MyClassifiedsQueryDto, PayClassifiedDto, ReportClassifiedDto, UpdateClassifiedDto } from './dto/classified.dto';

const MAX_FILES = Number(process.env.CLASSIFIED_MAX_IMAGES || 10);

/**
 * Annonces (type Jiji) — espace de l'annonceur. Tout utilisateur connecté peut publier, sans entreprise.
 * Une annonce est une ligne de la table `products` (listingType = CLASSIFIED) : l'id d'annonce = l'id produit.
 * Favoris : wishlist existante (POST /products/add/new/wishlist, GET /products/get/wishlist).
 * Préfixe : /classifieds
 */
@Controller('classifieds')
@UseGuards(AuthentificationGuard)
export class ClassifiedsController {
  constructor(
    private readonly ads: ClassifiedService,
    private readonly payments: ClassifiedPaymentService,
  ) { }

  /** Créer une annonce (multipart : champs + images[]) — reste en brouillon jusqu'au paiement */
  @Post()
  @AuditAction(ActionType.CREATE, 'classified')
  @UseInterceptors(FilesInterceptor('images', MAX_FILES))
  create(
    @Req() req: Request,
    @Body() dto: CreateClassifiedDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: UserEntity,
  ) {
    return this.ads.create(dto, files, user, langFrom(req));
  }

  @Get('mine')
  mine(@Req() req: Request, @Query() query: MyClassifiedsQueryDto, @CurrentUser() user: UserEntity) {
    return this.ads.mine(query, user, langFrom(req));
  }

  @Get('mine/:id')
  myAd(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.ads.myAdDetails(id, user, langFrom(req));
  }

  /** Statut d'un paiement (Mobile Money en attente de confirmation) */
  @Get('payments/:paymentId')
  paymentStatus(@Req() req: Request, @Param('paymentId', ParseUUIDPipe) paymentId: string, @CurrentUser() user: UserEntity) {
    return this.payments.checkStatus(paymentId, user, langFrom(req));
  }

  /** Modifier (multipart : champs + nouvelles images[], removeImageIds, imageOrder) */
  @Patch(':id')
  @AuditAction(ActionType.UPDATE, 'classified')
  @UseInterceptors(FilesInterceptor('images', MAX_FILES))
  update(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClassifiedDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: UserEntity,
  ) {
    return this.ads.update(id, dto, files, user, langFrom(req));
  }

  @Delete(':id/images/:imageId')
  removeImage(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseIntPipe) imageId: number,
    @CurrentUser() user: UserEntity,
  ) {
    return this.ads.removeImage(id, imageId, user, langFrom(req));
  }

  /** Payer la publication / le renouvellement selon le tarif de la ville */
  @Post(':id/pay')
  @AuditAction(ActionType.CREATE, 'classified_payment')
  pay(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PayClassifiedDto, @CurrentUser() user: UserEntity) {
    return this.payments.pay(id, dto, user, langFrom(req));
  }

  @Patch(':id/sold')
  @AuditAction(ActionType.UPDATE, 'classified')
  sold(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.ads.markSold(id, user, langFrom(req));
  }

  @Patch(':id/close')
  @AuditAction(ActionType.UPDATE, 'classified')
  close(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.ads.close(id, user, langFrom(req));
  }

  @Delete(':id')
  @AuditAction(ActionType.DELETE, 'classified')
  remove(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: UserEntity) {
    return this.ads.remove(id, user, langFrom(req));
  }

  @Post(':id/report')
  report(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReportClassifiedDto, @CurrentUser() user: UserEntity) {
    return this.ads.report(id, dto, user, langFrom(req));
  }
}
