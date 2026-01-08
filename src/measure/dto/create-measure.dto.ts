import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateMeasureDto 
{
    @IsString()
    @IsNotEmpty({ message: 'Le nom de l’unité de mesure est requis' })
    @MaxLength(100, { message: 'Le nom ne peut pas dépasser 100 caractères' })
    name: string;

    @IsNotEmpty()
    @IsString()
    abbreviation: string;
}
