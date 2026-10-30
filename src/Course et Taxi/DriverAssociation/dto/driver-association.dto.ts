import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { DriverType } from '../entity/driver-profile.entity';

const toBool = ({ value }: { value: any }) => (value === 'true' || value === '1' ? true : value === 'false' || value === '0' ? false : value);
const toNum = ({ value }: { value: any }) => (value === '' || value === null || value === undefined ? undefined : Number(value));

export class CreateDriverAssociationDto {
  @IsString() @MinLength(2) @MaxLength(150) name: string;
  @IsOptional() @IsString() @MaxLength(30) code?: string;
  @IsOptional() @IsUUID() cityId?: string;
  @IsOptional() @IsString() @MaxLength(150) managerName?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsEmail() @MaxLength(150) email?: string;
  @IsOptional() @IsString() @MaxLength(255) address?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  /** Part de l'association sur chaque course d'un membre (% du prix) */
  @IsOptional() @Transform(toNum) @IsNumber() @Min(0) @Max(100) commissionRate?: number;
  @IsOptional() @Transform(toBool) @IsBoolean() isActive?: boolean;
}

export class UpdateDriverAssociationDto extends PartialType(CreateDriverAssociationDto) { }

export class DriverAssociationQueryDto {
  @IsOptional() @IsUUID() cityId?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsIn(['true', 'false', 'all']) active?: 'true' | 'false' | 'all';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

/** Admin : statut d'un chauffeur — { type: PRIVATE } ou { type: ASSOCIATION, associationId } */
export class SetDriverTypeDto {
  @IsEnum(DriverType) type: DriverType;
  @ValidateIf((o) => o.type === DriverType.ASSOCIATION) @IsUUID() associationId?: string;
  @IsOptional() @IsString() @MaxLength(50) memberNumber?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class AssociationDriversQueryDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class AssociationStatsQueryDto {
  /** Période (YYYY-MM-DD) ; défaut : 30 derniers jours */
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}
