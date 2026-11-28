import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { CurrentUser } from 'src/users/utility/decorators/current-user-decorator';
import { UserEntity } from 'src/users/entities/user.entity';
import { AtelierService } from './atelier.service';
import {
  CommissionPreviewDto,
  QuoteDto,
  UpsertSizeTierDto,
} from './dto/atelier.dto';

/**
 * 🧵 Atelier de couture — réglages de l'entreprise (atelier) et devis.
 * Portée : entreprise active de l'utilisateur (user.activeCompanyId).
 */
@Controller('atelier')
@UseGuards(AuthentificationGuard)
export class AtelierController {
  constructor(private readonly atelier: AtelierService) {}

  private companyId(user: UserEntity): string {
    const id = (user as any).activeCompanyId;
    if (!id) throw new BadRequestException("Aucune entreprise active : impossible de déterminer l'atelier");
    return id;
  }

  // ---- Paliers de taille ----
  @Get('size-tiers')
  listTiers(@CurrentUser() user: UserEntity, @Query('productId') productId?: string) {
    return this.atelier.listSizeTiers(this.companyId(user), productId);
  }

  @Post('size-tiers')
  createTier(@Body() dto: UpsertSizeTierDto, @CurrentUser() user: UserEntity) {
    return this.atelier.createSizeTier(this.companyId(user), dto);
  }

  @Patch('size-tiers/:id')
  updateTier(@Param('id') id: string, @Body() dto: UpsertSizeTierDto, @CurrentUser() user: UserEntity) {
    return this.atelier.updateSizeTier(this.companyId(user), id, dto);
  }

  @Delete('size-tiers/:id')
  deleteTier(@Param('id') id: string, @CurrentUser() user: UserEntity) {
    return this.atelier.deleteSizeTier(this.companyId(user), id);
  }

  // ---- Devis (prix selon taille) + aperçu commission ----
  /** Calcule le prix d'une commande selon les mesures, avant de la passer. */
  @Post('quote')
  quote(@Body() dto: QuoteDto, @CurrentUser() user: UserEntity) {
    return this.atelier.quote(this.companyId(user), dto);
  }

  /** Aperçu de la part plateforme / part atelier pour un montant de confection. */
  @Post('commission/preview')
  commissionPreview(@Body() dto: CommissionPreviewDto, @CurrentUser() user: UserEntity) {
    return this.atelier.previewCommission(this.companyId(user), dto);
  }

  /** Répartition enregistrée d'une commande (part plateforme / part atelier). */
  @Get('orders/:orderId/charge')
  orderCharge(@Param('orderId') orderId: string) {
    return this.atelier.getOrderCharge(orderId);
  }
}
