import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
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

  /**
   * ✅ Jours réservés (AAAA-MM-JJ) quand ils ne se suivent pas (ex. dimanches exclus).
   *    Absent = période complète [startDate, endDate]. Seuls ces jours sont facturés.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(180)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true })
  dates?: string[];
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
