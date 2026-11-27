import { Body, Controller, Delete, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { AuthentificationGuard } from 'src/users/utility/guards/authentification.guard';
import { RolesGuard } from 'src/users/utility/decorators/roles.guard';
import { Roles } from 'src/users/utility/decorators/roles.decorator';
import { CompanyCapabilitiesService } from './company-capabilities.service';
import { UpdateTypeConfigDto } from './type-capabilities.dto';

/**
 * Configuration dynamique des capacités PAR TYPE d'entreprise (back-office).
 * Réservé au SUPER_ADMIN. Les changements prennent effet immédiatement (cache invalidé).
 */
@Controller('admin/type-capabilities')
@UseGuards(AuthentificationGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class TypeCapabilitiesController {
  constructor(private readonly capabilities: CompanyCapabilitiesService) {}

  /** Tous les types + capacités effectives */
  @Get()
  list() {
    return this.capabilities.listAll();
  }

  /** Détail d'un type (défauts + surcharge + effectif) */
  @Get(':type')
  getOne(@Param('type') type: string) {
    return this.capabilities.getOne(type);
  }

  /** Modifier les interrupteurs d'un type (effet immédiat) */
  @Patch(':type')
  update(@Param('type') type: string, @Body() dto: UpdateTypeConfigDto) {
    return this.capabilities.updateConfig(type, dto as any);
  }

  /** Revenir aux défauts du code pour ce type */
  @Delete(':type')
  reset(@Param('type') type: string) {
    return this.capabilities.resetConfig(type);
  }
}
