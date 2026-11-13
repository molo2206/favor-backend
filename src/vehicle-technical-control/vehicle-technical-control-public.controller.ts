import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { VehicleTechnicalControlService } from './vehicle-technical-control.service';

/**
 * ✅ Consultation PUBLIQUE des contrôles techniques d'un véhicule (sans authentification).
 *    Même base que l'admin mais sous le préfixe `public/`.
 *    Renvoie EXACTEMENT les mêmes détails que la route admin `product/:productId`.
 */
@Controller('vehicle-technical-controls')
export class VehicleTechnicalControlPublicController {
  constructor(private readonly service: VehicleTechnicalControlService) {}

  /** Contrôles techniques d'un véhicule — mêmes détails que la route admin. */
  @Get('public/product/:productId')
  async byVehicle(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.service.getVehicleControls(productId);
  }
}
