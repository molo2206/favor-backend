import { IsNotEmpty, IsString } from 'class-validator';

export class CreatePlatformDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @IsString()
  @IsNotEmpty()
  name: string;
}
