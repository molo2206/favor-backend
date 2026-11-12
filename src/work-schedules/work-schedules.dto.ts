// src/work-schedules/work-schedules.dto.ts
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TIME_RE } from './work-schedule.util';

export class WorkScheduleSlotDto {
  /** 1 = lundi … 7 = dimanche */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek: number;

  /** HH:mm */
  @IsString()
  @Matches(TIME_RE)
  startTime: string;

  /** HH:mm (24:00 accepté). Fin <= début : la plage se termine le lendemain */
  @IsString()
  @Matches(TIME_RE)
  endTime: string;
}

/** Programme (entreprise ou individuel) */
export class UpsertWorkScheduleDto {
  /** Entreprise concernée (par défaut : entreprise active). Super Admin : n'importe quelle entreprise */
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  /** Fuseau IANA, ex. Africa/Lubumbashi. Vide = fuseau de l'entreprise */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(240)
  graceMinutes?: number;

  /** Programme de l'entreprise : s'applique aussi aux propriétaires */
  @IsOptional()
  @IsBoolean()
  applyToOwners?: boolean;

  /** Super Admin uniquement : verrouille le programme (l'entreprise ne peut plus le modifier) */
  @IsOptional()
  @IsBoolean()
  isLocked?: boolean;

  @IsOptional()
  @IsDateString()
  validFrom?: string | null;

  @IsOptional()
  @IsDateString()
  validUntil?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @IsArray()
  @ArrayMaxSize(70)
  @ValidateNested({ each: true })
  @Type(() => WorkScheduleSlotDto)
  slots: WorkScheduleSlotDto[];
}

/** Même programme individuel pour plusieurs utilisateurs */
export class BulkUserScheduleDto extends UpsertWorkScheduleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  userIds: string[];
}

export class CompanyQueryDto {
  @IsOptional()
  @IsUUID()
  companyId?: string;
}

export class ScheduleUsersQueryDto extends CompanyQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  /** individual = avec programme individuel ; company = règle de l'entreprise ; exception = dérogation en cours */
  @IsOptional()
  @IsIn(['all', 'individual', 'company', 'exception', 'allowed', 'blocked'])
  filter?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CreateExceptionDto {
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsUUID()
  userId: string;

  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export class ExceptionsQueryDto extends CompanyQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsIn(['active', 'upcoming', 'expired', 'revoked', 'valid', 'all'])
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class RevokeExceptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CheckAccessQueryDto extends CompanyQueryDto {
  @IsUUID()
  userId: string;

  /** Instant à simuler (ISO). Vide = maintenant */
  @IsOptional()
  @IsDateString()
  at?: string;
}

export class CompaniesOverviewQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
