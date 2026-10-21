import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @IsNotEmpty({ message: 'Le token est requis.' })
  @IsString({ message: 'Le token doit être une chaîne de caractères.' })
  refreshToken: string;
}
