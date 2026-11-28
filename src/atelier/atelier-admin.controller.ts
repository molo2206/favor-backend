import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { RolesGuard } from 'src/users/utility/decorators/roles.guard';
import { Roles } from 'src/users/utility/decorators/roles.decorator';
import { AtelierService } from './atelier.service';
import { UpsertCommissionDto } from './dto/atelier.dto';

/**
 * 💰 Back-office : taux de commission de la plateforme (atelier de couture et autres types).
 * Réservé au SUPER_ADMIN.
 *   - règle par TYPE (companyType) = défaut appliqué à toutes les entreprises de ce type
 *   - règle par ENTREPRISE (companyId) = surcharge pour un atelier précis
 */
@Controller('admin/atelier/commissions')
@UseGuards(AuthentificationGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class AtelierAdminController {
  constructor(private readonly atelier: AtelierService) {}

  @Get()
  list() {
    return this.atelier.listCommissions();
  }

  /** Créer ou mettre à jour une règle (clé : companyId, ou companyType si companyId vide) */
  @Post()
  upsert(@Body() dto: UpsertCommissionDto) {
    return this.atelier.upsertCommission(dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.atelier.deleteCommission(id);
  }
}
