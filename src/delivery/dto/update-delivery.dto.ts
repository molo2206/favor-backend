import { PartialType } from '@nestjs/swagger';
import { CreateDeliveryDto } from './create-delivery.dto';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryStatus } from '../enums/delivery.enum.status';

export class UpdateDeliveryDto extends PartialType(CreateDeliveryDto) {
    @ApiPropertyOptional({ enum: DeliveryStatus, description: 'Nouveau statut de la livraison' })
    @IsOptional()
    @IsEnum(DeliveryStatus)
    status?: DeliveryStatus;

    @ApiPropertyOptional({ description: 'Nouvelle position GPS ou adresse actuelle du colis' })
    @IsOptional()
    @IsString()
    location?: string;

    @ApiPropertyOptional({ description: 'Nouvelles notes ou remarques pour la livraison' })
    @IsOptional()
    @IsString()
    notes?: string;
}
