// src/voyage/meals/dto/create-meal.dto.ts
import { IsString, IsOptional, IsNumber, IsBoolean, Min } from 'class-validator';

export class CreateMealDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}