import {
    IsDateString,
    IsEnum,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    Min,
    ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OpportunityStage } from '../../common/enums/opportunity-stage.enum';

export class CreateOpportunityDto {
    @IsString()
    title: string;

    @IsOptional()
    @IsString()
    description?: string;

    @Type(() => Number)
    @IsNumber()
    amount: number;

    @IsOptional()
    @IsString()
    currency?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @Max(100)
    probability?: number;

    @IsOptional()
    @IsEnum(OpportunityStage)
    stage?: OpportunityStage;

    @IsOptional()
    @IsDateString()
    expectedCloseDate?: string;

    // ✅ Client (users.id)
    @IsOptional()
    @IsUUID()
    customerId?: string;

    // ✅ Prospect
    @IsOptional()
    @IsUUID()
    prospectId?: string;

    // ✅ Commercial assignéac
    @IsOptional()
    @IsUUID()
    assignedToId?: string;
}