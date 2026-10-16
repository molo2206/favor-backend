import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsBoolean,
    IsUUID,
    IsIn,
    IsInt,
    Min,
    Max,
    IsDateString,
    MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SendSmsToClientsDto {
    /**
     * ✅ OBLIGATOIRE : contenu du SMS
     */
    @IsString()
    @IsNotEmpty()
    @MaxLength(500, {
        message: 'Le message ne doit pas dépasser 500 caractères',
    })
    message: string;

    /**
     * Type de ciblage (uniquement si on ne cible pas un user spécifique ni tous)
     */
    @IsOptional()
    @IsIn(['SHIPMENT', 'ORDER', 'VEHICLE_RESERVATION', 'HOTEL_RESERVATION'], {
        message:
            'type doit être SHIPMENT, ORDER, VEHICLE_RESERVATION ou HOTEL_RESERVATION',
    })
    type?: 'SHIPMENT' | 'ORDER' | 'VEHICLE_RESERVATION' | 'HOTEL_RESERVATION';

    /**
     * ID de la company de shipping (obligatoire si type = SHIPMENT)
     */
    @IsOptional()
    @IsUUID('4')
    @IsRequiredIf('type', { message: 'shippingCompanyId est obligatoire quand type = SHIPMENT' })
    shippingCompanyId?: string;

    /**
     * Ville (filtre)
     */
    @IsOptional()
    @IsString()
    city?: string;

    /**
     * Pays (filtre)
     */
    @IsOptional()
    @IsString()
    country?: string;

    /**
     * Recherche texte (nom / email / phone)
     */
    @IsOptional()
    @IsString()
    search?: string;

    /**
     * ✅ OPTIONNEL : envoyer à UN utilisateur précis
     * Priorité absolue sur les autres filtres.
     */
    @IsOptional()
    @IsUUID('4', { message: 'userId doit être un UUID valide' })
    userId?: string;

    /**
     * ✅ OPTIONNEL : envoyer à TOUS les utilisateurs actifs de la plateforme
     * Ignoré si `userId` est fourni.
     */
    @IsOptional()
    @IsBoolean()
    @Type(() => Boolean)
    sendToAll?: boolean;

    /**
     * Date de début (filtre période)
     */
    @IsOptional()
    @IsDateString({}, { message: 'startDate doit être une date ISO valide' })
    startDate?: string;

    /**
     * Date de fin (filtre période)
     */
    @IsOptional()
    @IsDateString({}, { message: 'endDate doit être une date ISO valide' })
    endDate?: string;

    /**
     * Taille des lots (défaut 10, max 50)
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    batchSize?: number;

    /**
     * Délai entre les lots (ms), défaut 200
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    delayBetweenBatchesMs?: number;
}

function IsRequiredIf(arg0: string, arg1: { message: string; }): (target: SendSmsToClientsDto, propertyKey: "shippingCompanyId") => void {
    throw new Error('Function not implemented.');
}
