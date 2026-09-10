import { Shipment } from 'src/shipment/entity/shipment.entity';

export class ShipmentAmountUtil {
  /**
   * Calcule le montant comptable d'un shipment
   * Règle métier :
   * shippingPrice + deliveryPrice
   */
  static calculate(shipment: Shipment): number {
    return (shipment.shippingPrice || 0) + (shipment.deliveryPrice || 0);
  }
}
