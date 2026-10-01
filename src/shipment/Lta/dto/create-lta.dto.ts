// src/lta/dto/create-lta.dto.ts
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsDateString,
  IsUUID,
  Min,
  IsArray,
} from 'class-validator';
import { ShipmentStatus } from 'src/shipment/enum/shipment.dto';
import { LtaType, PaymentMode, TransportMode } from '../entity/lta.entity';

export class CreateLtaDto {
  @IsOptional()
  @IsString()
  ltaNumber?: string;

  @IsNotEmpty({ message: 'Le type LTA est requis' })
  @IsEnum(LtaType, { message: 'Type LTA invalide' })
  ltatype: LtaType;

  @IsOptional()
  @IsEnum(TransportMode, { message: 'Mode de transport invalide' })
  type?: TransportMode;

  @IsOptional()
  @IsString()
  airlineOrShipName?: string;

  @IsOptional()
  @IsString()
  originAirportOrPort?: string;

  @IsOptional()
  @IsString()
  destinationAirportOrPort?: string;

  @IsOptional()
  @IsString()
  origin?: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsNotEmpty({ message: "La date d'émission est requise" })
  @IsDateString()
  issueDate: string;

  @IsOptional()
  @IsEnum(ShipmentStatus, { message: 'Statut invalide' })
  status?: ShipmentStatus;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Le poids doit être positif' })
  weight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Le volume doit être positif' })
  volume?: number;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'La valeur doit être positive' })
  value?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  externalLtaNumber?: string;

  @IsOptional()
  @IsString()
  transitAirportOrPort?: string;

  @IsOptional()
  @IsEnum(PaymentMode, { message: 'Mode de paiement invalide' })
  paymentMode?: PaymentMode;

  @IsOptional()
  @IsUUID('4', { message: 'ID expéditeur invalide' })
  shipperId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'ID destinataire invalide' })
  consigneeId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'ID émetteur invalide' })
  Issued_byId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  shipments?: string[]; // tableau d'ID de shipments à lier
}

export class UpdateLtaDto extends CreateLtaDto {
  @IsOptional()
  @IsUUID('4', { message: 'ID LTA invalide' })
  id?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  shipments?: string[]; // tableau optionnel d'ID shipments

  @IsOptional()
  @IsString()
  externalLtaNumber?: string;
}
