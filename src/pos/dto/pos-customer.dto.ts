import { IsEmail, IsInt, IsOptional, IsString, Min } from 'class-validator';

/** Créer / modifier un client (id généré localement possible pour le offline) */
export class UpsertCustomerDto {
  @IsOptional() @IsString() id?: string;
  @IsString() name: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() userId?: string;
}

/** Recherche par nom OU téléphone (dans l'entreprise courante) */
export class CustomerSearchDto {
  /** Terme libre : cherché dans le nom ET le téléphone */
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) limit?: number;
}
