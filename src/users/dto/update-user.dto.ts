// dto/update-user-image.dto.ts
import { IsOptional, IsString } from 'class-validator';

export class UpdateUserImageDto {
  @IsOptional()
  @IsString()
  image?: string;
 
}
