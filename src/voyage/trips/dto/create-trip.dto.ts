// dto/create-trip.dto.ts
import {
  IsUUID,
  IsDateString,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
  IsString,
  IsNumber,
  Min,
  ValidationArguments,
  registerDecorator,
  ValidationOptions,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ScheduleStatus } from 'src/voyage/vehicles/enum/schedule-status.enum';

// Validation personnalisée
function IsEitherSimpleOrSegments(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isEitherSimpleOrSegments',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const object = args.object as any;
          const hasSimple = object.schedule_id && object.vehicle_id;
          const hasSegments = object.segments && object.segments.length > 0;
          return (hasSimple || hasSegments) && !(hasSimple && hasSegments);
        },
        defaultMessage() {
          return 'Vous devez fournir soit schedule_id+vehicle_id (voyage simple), soit segments (voyage avec escales), mais pas les deux';
        },
      },
    });
  };
}

// DTO pour un segment (escale)
export class TripSegmentDto {
  @IsNumber()
  @Min(1)
  segment_order: number;

  @IsUUID()
  vehicle_id: string;

  @IsString()
  departure_city: string;

  @IsString()
  arrival_city: string;

  @IsDateString()
  departure_datetime: string;

  @IsDateString()
  estimated_arrival_datetime: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  distance_km?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimated_duration_minutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  segment_price?: number;
}

// DTO principal unifié
export class CreateTripDto {
  // ==================== CHAMPS POUR VOYAGE SIMPLE ====================
  @IsOptional()
  @IsUUID()
  schedule_id?: string;

  @IsOptional()
  @IsUUID()
  vehicle_id?: string;

  // ==================== CHAMPS COMMUNS ====================
  @IsDateString()
  departure_datetime: string;

  @IsOptional()
  @IsDateString()
  actual_departure_datetime?: string;

  @IsOptional()
  @IsDateString()
  actual_arrival_datetime?: string;

  @IsOptional()
  @IsEnum(ScheduleStatus)
  status?: ScheduleStatus;

  // ==================== CHAMPS POUR VOYAGE AVEC ESCALES ====================
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TripSegmentDto)
  segments?: TripSegmentDto[];

  // ==================== VALIDATION GLOBALE ====================
  @IsEitherSimpleOrSegments()
  dummy?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMealDto)
  meals?: CreateMealDto[];
}

export class CreateMealDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}