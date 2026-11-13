import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { VehicleTechnicalControlService } from './vehicle-technical-control.service';

/**
 * ✅ Consultation PUBLIQUE de la fiche de contrôle technique d'un véhicule (sans authentification).
 *    Même base que l'admin mais sous le préfixe `public/`. Vue allégée (pas de paiement ni d'ids internes).
 */
@Controller('vehicle-technical-controls')
export class VehicleTechnicalControlPublicController {
  constructor(private readonly service: VehicleTechnicalControlService) {}

  /** Fiche (validée en cours, sinon la plus récente) d'un véhicule. */
  @Get('public/product/:productId')
  async byVehicle(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.service.getPublicVehicleControl(productId);
  }
}
