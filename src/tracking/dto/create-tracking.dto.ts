import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryStatus } from 'src/delivery/enums/delivery.enum.status';

export class CreateTrackingDto {
    @ApiProperty({
        description: 'Statut de la livraison',
        enum: DeliveryStatus,
        example: DeliveryStatus.IN_TRANSIT,
    })
    @IsEnum(DeliveryStatus, { message: 'Le statut est invalide' })
    status: DeliveryStatus;

    @ApiPropertyOptional({
        description: 'Emplacement actuel (ex: coordonnées GPS ou nom de la ville)',
        example: 'Paris, France',
    })
    @IsOptional()
    @IsString()
    location?: string;

    @ApiPropertyOptional({
        description: 'Notes supplémentaires sur le statut',
        example: 'Le colis a été remis à un voisin',
    })
    @IsOptional()
    @IsString()
    notes?: string;

    @ApiProperty({
        description: 'ID de la livraison concernée',
        example: 'bd6d57ea-3034-4d6e-8b49-4a9e5c08a2a1',
    })

    deliveryId: string;

    @ApiProperty({
        description: 'ID du client lié au tracking',
        example: 'd3bb7e7e-52e4-4adf-933b-c8d1fcecf21e',
    })

    userId: string;
}
