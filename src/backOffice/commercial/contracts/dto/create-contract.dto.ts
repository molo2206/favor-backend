import {
    IsBoolean,
    IsDateString,
    IsEnum,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ContractStatus } from '../../common/enums/contract-status.enum';

export class CreateContractDto {
    @IsString()
    type: string;

    @IsOptional()
    @IsString()
    reference?: string;

    @IsOptional()
    @IsEnum(ContractStatus)
    status?: ContractStatus;

    @IsOptional()
    @IsString()
    company?: string;

    @IsDateString()
    startDate: string;

    @IsOptional()
    @IsDateString()
    endDate?: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    amount?: number;

    @IsOptional()
    @IsString()
    currency?: string;

    @IsOptional()
    @IsString()
    terms?: string;

    @IsOptional()
    @IsString()
    documentUrl?: string;

    // ✅ metadata : accepte objet OU string JSON
    @IsOptional()
    @Transform(({ value }) => {
        if (value === null || value === undefined) return undefined;
        if (typeof value === 'object') return value;
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed === '') return undefined;
            try {
                return JSON.parse(trimmed);
            } catch {
                return undefined; // ou throw new BadRequestException
            }
        }
        return undefined;
    })
    @IsObject()
    metadata?: Record<string, any>;

    // Relations
    @IsOptional() @IsString() customerId?: string;
    @IsOptional() @IsString() prospectId?: string;
    @IsOptional() @IsString() managerId?: string;
    @IsOptional() @IsString() createdById?: string;
    @IsOptional() @IsString() approvedById?: string;

    @IsOptional() @IsDateString() approvedAt?: string;
    @IsOptional() @IsDateString() signedAt?: string;
    @IsOptional() @IsString() signedBy?: string;

    // ✅ autoRenew : gère "true"/"false" en string
    @IsOptional()
    @Transform(({ value }) => {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            return value.toLowerCase() === 'true' || value === '1';
        }
        return value;
    })
    @IsBoolean()
    autoRenew?: boolean;
}