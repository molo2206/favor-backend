import {
    IsString,
    IsOptional,
    IsEnum,
    IsUUID,
    MaxLength,
    MinLength,
} from 'class-validator';
import { PositionStatus } from '../entities/position.entity';

export class CreatePositionDto {
    @IsString()
    @MinLength(2)
    @MaxLength(255)
    name: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsEnum(PositionStatus)
    status?: PositionStatus;

    // ============================================================
    // 🔗 RELATIONS
    // ============================================================

    @IsOptional()
    @IsUUID()
    departmentId?: string;   // ✅ nouveau

    @IsOptional()
    @IsUUID()
    companyId?: string;      // ✅ conservé

    @IsOptional()
    @IsUUID()
    managerId?: string;      // ✅ nouveau (remplace commercialManagerId)
}