import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  FleetDocumentType,
  FleetFuelType,
  FleetMaintenanceStatus,
  FleetMaintenanceType,
  FleetMissionStatus,
  FleetMissionType,
  FleetVehicleStatus,
  FleetVehicleType,
} from '../../common/logistics.enums';

// ============================================================
// VÉHICULES
// ============================================================
export class CreateVehicleDto {
  /** Par défaut : l'entreprise active de l'utilisateur */
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() branchId?: string;

  @IsString() @MinLength(2) @MaxLength(30) plateNumber: string;
  @IsString() @MinLength(1) @MaxLength(80) brand: string;
  @IsOptional() @IsString() @MaxLength(80) model?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1950) @Max(2100) year?: number;
  @IsOptional() @IsEnum(FleetVehicleType) type?: FleetVehicleType;
  @IsOptional() @IsEnum(FleetFuelType) fuelType?: FleetFuelType;
  @IsOptional() @IsString() @MaxLength(40) color?: string;
  @IsOptional() @IsString() @MaxLength(50) vin?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) seats?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) capacityKg?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) mileage?: number;
  @IsOptional() @IsUUID() assignedDriverId?: string;
  @IsOptional() @IsDateString() acquisitionDate?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) acquisitionCost?: number;
  @IsOptional() @IsString() @MaxLength(500) photoUrl?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateVehicleDto extends PartialType(CreateVehicleDto) {
  @IsOptional() @IsEnum(FleetVehicleStatus) status?: FleetVehicleStatus;
}

export class AssignDriverDto {
  /** null / absent = retirer le chauffeur */
  @IsOptional() @IsUUID() driverId?: string | null;
}

export class VehicleQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsEnum(FleetVehicleStatus) status?: FleetVehicleStatus;
  @IsOptional() @IsEnum(FleetVehicleType) type?: FleetVehicleType;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}

// ============================================================
// MISSIONS
// ============================================================
export class CreateMissionDto {
  @IsUUID() vehicleId: string;
  @IsOptional() @IsUUID() driverId?: string;
  @IsOptional() @IsEnum(FleetMissionType) type?: FleetMissionType;
  @IsString() @MinLength(3) @MaxLength(255) purpose: string;
  @IsOptional() @IsString() @MaxLength(255) origin?: string;
  @IsOptional() @IsString() @MaxLength(255) destination?: string;
  @IsOptional() @IsDateString() plannedStartAt?: string;
  @IsOptional() @IsDateString() plannedEndAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class StartMissionDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) startMileage?: number;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class CompleteMissionDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) endMileage?: number;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class CancelDto {
  @IsString() @MinLength(3) @MaxLength(500) reason: string;
}

export class MissionQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() vehicleId?: string;
  @IsOptional() @IsUUID() driverId?: string;
  @IsOptional() @IsEnum(FleetMissionStatus) status?: FleetMissionStatus;
  @IsOptional() @IsEnum(FleetMissionType) type?: FleetMissionType;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}

// ============================================================
// CARBURANT
// ============================================================
export class CreateFuelLogDto {
  @IsUUID() vehicleId: string;
  @IsOptional() @IsUUID() driverId?: string;
  @IsOptional() @IsUUID() missionId?: string;
  @IsOptional() @IsDateString() filledAt?: string;
  @Type(() => Number) @IsNumber() @Min(0.01) liters: number;
  @Type(() => Number) @IsNumber() @Min(0) unitPrice: number;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) mileage?: number;
  @IsOptional() @IsString() @MaxLength(150) station?: string;
  @IsOptional() @IsBoolean() fullTank?: boolean;
  @IsOptional() @IsString() @MaxLength(500) receiptUrl?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class FuelQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() vehicleId?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}

// ============================================================
// ENTRETIEN
// ============================================================
export class CreateMaintenanceDto {
  @IsUUID() vehicleId: string;
  @IsOptional() @IsEnum(FleetMaintenanceType) type?: FleetMaintenanceType;
  @IsString() @MinLength(3) @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(150) garage?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) mileage?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) cost?: number;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsDateString() nextDueDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) nextDueMileage?: number;
  /** Le véhicule part au garage tout de suite */
  @IsOptional() @IsBoolean() startNow?: boolean;
}

export class CompleteMaintenanceDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) cost?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) mileage?: number;
  @IsOptional() @IsDateString() nextDueDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) nextDueMileage?: number;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

export class MaintenanceQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() vehicleId?: string;
  @IsOptional() @IsEnum(FleetMaintenanceStatus) status?: FleetMaintenanceStatus;
  @IsOptional() @IsEnum(FleetMaintenanceType) type?: FleetMaintenanceType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}

// ============================================================
// DOCUMENTS
// ============================================================
export class CreateDocumentDto {
  @IsUUID() vehicleId: string;
  @IsEnum(FleetDocumentType) type: FleetDocumentType;
  @IsOptional() @IsString() @MaxLength(100) number?: string;
  @IsOptional() @IsString() @MaxLength(150) issuer?: string;
  @IsOptional() @IsDateString() issueDate?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) cost?: number;
  @IsOptional() @IsString() @MaxLength(500) fileUrl?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class UpdateDocumentDto extends PartialType(CreateDocumentDto) { }

export class DocumentQueryDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() vehicleId?: string;
  @IsOptional() @IsEnum(FleetDocumentType) type?: FleetDocumentType;
  /** Documents qui expirent dans N jours (déjà expirés inclus) */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) expiringInDays?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}
