import { IsUUID, IsNotEmpty } from 'class-validator';

export class CreateServiceHasPrestataireDto {
  @IsUUID()
  @IsNotEmpty()
  serviceId: string;

  @IsUUID()
  @IsNotEmpty()
  prestataireId: string;
}
