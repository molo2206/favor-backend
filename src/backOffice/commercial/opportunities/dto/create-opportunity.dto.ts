import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { OpportunityStage } from '../../common/enums/opportunity-stage.enum';

export class CreateOpportunityDto {
  @IsString() title: string;
  @IsOptional() @IsString() description?: string;
  @Type(() => Number) @IsNumber() amount: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) probability?: number;
  @IsOptional() @IsEnum(OpportunityStage) stage?: OpportunityStage;
  @IsOptional() @IsString() expectedCloseDate?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() prospectId?: string;
  @IsOptional() @IsString() assignedToId?: string;
}