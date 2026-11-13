/**
 * ✅ Mode de paiement que le propriétaire d'un véhicule accepte pour être réglé.
 *  - FPAY         : préciser le numéro F-Pay
 *  - MOBILE_MONEY : préciser le numéro mobile money
 *  - BANK         : préciser le numéro de compte bancaire
 *  - CASH         : espèces (aucun détail requis)
 */
export enum OwnerPaymentMethodType {
  FPAY = 'FPAY',
  MOBILE_MONEY = 'MOBILE_MONEY',
  BANK = 'BANK',
  CASH = 'CASH',
}
