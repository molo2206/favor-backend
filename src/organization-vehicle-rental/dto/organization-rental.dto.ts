import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { OrganizationRentalPaymentMethod } from '../enums/organization-rental.enum';

/** Créer une réservation de véhicule pour organisation (aucun paiement déclenché). */
export class CreateOrganizationRentalDto {
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  /** AAAA-MM-JJ */
  @IsString()
  @IsNotEmpty()
  startDate: string;

  /** AAAA-MM-JJ */
  @IsString()
  @IsNotEmpty()
  endDate: string;

  @IsOptional()
  @IsString()
  organizationName?: string;

  /** Organisation locataire (users.id). Par défaut : l'utilisateur connecté. */
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

/** Mettre à jour le statut de la réservation (admin). */
export class UpdateOrganizationRentalStatusDto {
  @IsIn(['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
  status: 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
}

/** Payer APRÈS la prestation. */
export class PayOrganizationRentalDto {
  @IsIn([
    OrganizationRentalPaymentMethod.FPAY,
    OrganizationRentalPaymentMethod.MOBILE_MONEY,
    OrganizationRentalPaymentMethod.CASH,
  ])
  method: OrganizationRentalPaymentMethod;

  /** Mode de paiement enregistré du payeur (UserPaymentMethod.id) */
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;
}

/** Confirmer un paiement FPAY / MOBILE_MONEY (callback du mécanisme de paiement). */
export class ConfirmOrganizationRentalPaymentDto {
  @IsString()
  @IsNotEmpty()
  reference: string;

  @IsOptional()
  @IsString()
  providerReference?: string;
}
