import { IsUUID, IsOptional, IsString } from 'class-validator';

export class CreatePartnerDto {
  @IsUUID()
  partnerCompanyId: string; // ID de l’entreprise partenaire

  @IsOptional()
  @IsString()
  notes?: string;
}
