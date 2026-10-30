import { IsNotEmpty, Matches } from 'class-validator';

export class Verify2FADto {
  @IsNotEmpty()
  @Matches(/^\d{6}$/, { message: 'Le code doit contenir exactement 6 chiffres.' })
  token: string;
}
